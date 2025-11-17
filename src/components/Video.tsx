"use client";

import React, { Suspense, useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "./ErrorFallback";
import { fetchVideoDetails } from "@/hooks/apiHooks";
import LoadingSpinner from "./LoadingSpinner";
import { VideoProps, VideoDetails } from "@/types";
import Hls from "hls.js";

// HLS Video Player Component
interface HLSVideoPlayerProps {
  videoUrl: string;
  className?: string;
}

const HLSVideoPlayer: React.FC<HLSVideoPlayerProps> = ({
  videoUrl,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    setIsVideoReady(false);

    // Add video click handler
    const handleVideoClick = (e: Event) => {
      if (video.paused) {
        video.play().catch((err) => {
          console.error("Video play error:", err);
        });
      } else {
        video.pause();
      }
    };

    // Add video ready event listeners
    const handleCanPlay = () => {
      setIsVideoReady(true);
    };

    video.addEventListener("click", handleVideoClick);

    video.addEventListener("canplay", handleCanPlay);

    // Check if HLS is supported natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsVideoReady(true);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    }

    return () => {
      video.removeEventListener("click", handleVideoClick);
      video.removeEventListener("canplay", handleCanPlay);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl]);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        zIndex: 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Loading Spinner - shown until video is ready */}
      {!isVideoReady && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-[32px]"
          style={{ zIndex: 3 }}
        >
          <LoadingSpinner />
        </div>
      )}

      <video
        ref={videoRef}
        controls
        preload="metadata"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          cursor: "pointer",
          position: "relative",
          zIndex: 2,
          pointerEvents: "auto",
          opacity: isVideoReady ? 1 : 0,
        }}
        onError={(e) => {
          console.error("Video error:", e);
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      />
    </div>
  );
};

interface EnhancedVideoProps extends VideoProps {
  confidenceLabel?: string;
  confidenceColor?: "green" | "yellow" | "red";
  timeRange?: { start: string; end: string };
  disablePlayback?: boolean;
  size?: "small" | "medium" | "large";
  showPlayer?: boolean;
  showCreatorTag?: boolean;
  showBrandTag?: boolean;
}

const Video: React.FC<EnhancedVideoProps> = ({
  videoId,
  indexId,
  showTitle = true,
  videoDetails: providedVideoDetails,
  onPlay,
  confidenceLabel,
  confidenceColor,
  timeRange,
  disablePlayback = false,
  size = "medium",
  showPlayer = false,
  showCreatorTag = false,
  showBrandTag = false,
}) => {
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
    enabled: !!indexId && !!videoId && !providedVideoDetails,
  });

  const finalVideoDetails = providedVideoDetails || videoDetails;

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0"),
    ].join(":");
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

  // Get size classes based on size prop
  const getSizeClasses = () => {
    switch (size) {
      case "small":
        return "w-48 h-28";
      case "large":
        return "w-full max-w-2xl h-80";
      case "medium":
      default:
        return "w-64 h-36";
    }
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<div className={getSizeClasses()}><LoadingSpinner /></div>}>
        <div className="flex flex-col items-center relative">
          {/* Video Player or Thumbnail */}
          <div
            className={`${getSizeClasses()} relative rounded-[32px] overflow-hidden`}
            onClick={(e) => {
              // Only handle click if not showing player and playback is not disabled
              if (!disablePlayback && !showPlayer && onPlay) {
                e.stopPropagation();
                onPlay();
              }
            }}
            style={{
              cursor: showPlayer
                ? "default"
                : !disablePlayback
                ? "pointer"
                : "default",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            {showPlayer && finalVideoDetails?.hls?.video_url ? (
              <HLSVideoPlayer
                videoUrl={finalVideoDetails.hls.video_url}
                className="absolute inset-0 w-full h-full z-0"
              />
            ) : (
              <div className="absolute inset-0">
                <img
                  src={
                    finalVideoDetails?.hls?.thumbnail_urls?.[0] ||
                    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNDAgODBMMTYwIDEwMEgxNDBWODBaIiBmaWxsPSIjOUI5QjlCIi8+CjxwYXRoIGQ9Ik0xNDAgODBMMTIwIDEwMEgxNDBWODBaIiBmaWxsPSIjOUI5QjlCIi8+Cjwvc3ZnPgo="
                  }
                  className="object-cover w-full h-full"
                  alt="thumbnail"
                  onError={(e) => {
                    console.warn("Thumbnail failed to load, using placeholder");
                    e.currentTarget.src =
                      "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNDAgODBMMTYwIDEwMEgxNDBWODBaIiBmaWxsPSIjOUI5QjlCIi8+CjxwYXRoIGQ9Ik0xNDAgODBMMTIwIDEwMEgxNDBWODBaIiBmaWxsPSIjOUI5QjlCIi8+Cjwvc3ZnPgo=";
                  }}
                />
              </div>
            )}

            {/* Time range or duration indicator */}
            {!showPlayer &&
              (timeRange ? (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1] bg-black/5 rounded">
                  <div className="p-1 rounded outline outline-1 outline-zinc-100 justify-start items-center gap-2">
                    <div className="justify-start text-zinc-100 text-xs font-semibold uppercase leading-tight tracking-tight">
                      {timeRange.start} - {timeRange.end}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1] bg-black/5 rounded">
                  <div className="p-1 rounded outline outline-1 outline-zinc-100 justify-start items-center gap-2">
                    <div className="justify-start text-zinc-100 text-xs font-semibold uppercase leading-tight tracking-tight">
                      {formatDuration(
                        finalVideoDetails?.system_metadata?.duration ?? 0
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Overlay Labels - positioned outside video container */}
          {/* Score Label - positioned at top-right */}
          {confidenceLabel && (
            <div className="absolute top-4 right-6 z-50">
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

          {/* Creator Tag Overlay - positioned at top-left */}
          {showCreatorTag && getCreatorName(finalVideoDetails) && (
            <div className="absolute top-4 left-6 z-50">
              <span className="px-1 py-0.5 outline outline-white outline-1 uppercase text-xs text-white rounded-md font-['Milling'] font-normal border-1 border-white backdrop-blur-[20px]">
                {getCreatorName(finalVideoDetails)}
              </span>
            </div>
          )}

          {/* Brand Tag Overlay - positioned at top-left */}
          {showBrandTag && getBrandName(finalVideoDetails) && (
            <div className="absolute top-4 left-6 z-50 test">
              <span className="px-1 py-0.5 outline outline-white outline-1 uppercase text-xs text-white rounded-md font-['Milling'] font-normal border-1 border-white backdrop-blur-[20px]">
                {getBrandName(finalVideoDetails)}
              </span>
            </div>
          )}

          {/* Video Title */}
          {showTitle && (
            <div className="mt-2 px-2 w-full">
              <div className="text-gray-900 text-sm font-normal leading-tight text-center">
                {finalVideoDetails?.system_metadata?.filename ||
                  finalVideoDetails?.system_metadata?.video_title}
              </div>
            </div>
          )}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
};

export default Video;
