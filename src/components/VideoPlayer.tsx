"use client";

import { fetchVideoDetails } from "@/hooks/apiHooks";
import { VideoDetails, VideoProps } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import {
  CollapseIcon,
  ExpandIcon,
  PauseIcon,
  PlayIcon,
  VolumeOffIcon,
  VolumeUpIcon,
} from "./icons";

interface VideoPlayerProps extends VideoProps {
  className?: string;
  autoplay?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayerReady?: (player: { seekTo: (time: number) => void }) => void;
  onReadyChange?: (ready: boolean) => void;
  initialMuted?: boolean;
  seekStart?: number;
  seekEnd?: number;
  confidenceLabel?: string;
  confidenceColor?: "green" | "yellow" | "red";
  showCreatorTag?: boolean;
  showBrandTag?: boolean;
  videoUrl?: string;
  startTime?: number;
  endTime?: number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoId,
  indexId,
  className,
  autoplay,
  initialMuted,
  onTimeUpdate,
  onPlayerReady,
  confidenceColor,
  confidenceLabel,
  showBrandTag,
  showCreatorTag,
  videoUrl,
  startTime,
  endTime,
}) => {
  const playerRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [playing, setPlaying] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(initialMuted || false); // Start muted for autoplay compatibility
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [ended, setEnded] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<number>(0);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const shouldLoopSegment =
    startTime != null && endTime != null && endTime > startTime;

  // reset the previous states
  useEffect(() => {
    setIsVideoReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setLoaded(0);
    setEnded(false);
  }, [videoUrl, videoId]);

  const {
    data: videoDetails,
    isLoading,
    error,
  } = useQuery<VideoDetails, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => {
      if (!videoId) {
        throw new Error("Video ID is missing");
      }
      return fetchVideoDetails(videoId!, indexId);
    },
    enabled: !!indexId && !!videoId,
  });

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    let time = video.currentTime ?? 0;

    if (shouldLoopSegment && endTime != null && startTime != null) {
      // Use a small buffer so floating point rounding does not stop the loop
      if (time >= endTime - 0.05) {
        try {
          video.currentTime = startTime;
          time = startTime;
        } catch (err) {
          console.error("Failed to loop between start and end time", err);
        }
        setEnded(false);
        if (!playing) {
          setPlaying(true);
        }
      }
    }

    setCurrentTime(time);
    onTimeUpdate?.(time);
  };

  const handleProgress = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (!video.duration) return;

    const { buffered, duration } = video;
    if (buffered.length === 0) return;

    const loadedSeconds = buffered.end(buffered.length - 1);
    setLoaded(Math.min(loadedSeconds / duration, 1));
  };
  // // Nudge to the requested start time whenever the source or start value changes
  // useEffect(() => {
  //   if (startTime == null) return;
  //   const video = playerRef.current;
  //   if (!video) return;

  //   const timer = setTimeout(() => {
  //     try {
  //       video.currentTime = startTime;
  //     } catch (err) {
  //       console.error("Failed to seek to startTime", err);
  //     }
  //   }, 100);

  //   return () => clearTimeout(timer);
  // }, [startTime, videoUrl]);
  // Seek to startTime when metadata is available or when startTime changes
  useEffect(() => {
    if (!isVideoReady) return;
    if (startTime == null) return;
    const video = playerRef.current;
    if (!video) return;

    const timer = setTimeout(() => {
      try {
        video.currentTime = startTime;
      } catch (err) {
        console.error("Failed to seek to startTime", err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isVideoReady, startTime, videoUrl]);

  // Handle video ready
  const handleReady = () => {
    const videoElement = playerRef.current;
    setIsVideoReady(true);

    if (videoElement && startTime != null) {
      try {
        videoElement.currentTime = startTime;
      } catch (err) {
        console.error("Failed to set start time on ready", err);
      }
    }

    if (autoplay) {
      setPlaying(true);
    }

    if (onPlayerReady && videoElement) {
      onPlayerReady({
        seekTo: (time: number) => {
          if (playerRef.current) {
            playerRef.current.currentTime = time;
          }
        },
      });
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current || !playerContainerRef.current) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const seekTime = duration * clickPosition;

    playerRef.current.currentTime = seekTime;
  };

  const togglePlayPause = () => {
    const newPlayingState = !playing;

    if (newPlayingState) {
      // Playing - just play without changing mute state
      setPlaying(true);
    } else {
      // Pausing - just pause
      setPlaying(false);
    }
  };

  // Format time for display (mm:ss)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Handle mute/unmute toggle
  const toggleMute = () => {
    const newMutedState = !muted;

    if (newMutedState) {
      // Muting - just change mute state
      setMuted(true);
    } else {
      // Unmuting - need to handle autoplay policy
      if (!playing) {
        // If video is not playing, start it muted first, then unmute
        setMuted(false);
        setPlaying(true);
      } else {
        // If video is already playing, just unmute
        setMuted(false);
      }
    }
  };

  const toggleExpand = () => {
    if (!playerContainerRef.current) return;

    if (!document.fullscreenElement) {
      // Enter fullscreen
      playerContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
    } else {
      // Exit fullscreen
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((err) => {
          console.error("Error attempting to exit fullscreen:", err);
        });
    }
  };

  // Show/hide controls when hovering over video
  const handleMouseEnter = () => {
    setIsHovering(true);
    setControlsVisible(true);

    // Clear any existing timeout
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);

    // Clear any existing timeout
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }

    // Hide controls after a delay if video is playing
    if (playing) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2000);
    } else {
      // Hide immediately if video is paused
      setControlsVisible(false);
    }
  };

  // Extract creator name from user_metadata
  const getCreatorName = (
    videoData: VideoDetails | undefined
  ): string | null => {
    if (!videoData || !videoData.user_metadata) return null;

    const creator =
      videoData.user_metadata.creator ||
      videoData.user_metadata.video_creator ||
      videoData.user_metadata.creator_id;

    if (creator && typeof creator === "string" && creator.trim().length > 0) {
      return creator.trim();
    }

    return null;
  };

  // Extract brand name from user_metadata
  const getBrandName = (videoData: VideoDetails | undefined): string | null => {
    if (!videoData || !videoData.user_metadata) return null;

    try {
      // Extract first brand from brand_product_events
      if (videoData.user_metadata.brand_product_events) {
        const events = JSON.parse(
          videoData.user_metadata.brand_product_events as string
        ) as unknown[];
        if (Array.isArray(events) && events.length > 0) {
          const firstEvent = events[0];
          if (
            firstEvent &&
            typeof firstEvent === "object" &&
            "brand" in firstEvent &&
            typeof (firstEvent as { brand: unknown }).brand === "string"
          ) {
            const brand = String(
              (firstEvent as { brand: string }).brand
            ).trim();
            if (brand.length > 0) {
              return brand;
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to parse brand_product_events:", error);
    }

    // Fallback: use brand_override if available
    const override = (
      videoData.user_metadata as unknown as Record<string, unknown>
    )?.brand_override;
    if (typeof override === "string") {
      const trimmed = override.trim();
      if (trimmed.length > 0) return trimmed;
    }

    return null;
  };

  return (
    <div
      ref={playerContainerRef}
      className={`${className} relative overflow-hidden w-full aspect-video`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ReactPlayer
        width="100%"
        height="100%"
        ref={playerRef}
        src={videoUrl ?? videoDetails?.hls?.video_url}
        playing={playing}
        muted={muted}
        volume={muted ? 0 : 1}
        controls={false}
        onProgress={handleProgress}
        onPause={() => {
          setPlaying(false);
        }}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
        }}
        onEnded={(event) => {
          if (shouldLoopSegment && startTime != null) {
            try {
              event.currentTarget.currentTime = startTime;
            } catch (err) {
              console.error("Failed to reset to startTime on ended", err);
            }
            setEnded(false);
            setPlaying(true);
            return;
          }
          setEnded(true);
          setPlaying(false);
        }}
        onError={(error) => {
          console.error("Video player error:", error);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={handleTimeUpdate}
        onReady={handleReady}
        crossOrigin="anonymous"
        controlsList="nodownload"
        playsInline
      />
      <div
        className={`video-controls absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-6 pb-2 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div
          className="w-full h-2 bg-[#F4F3F399] rounded-lg mb-1 cursor-pointer overflow-hidden relative"
          onClick={handleProgressBarClick}
        >
          {/* Buffer indicator */}
          <div
            className="absolute top-0 left-0 h-full bg-[#F4F3F366] transition-all duration-100"
            style={{ width: `${Math.min(loaded * 100, 100)}%` }}
          ></div>
          {/* Progress indicator */}
          <div
            className="absolute top-0 left-0 h-full bg-[#F4F3F3] transition-all duration-100"
            style={{
              width: ended
                ? "100%"
                : `${Math.min((currentTime / duration) * 100, 100)}%`,
            }}
          ></div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={togglePlayPause}
              className="w-6 h-6 flex items-center justify-center hover:bg-white/30 transition-colors"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              onClick={toggleMute}
              className="w-6 h-6 flex items-center justify-center hover:bg-white/30 transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
            </button>
            <span
              className="text-white font-ibm-plex-mono font-medium"
              style={{
                fontSize: "12px",
                lineHeight: "16px",
                letterSpacing: "0",
              }}
            >
              {formatTime(ended ? duration : currentTime)} /{" "}
              {formatTime(duration)}
            </span>
          </div>

          <div>
            <button
              onClick={toggleExpand}
              className="w-6 h-6 flex items-center justify-center hover:bg-white/30 transition-colors"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          </div>
        </div>
      </div>
      {/* CREATOR NAME TAG */}
      {showCreatorTag && getCreatorName(videoDetails) && (
        <div className="absolute top-4 left-6 z-10 h-[20px]">
          <span className="px-1 py-0.5 outline outline-white outline-1 uppercase text-xs text-white rounded-md font-['Milling'] font-normal border-1 border-white backdrop-blur-[20px]">
            {getCreatorName(videoDetails)}
          </span>
        </div>
      )}
      {/* BRAND NAME TAG */}
      {showBrandTag && getBrandName(videoDetails) && (
        <div className="absolute top-4 left-6 z-10 h-[20px]">
          <span className="px-1 py-0.5 outline outline-white outline-1 uppercase text-xs text-white rounded-md font-['Milling'] font-normal border-1 border-white backdrop-blur-[20px]">
            {getBrandName(videoDetails)}
          </span>
        </div>
      )}
      {/* Score Label - positioned at top-right */}
      {confidenceLabel && (
        <div className="absolute top-4 right-6 z-50 h-[20px]">
          <div
            className="px-1 rounded-md border border-[]"
            style={{
              backgroundColor:
                confidenceColor === "green"
                  ? "#30710d"
                  : confidenceColor === "yellow"
                  ? "#FABA17"
                  : confidenceColor === "red"
                  ? "#45423F"
                  : "#30710d",
              borderColor:
                confidenceColor === "green"
                  ? "#BFF3A4"
                  : confidenceColor === "yellow"
                  ? "#FDE3A2"
                  : confidenceColor === "red"
                  ? "#ECECEC"
                  : "#BFF3A4",
            }}
          >
            <p
              className="text-xs font-normal uppercase"
              style={{
                color:
                  confidenceColor === "green"
                    ? "#BFF3A4"
                    : confidenceColor === "yellow"
                    ? "#7D5D0C"
                    : confidenceColor === "red"
                    ? "#ECECEC"
                    : "#BFF3A4",
              }}
            >
              {confidenceLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
