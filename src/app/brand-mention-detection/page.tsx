"use client";

import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import clsx from "clsx";
import { VideoData } from "@/types";
import { ProductEvent } from "@/types/brandMentions";
import { aggregatePerVideo, aggregateLibrary } from "@/utils/heatmap";
import Heatmap from "@/components/Heatmap";
import VideoModalSimple from "@/components/VideoModalSimple";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorFallback from "@/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import {
  ArrowLeftIcon,
  HorizontalIcon,
  ResetAllIcon,
  VerticalIcon,
} from "@/components/icons";

// Number of time buckets for heatmap visualization
const NUM_BUCKETS = 50; // Increased for better granularity

// Minimal shape we read from analysis payload
type VideoAnalysis = {
  tones?: string[];
  styles?: string[];
  creator?: string;
  // allow forward-compat extra data
  [key: string]: unknown;
};

export default function BrandMentionDetectionPage() {
  // Environment variables
  const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID || "";
  // Optional description content for the page (not provided via props in App Router)
  const description: string | undefined = undefined;

  // Video and event data
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [eventsByVideo, setEventsByVideo] = useState<
    Record<string, ProductEvent[]>
  >({});
  const [analysisByVideo, setAnalysisByVideo] = useState<
    Record<string, VideoAnalysis>
  >({});
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>(
    {}
  );

  // Filters
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<
    ("vertical" | "horizontal")[]
  >([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [durationThreshold, setDurationThreshold] = useState<number>(0.5); // seconds
  const [timeWindow, setTimeWindow] = useState<{
    start: number;
    end: number | null;
  }>({ start: 0, end: null });

  // UI state
  const [viewMode, setViewMode] = useState<"library" | "per-video">("library");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEventsLoading, setIsEventsLoading] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingCreator, setIsEditingCreator] = useState<boolean>(false);
  const [editingCreator, setEditingCreator] = useState<string>("");
  const [isUpdatingCreator, setIsUpdatingCreator] = useState<boolean>(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false);

  // Modal state
  const [modalVideo, setModalVideo] = useState<{
    videoId: string;
    videoUrl: string;
    title: string;
    start: number;
    end: number;
    description?: string;
    location?: string;
  } | null>(null);

  // Derived data
  const availableCreators = useMemo(() => {
    const creators = new Set<string>();
    videos.forEach((video) => {
      const creator =
        video.user_metadata?.creator ||
        video.user_metadata?.video_creator ||
        video.user_metadata?.creator_id ||
        "Unknown";
      creators.add(creator.toString());
    });
    return Array.from(creators).sort();
  }, [videos]);

  const availableFormats = useMemo(() => {
    const formats = new Set<"vertical" | "horizontal">();
    videos.forEach((video) => {
      if (video.system_metadata?.width && video.system_metadata?.height) {
        const format =
          video.system_metadata.width >= video.system_metadata.height
            ? "horizontal"
            : "vertical";
        formats.add(format);
      }
    });
    return Array.from(formats);
  }, [videos]);

  const availableStyles = useMemo(() => {
    const styles = new Set<string>();
    Object.values(analysisByVideo).forEach((analysis) => {
      if (analysis.styles) {
        analysis.styles.forEach((style) => styles.add(style));
      }
    });
    return Array.from(styles).sort();
  }, [analysisByVideo]);

  const availableTones = useMemo(() => {
    const tones = new Set<string>();
    Object.values(analysisByVideo).forEach((analysis) => {
      if (analysis.tones) {
        analysis.tones.forEach((tone) => tones.add(tone));
      }
    });
    return Array.from(tones).sort();
  }, [analysisByVideo]);

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    Object.values(eventsByVideo)
      .flat()
      .forEach((event) => {
        brands.add(event.brand);
      });
    return Array.from(brands).sort();
  }, [eventsByVideo]);

  // Filtered videos based on selected filters
  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const creator =
        video.user_metadata?.creator ||
        video.user_metadata?.video_creator ||
        video.user_metadata?.creator_id ||
        "Unknown";

      // Filter by creator
      if (selectedCreators.length > 0) {
        if (!selectedCreators.includes(creator.toString())) {
          return false;
        }
      }

      // Filter by format
      if (selectedFormats.length > 0) {
        if (video.system_metadata?.width && video.system_metadata?.height) {
          const format =
            video.system_metadata.width >= video.system_metadata.height
              ? "horizontal"
              : "vertical";
          if (!selectedFormats.includes(format)) {
            return false;
          }
        } else if (selectedFormats.length > 0) {
          // If we can't determine format but formats are selected, exclude
          return false;
        }
      }

      // Filter by styles
      if (selectedStyles.length > 0) {
        const videoAnalysis = analysisByVideo[video._id];
        const videoStyles = videoAnalysis?.styles || [];
        const hasMatchingStyle = selectedStyles.some((style) =>
          videoStyles.includes(style)
        );
        if (!hasMatchingStyle) {
          return false;
        }
      }

      // Filter by tones
      if (selectedTones.length > 0) {
        const videoAnalysis = analysisByVideo[video._id];
        const videoTones = videoAnalysis?.tones || [];
        const hasMatchingTone = selectedTones.some((tone) =>
          videoTones.includes(tone)
        );
        if (!hasMatchingTone) {
          return false;
        }
      }

      // Filter by brands - only show videos that have events with selected brands
      if (selectedBrands.length > 0) {
        const videoEvents = eventsByVideo[video._id] || [];
        const hasMatchingBrand = videoEvents.some((event) =>
          selectedBrands.includes(event.brand)
        );
        if (!hasMatchingBrand) {
          return false;
        }
      }

      return true;
    });
  }, [
    videos,
    selectedCreators,
    selectedFormats,
    selectedStyles,
    selectedTones,
    selectedBrands,
    analysisByVideo,
    eventsByVideo,
  ]);

  // Filtered events based on selected filters and thresholds
  const filteredEvents = useMemo(() => {
    const result: Record<string, ProductEvent[]> = {};

    Object.entries(eventsByVideo).forEach(([videoId, events]) => {
      // Skip if video is not in filtered videos
      if (!filteredVideos.some((v) => v._id === videoId)) {
        return;
      }

      // Apply filters to events
      const filtered = events.filter((event) => {
        // Filter by brand (only if brands are selected)
        if (
          selectedBrands.length > 0 &&
          !selectedBrands.includes(event.brand)
        ) {
          return false;
        }

        // Filter by duration threshold
        const duration = event.timeline_end - event.timeline_start;
        if (duration < durationThreshold) {
          return false;
        }

        // Filter by time window
        if (timeWindow.start > 0 && event.timeline_end < timeWindow.start) {
          return false;
        }
        if (timeWindow.end !== null && event.timeline_start > timeWindow.end) {
          return false;
        }

        return true;
      });

      if (filtered.length > 0) {
        result[videoId] = filtered;
      }
    });

    return result;
  }, [
    eventsByVideo,
    filteredVideos,
    selectedBrands,
    durationThreshold,
    timeWindow,
  ]);

  // Fetch videos on mount
  useEffect(() => {
    async function fetchVideos() {
      if (!creatorIndexId) {
        setError("Creator index ID is not configured");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await axios.get("/api/videos", {
          params: {
            index_id: creatorIndexId,
            limit: 24,
            page: 1,
          },
        });

        if (response.data && Array.isArray(response.data.data)) {
          setVideos(response.data.data);

          // Extract durations
          const durations: Record<string, number> = {};
          response.data.data.forEach((video: VideoData) => {
            if (video.system_metadata?.duration) {
              durations[video._id] = video.system_metadata.duration;
            }
          });
          setVideoDurations(durations);

          // Fetch events for all videos
          await fetchEventsForVideos(
            response.data.data.map((v: VideoData) => v._id)
          );
        }
      } catch (error) {
        console.error("Error fetching videos:", error);
        setError("Failed to fetch videos. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorIndexId]);

  // Fetch events for multiple videos
  async function fetchEventsForVideos(videoIds: string[]) {
    if (!creatorIndexId || videoIds.length === 0) return;

    setIsEventsLoading(true);

    try {
      const response = await axios.post("/api/brand-mentions/events", {
        videoIds,
        indexId: creatorIndexId,
      });

      if (response.data && response.data.results) {
        const newEvents: Record<string, ProductEvent[]> = {};
        const newAnalysis: Record<string, VideoAnalysis> = {};

        const results = response.data.results as Record<
          string,
          { events?: ProductEvent[]; analysis?: VideoAnalysis }
        >;

        Object.entries(results).forEach(([videoId, result]) => {
          newEvents[videoId] = result.events ?? [];
          newAnalysis[videoId] = result.analysis ?? {};
        });

        setEventsByVideo((prevEvents) => ({
          ...prevEvents,
          ...newEvents,
        }));

        setAnalysisByVideo((prevAnalysis) => ({
          ...prevAnalysis,
          ...newAnalysis,
        }));
      }
    } catch (error) {
      console.error("Error fetching brand mention events:", error);
      // Don't set global error, just log it
    } finally {
      setIsEventsLoading(false);
    }
  }

  // Fetch events for a single video
  async function fetchEventsForVideo(videoId: string) {
    if (!creatorIndexId) return;

    setIsEventsLoading(true);

    try {
      const response = await axios.get("/api/brand-mentions/events", {
        params: {
          videoId,
          indexId: creatorIndexId,
          force: true, // Force reanalysis to get fresh data
        },
      });

      if (response.data && response.data.events) {
        setEventsByVideo((prevEvents) => ({
          ...prevEvents,
          [videoId]: response.data.events,
        }));

        if (response.data.analysis) {
          setAnalysisByVideo((prevAnalysis) => ({
            ...prevAnalysis,
            [videoId]: response.data.analysis as VideoAnalysis,
          }));
        }
      }
    } catch (error) {
      console.error(`Error fetching events for video ${videoId}:`, error);
      // Don't set global error, just log it
    } finally {
      setIsEventsLoading(false);
    }
  }

  // Update creator for a video
  async function updateVideoCreator(videoId: string, newCreator: string) {
    if (!creatorIndexId) {
      console.error("❌ No creator index ID available");
      setError("Creator index ID is not configured");
      return;
    }

    setIsUpdatingCreator(true);

    try {
      const requestPayload = {
        videoId,
        indexId: creatorIndexId,
        user_metadata: {
          creator: newCreator,
        },
      };

      const response = await axios.put(
        "/api/videos/updateUserMetadata",
        requestPayload,
        {
          timeout: 30000, // 30 second timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.data.success) {
        // Update local state
        setAnalysisByVideo((prevAnalysis) => {
          const currentAnalysis = prevAnalysis[videoId] || {};
          const updated = {
            ...prevAnalysis,
            [videoId]: {
              ...currentAnalysis,
              creator: newCreator,
            },
          };
          return updated;
        });

        // Update videos array as well
        setVideos((prevVideos) => {
          const updated = prevVideos.map((video) =>
            video._id === videoId
              ? {
                  ...video,
                  user_metadata: {
                    ...video.user_metadata,
                    creator: newCreator,
                  },
                }
              : video
          );
          return updated;
        });

        setIsEditingCreator(false);
        setEditingCreator("");
      } else {
        console.error(`❌ API response indicates failure:`, response.data);
        setError(
          `Failed to update creator: ${response.data?.error || "Unknown error"}`
        );
      }
    } catch (error) {
      console.error(`❌ Error updating creator for video ${videoId}:`, error);
      if (axios.isAxiosError(error)) {
        console.error(`❌ Axios error details:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        setError(
          `Failed to update creator: ${
            error.response?.data?.error || error.message
          }`
        );
      } else {
        setError(
          `Failed to update creator: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    } finally {
      setIsUpdatingCreator(false);
    }
  }

  // (Removed) createEventBasedBuckets: not used

  // Handle cell click in heatmap
  function handleHeatmapCellClick(rowId: string, colIndex: number) {
    if (viewMode === "library") {
      // In library view, rowId is the videoId
      setSelectedVideoId(rowId);
      setViewMode("per-video");
      return;
    }

    // In per-video view, rowId is the brand
    const video = videos.find((v) => v._id === selectedVideoId);
    if (!video || !video.hls?.video_url) return;

    const events = eventsByVideo[selectedVideoId!] || [];
    const normalizedRowId = (rowId || "").toString().trim().toLowerCase();
    let brandEvents = events.filter(
      (e) => (e.brand || "").toString().trim().toLowerCase() === normalizedRowId
    );
    // Fallback: try loose matching if strict match found nothing (handles minor label mismatches)
    if (brandEvents.length === 0) {
      brandEvents = events.filter((e) => {
        const brand = (e.brand || "").toString().toLowerCase();
        const product = (e.product_name || "").toString().toLowerCase();
        return (
          brand.includes(normalizedRowId) ||
          normalizedRowId.includes(brand) ||
          product.includes(normalizedRowId)
        );
      });
    }
    if (brandEvents.length === 0) return;

    // Find the event that corresponds to this column
    const duration = videoDurations[selectedVideoId!] || 0;
    if (duration <= 0) return;

    // Find the event that was actually assigned to this colIndex bucket in the heatmap
    // Use the same logic as heatmap generation to ensure consistency

    // Recreate the bucket structure used in heatmap generation
    const bucketDurationSec = duration / NUM_BUCKETS;
    const buckets = Array.from({ length: NUM_BUCKETS }, (_, i) => ({
      startSec: i * bucketDurationSec,
      endSec: (i + 1) * bucketDurationSec,
      startPct: ((i * bucketDurationSec) / duration) * 100,
      endPct: (((i + 1) * bucketDurationSec) / duration) * 100,
    }));

    // Use the EXACT same logic as heatmap generation to find which event was assigned to this bucket
    // First, create the event-to-bucket mapping exactly like in heatmap.ts
    const eventToBucketMap = new Map<number, number>(); // eventIndex -> bucketIndex

    brandEvents.forEach((event, eventIndex) => {
      let bestBucketIndex = -1;
      let bestOverlap = 0;

      buckets.forEach((bucket, bucketIndex) => {
        const overlap = Math.max(
          0,
          Math.min(event.timeline_end, bucket.endSec) -
            Math.max(event.timeline_start, bucket.startSec)
        );

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestBucketIndex = bucketIndex;
        }
      });

      if (bestBucketIndex >= 0) {
        eventToBucketMap.set(eventIndex, bestBucketIndex);
      }
    });

    // Now find which event was assigned to the clicked bucket
    let assignedEvent: ProductEvent | null = null;
    brandEvents.forEach((event, eventIndex) => {
      if (eventToBucketMap.get(eventIndex) === colIndex) {
        assignedEvent = event;
      }
    });

    // Use the clicked bucket boundaries
    const correctedBucketStartSec = buckets[colIndex].startSec;
    const correctedBucketEndSec = buckets[colIndex].endSec;
    const correctedBucketCenter =
      (correctedBucketStartSec + correctedBucketEndSec) / 2;

    // Use the assigned event directly (no need for complex selection logic)
    if (!assignedEvent) return;
    const event: ProductEvent = assignedEvent;

    // Create a more precise segment based on the bucket
    // const preciseStart = Math.max(event.timeline_start, correctedBucketStartSec);
    // const preciseEnd = Math.min(event.timeline_end, correctedBucketEndSec);

    // Determine the best segment to play
    const bucketDuration = correctedBucketEndSec - correctedBucketStartSec;
    const eventDuration = event.timeline_end - event.timeline_start;

    let finalStart = event.timeline_start;
    let finalEnd = event.timeline_end;

    // If the event spans the entire video (or most of it), use a reasonable segment
    if (eventDuration > duration * 0.8) {
      // For events that span most of the video, use a 10-second segment around the bucket center
      finalStart = Math.max(0, correctedBucketCenter - 5);
      finalEnd = Math.min(duration, correctedBucketCenter + 5);
    } else if (bucketDuration < eventDuration * 0.3) {
      // For very small buckets compared to event, use bucket boundaries
      finalStart = correctedBucketStartSec;
      finalEnd = correctedBucketEndSec;
    }
    // Otherwise, use the full event duration

    setModalVideo({
      videoId: selectedVideoId!,
      videoUrl: video.hls.video_url,
      title: `${event.brand}: ${event.product_name}`,
      start: finalStart,
      end: finalEnd,
      description: event.description,
      location: event.location,
    });
  }

  // Toggle filter selection
  function toggleCreator(creator: string) {
    setSelectedCreators((prev) =>
      prev.includes(creator)
        ? prev.filter((c) => c !== creator)
        : [...prev, creator]
    );
  }

  function toggleFormat(format: "vertical" | "horizontal") {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format]
    );
  }

  function toggleStyle(style: string) {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  }

  function toggleTone(tone: string) {
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  }

  function toggleBrand(brand: string) {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  }

  // Reset all filters
  function resetFilters() {
    setSelectedCreators([]);
    setSelectedFormats([]);
    setSelectedStyles([]);
    setSelectedTones([]);
    setSelectedBrands([]);
    setDurationThreshold(0.5);
    setTimeWindow({ start: 0, end: null });
  }

  // Prepare heatmap data based on view mode
  const heatmapData = useMemo(() => {
    if (viewMode === "library") {
      // Library view: videos as rows, normalized time buckets as columns
      const libraryRows = aggregateLibrary(
        videoDurations,
        filteredEvents,
        NUM_BUCKETS,
        selectedBrands.length > 0 ? selectedBrands : undefined
      );

      // map TwelveLabs rows to UI-friendly rows
      const uiRows = libraryRows.map((row) => {
        const video = videos.find((v) => v._id === row.video_id);
        // Prioritize creator name, fallback to video title, then show "Unknown Creator"
        const label = video
          ? video.user_metadata?.creator ||
            video.user_metadata?.video_creator ||
            video.user_metadata?.creator_id ||
            video.system_metadata?.video_title ||
            "Unknown Creator"
          : row.video_id;
        return {
          id: row.video_id,
          label: label.toString(),
          buckets: row.buckets,
          videoDuration: videoDurations[row.video_id], // Include video duration for this row
        };
      });

      // compute total exposure buckets across all uiRows
      const totalBuckets = Array.from({ length: NUM_BUCKETS }, (_, idx) => {
        const template = uiRows[0]?.buckets[idx] ?? {
          start: (idx / NUM_BUCKETS) * 100,
          end: ((idx + 1) / NUM_BUCKETS) * 100,
          value: 0,
        };
        const value = uiRows.reduce((sum, r) => sum + r.buckets[idx].value, 0);
        return { ...template, value };
      });

      const totalRow = {
        id: "__TOTAL__",
        label: "Total Exposure",
        buckets: totalBuckets,
        videoDuration: undefined, // Total row doesn't have a specific video duration
      };

      return [totalRow, ...uiRows];
    } else if (selectedVideoId) {
      // Per-video view: brands as rows, time buckets as columns
      const events = filteredEvents[selectedVideoId] || [];
      const videoDuration = videoDurations[selectedVideoId] || 0;
      const perVideoRows = aggregatePerVideo(
        events,
        NUM_BUCKETS,
        "brand",
        videoDuration
      );

      // Log the actual heatmap data for Emirates
      const emiratesHeatmapRow = perVideoRows.find(
        (row) => row.key === "Emirates"
      );
      if (emiratesHeatmapRow) {
        const nonZeroBuckets = emiratesHeatmapRow.buckets
          .map((bucket, index) => ({ index, ...bucket }))
          .filter((bucket) => bucket.value > 0);
      }

      const rowsWithTotal = perVideoRows.map((row) => ({
        id: row.key,
        label: row.label,
        buckets: row.buckets,
        videoDuration: videoDuration, // Use the current video's duration
      }));

      if (rowsWithTotal.length > 0) {
        // compute total exposure row
        const totalBuckets = rowsWithTotal[0].buckets.map((b, idx) => ({
          ...b,
          value: rowsWithTotal.reduce(
            (sum, r) => sum + r.buckets[idx].value,
            0
          ),
        }));
        rowsWithTotal.unshift({
          id: "__TOTAL__",
          label: "Total Exposure",
          buckets: totalBuckets,
          videoDuration: videoDuration, // Use the current video's duration
        });
      }

      return rowsWithTotal;
    }

    return [];
  }, [
    viewMode,
    selectedVideoId,
    filteredEvents,
    videos,
    videoDurations,
    selectedBrands,
  ]);

  return (
    <div className="bg-zinc-100">
      <main className="container mx-auto px-4 pb-6">
        {/* Description */}
        {description && (
          <div className="mb-8 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
            <p className="text-gray-700">{description}</p>
          </div>
        )}

        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
              {error}
            </div>
          ) : (
            <>
              {/* View mode toggle */}
              <div className="mt-6  flex justify-between items-center">
                {viewMode === "per-video" && selectedVideoId && (
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => {
                        setViewMode("library");
                        setSelectedVideoId(null);
                      }}
                      className="text-gray-700 text-xs font-normal flex gap-1 items-center"
                    >
                      <ArrowLeftIcon /> Back to Library
                    </button>
                  </div>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span>{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Video title (per-video view) */}
              {viewMode === "per-video" && selectedVideoId && (
                <div className="mb-4 mt-6">
                  <h2 className="text-2xl font-bold text-gray-800">
                    {(() => {
                      const video = videos.find(
                        (v) => v._id === selectedVideoId
                      );
                      const filename = video?.system_metadata?.filename;
                      const videoTitle = video?.system_metadata?.video_title;

                      if (filename) {
                        return filename.replace(/\.mp4$/i, "");
                      } else if (videoTitle) {
                        return videoTitle;
                      } else {
                        return `Video ${selectedVideoId}`;
                      }
                    })()}
                  </h2>
                </div>
              )}

              {/* Video info section (per-video view) or Filters section (library view) */}
              {viewMode === "per-video" && selectedVideoId ? (
                <>
                  {/* Video Information - Creator, Styles, Tones */}
                  <div className="mb-6 mt-10  py-4 px-6 rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300">
                    <h3 className="font-semibold mb-4 py-2">
                      Video Information
                    </h3>
                    <div className="flex gap-[64px]">
                      {/* Creator */}
                      <div className="flex flex-col gap-[10px]">
                        <h4 className="text-black text-xs font-normal font-['Milling']">
                          Creator
                        </h4>
                        <div className="flex flex-wrap gap-2 items-center">
                          {isEditingCreator ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingCreator}
                                onChange={(e) =>
                                  setEditingCreator(e.target.value)
                                }
                                className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1D1C1B]"
                                placeholder="Enter creator name"
                                autoFocus
                              />
                              <button
                                onClick={() =>
                                  updateVideoCreator(
                                    selectedVideoId,
                                    editingCreator
                                  )
                                }
                                disabled={
                                  isUpdatingCreator || !editingCreator.trim()
                                }
                                className={clsx(
                                  "px-2 py-1 text-xs rounded-lg",
                                  isUpdatingCreator || !editingCreator.trim()
                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                    : "bg-[#1D1C1B] text-white"
                                )}
                              >
                                {isUpdatingCreator ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditingCreator(false);
                                  setEditingCreator("");
                                }}
                                className="px-2 py-1 text-xs bg-[#D3D1CF] text-gray-700 rounded-lg"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {(() => {
                                // Get creator from videos array (user_metadata.creator) instead of analysisByVideo
                                const video = videos.find(
                                  (v) => v._id === selectedVideoId
                                );
                                const currentCreator =
                                  video?.user_metadata?.creator ||
                                  video?.user_metadata?.video_creator ||
                                  video?.user_metadata?.creator_id ||
                                  analysisByVideo[selectedVideoId]?.creator;

                                return currentCreator &&
                                  typeof currentCreator === "string" ? (
                                  <span className="h-7 px-2 py-1.5 rounded-full outline outline-1 outline-offset-[-1px] outline-gray-300 inline-flex justify-center items-center gap-1 text-gray-700 text-xs font-normal font-['Milling']">
                                    {currentCreator}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-500">
                                    Unknown
                                  </span>
                                );
                              })()}
                              <button
                                onClick={() => {
                                  const video = videos.find(
                                    (v) => v._id === selectedVideoId
                                  );
                                  const currentCreator =
                                    video?.user_metadata?.creator ||
                                    video?.user_metadata?.video_creator ||
                                    video?.user_metadata?.creator_id ||
                                    analysisByVideo[selectedVideoId]?.creator ||
                                    "";
                                  setEditingCreator(String(currentCreator));
                                  setIsEditingCreator(true);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="Edit creator"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                  />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Video Styles */}
                      <div className="flex flex-col gap-[10px]">
                        <h4 className="text-black text-xs font-normal font-['Milling']">
                          Styles
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analysisByVideo[selectedVideoId]?.styles &&
                          analysisByVideo[selectedVideoId].styles!.length >
                            0 ? (
                            analysisByVideo[selectedVideoId].styles!.map(
                              (style: string, index: number) => (
                                <span
                                  key={index}
                                  className="h-7 px-2 py-1.5 rounded-full outline outline-1 outline-offset-[-1px] outline-gray-300 inline-flex justify-center items-center gap-1 text-gray-700 text-xs font-normal font-['Milling']"
                                >
                                  {style}
                                </span>
                              )
                            )
                          ) : (
                            <span className="text-sm text-gray-500">
                              No styles detected
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Video Tones */}
                      <div className="flex flex-col gap-[10px]">
                        <h4 className="text-black text-xs font-normal font-['Milling']">
                          Tones
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analysisByVideo[selectedVideoId]?.tones &&
                          analysisByVideo[selectedVideoId].tones!.length > 0 ? (
                            analysisByVideo[selectedVideoId].tones!.map(
                              (tone: string, index: number) => (
                                <span
                                  key={index}
                                  className="h-7 px-2 py-1.5 rounded-full outline outline-1 outline-offset-[-1px] outline-gray-300 inline-flex justify-center items-center gap-1 text-gray-700 text-xs font-normal font-['Milling']"
                                >
                                  {tone}
                                </span>
                              )
                            )
                          ) : (
                            <span className="text-sm text-gray-500">
                              No tones detected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Brand Filter - separate container */}
                  <div className="mb-8 py-4 px-6 rounded-[20px] rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300">
                    <div className="flex items-center gap-2 mb-4">
                      <h4 className="font-semibold py-2">Brands Filter</h4>
                      <button
                        onClick={() => setSelectedBrands([])}
                        className="py-2 text-xs text-gray-700 flex items-center gap-1"
                        title="Clear all brand filters"
                      >
                        Reset
                        <ResetAllIcon />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                      {availableBrands
                        .filter((brand) =>
                          eventsByVideo[selectedVideoId]?.some(
                            (event) => event.brand === brand
                          )
                        )
                        .map((brand) => (
                          <button
                            key={brand}
                            onClick={() => toggleBrand(brand)}
                            className={clsx(
                              "h-7 px-2 py-1.5 text-xs rounded-lg border border-1",
                              selectedBrands.includes(brand)
                                ? "bg-black text-white"
                                : "border-gray-700 text-gray-700"
                            )}
                          >
                            {brand}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mb-10 bg-gray-100 p-4 rounded-[20px] border border-1 border-gray-300">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <h3 className="font-nromal text-xs text-[#1D1C1B]">
                        Filters
                      </h3>
                      <button
                        onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                        className="flex items-center gap-1 cursor-pointer font-normal transition-colors"
                      >
                        <span className="font-nromal text-xs text-[#1D1C1B]">
                          {isFiltersExpanded ? "Hide" : "Show"}
                        </span>
                        <svg
                          className={`w-4 h-4 transition-transform ${
                            isFiltersExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={resetFilters}
                      className="text-xs text-[#1D1C1B] font-normal flex items-center gap-1"
                    >
                      Reset All
                      <ResetAllIcon />
                    </button>
                  </div>

                  {/* Collapsible filter content */}
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden  ${
                      isFiltersExpanded
                        ? "max-h-screen opacity-100 mt-4"
                        : "max-h-0 opacity-0 mt-0"
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Creator filter */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Creators</h4>
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                          {availableCreators.map((creator) => (
                            <button
                              key={creator}
                              onClick={() => toggleCreator(creator)}
                              className={clsx(
                                "px-2 py-1 text-xs rounded-full",
                                selectedCreators.includes(creator)
                                  ? "bg-custom-orange text-gray-800"
                                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                              )}
                            >
                              {creator}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Format filter */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Format</h4>
                        <div className="flex flex-wrap gap-2">
                          {availableFormats.map((format) => (
                            <button
                              key={format}
                              onClick={() => toggleFormat(format)}
                              className={clsx(
                                "px-2 py-1 text-xs rounded-full flex items-center gap-1",
                                selectedFormats.includes(format)
                                  ? "bg-gray-700 text-white"
                                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                              )}
                            >
                              {format === "vertical" ? (
                                // Vertical icon
                                <svg
                                  className="w-3 h-3"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <rect
                                    x="6"
                                    y="3"
                                    width="12"
                                    height="18"
                                    rx="2"
                                  />
                                </svg>
                              ) : (
                                // Horizontal icon
                                <svg
                                  className="w-3 h-3"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <rect
                                    x="3"
                                    y="6"
                                    width="18"
                                    height="12"
                                    rx="2"
                                  />
                                </svg>
                              )}
                              {format === "vertical"
                                ? "Vertical"
                                : "Horizontal"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Styles filter */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Styles</h4>
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                          {availableStyles.map((style) => (
                            <button
                              key={style}
                              onClick={() => toggleStyle(style)}
                              className={clsx(
                                "px-2 py-1 text-xs rounded-full",
                                selectedStyles.includes(style)
                                  ? "bg-gray-700 text-white"
                                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                              )}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tones filter */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Tones</h4>
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                          {availableTones.map((tone) => (
                            <button
                              key={tone}
                              onClick={() => toggleTone(tone)}
                              className={clsx(
                                "px-2 py-1 text-xs rounded-full",
                                selectedTones.includes(tone)
                                  ? "bg-gray-700 text-white"
                                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                              )}
                            >
                              {tone}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Brand filter */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Brands</h4>
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                          {availableBrands.map((brand) => (
                            <button
                              key={brand}
                              onClick={() => toggleBrand(brand)}
                              className={clsx(
                                "px-2 py-1 text-xs rounded-full",
                                selectedBrands.includes(brand)
                                  ? "bg-custom-green text-gray-800"
                                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                              )}
                            >
                              {brand}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Duration and time window filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2">
                          Duration Threshold: {durationThreshold}s
                        </h4>
                        <input
                          type="range"
                          min="0.1"
                          max="5"
                          step="0.1"
                          value={durationThreshold}
                          onChange={(e) =>
                            setDurationThreshold(parseFloat(e.target.value))
                          }
                          className="w-full accent-gray-700"
                        />
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-2">
                          Time Window: {timeWindow.start}s -{" "}
                          {timeWindow.end === null
                            ? "End"
                            : `${timeWindow.end}s`}
                        </h4>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={timeWindow.start}
                            onChange={(e) =>
                              setTimeWindow((prev) => ({
                                ...prev,
                                start: Math.max(
                                  0,
                                  parseInt(e.target.value) || 0
                                ),
                              }))
                            }
                            className="w-20 px-2 py-1 border border-gray-300 rounded-xl"
                          />
                          <span>to</span>
                          <input
                            type="number"
                            min={timeWindow.start + 1}
                            value={
                              timeWindow.end === null ? "" : timeWindow.end
                            }
                            placeholder="End"
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? null
                                  : Math.max(
                                      timeWindow.start + 1,
                                      parseInt(e.target.value) || 0
                                    );
                              setTimeWindow((prev) => ({
                                ...prev,
                                end: value,
                              }));
                            }}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-xl"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Heatmap visualization */}
              <div className="mb-8">
                {isEventsLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <LoadingSpinner size="md" />
                  </div>
                ) : heatmapData.length === 0 ? (
                  <div className="bg-gray-50 p-8 rounded-lg text-center text-gray-500">
                    {viewMode === "library" ? (
                      <p>No videos match the selected filters.</p>
                    ) : (
                      <p>
                        No brand mentions found for this video with the current
                        filters.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl text-black font-normal ml-3 mb-5">
                      {viewMode === "library"
                        ? `Brand Mention Heatmap`
                        : "Brand Mentions"}
                    </h3>
                    <div className="overflow-x-auto">
                      <Heatmap
                        rows={heatmapData}
                        columns={NUM_BUCKETS}
                        onCellClick={handleHeatmapCellClick}
                        className="mb-4"
                        videoDuration={
                          viewMode === "per-video" && selectedVideoId
                            ? videoDurations[selectedVideoId]
                            : undefined
                        }
                        viewMode={viewMode}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Video grid (library view only) */}
              {viewMode === "library" && (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
                    {filteredVideos.map((video) => (
                      <div
                        key={video._id}
                        className={clsx(
                          " overflow-hidden cursor-pointer transition-all"
                        )}
                        onClick={() => {
                          setSelectedVideoId(video._id);
                          setViewMode("per-video");
                        }}
                      >
                        <div className="aspect-video bg-gray-100 relative rounded-2xl">
                          {video.hls?.thumbnail_urls?.[0] && (
                            <img
                              src={video.hls.thumbnail_urls[0]}
                              alt={
                                video.system_metadata?.video_title ||
                                "Video thumbnail"
                              }
                              className="w-full h-full object-cover rounded-2xl"
                            />
                          )}

                          {/* Creator name label - top left */}
                          <div className="absolute top-4 left-6 z-10">
                            <span className="px-1 py-0.5 text-xs bg-transparent rounded-md font-normal text-white border border-1 border-white bg-white/5 backdrop-blur-[20px] uppercase">
                              {(() => {
                                const creator =
                                  video.user_metadata?.creator ||
                                  video.user_metadata?.video_creator ||
                                  video.user_metadata?.creator_id ||
                                  "Creator";
                                return String(creator);
                              })()}
                            </span>
                          </div>

                          {/* Brand count badge - top right */}
                          {eventsByVideo[video._id] && (
                            <div className="absolute top-4 right-6 z-10">
                              <span className="px-1 py-0.5 text-xs bg-[#805867] rounded-md border border-1 border-[#FFDFEB] text-[#FFDFEB] uppercase">
                                {
                                  new Set(
                                    eventsByVideo[video._id].map((e) => e.brand)
                                  ).size
                                }{" "}
                                Brand
                                {new Set(
                                  eventsByVideo[video._id].map((e) => e.brand)
                                ).size > 1
                                  ? "s"
                                  : ""}
                              </span>
                            </div>
                          )}

                          {/* Format label - bottom right */}
                          {video.system_metadata?.width &&
                            video.system_metadata?.height && (
                              <div className="absolute bottom-4 right-6 z-10">
                                <div className="h-7 w-7 text-white bg-white/5 shadow-[0px_5px_5px_0px_rgba(0,0,0,0.25)] backdrop-blur-[10px] inline-flex justify-center items-center rounded-sm">
                                  {video.system_metadata.width >=
                                  video.system_metadata.height ? (
                                    // Horizontal (landscape) icon - rectangle with horizontal orientation
                                    <HorizontalIcon />
                                  ) : (
                                    // Vertical (portrait) icon - rectangle with vertical orientation
                                    <VerticalIcon />
                                  )}
                                </div>
                              </div>
                            )}
                        </div>

                        {/* Video title below video */}
                        <div className="mt-2">
                          <h3 className="text-base font-normal text-gray-700 truncate">
                            {video.system_metadata?.filename?.replace(
                              /\.mp4$/i,
                              ""
                            ) ||
                              video.system_metadata?.video_title ||
                              `Video ${video._id}`}
                          </h3>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </ErrorBoundary>
      </main>

      {/* Video modal */}
      {modalVideo && (
        <VideoModalSimple
          videoUrl={modalVideo.videoUrl}
          videoId={modalVideo.videoId}
          isOpen={!!modalVideo}
          onClose={() => setModalVideo(null)}
          title={modalVideo.title}
          startTime={modalVideo.start}
          endTime={modalVideo.end}
          description={modalVideo.description}
          location={modalVideo.location}
        />
      )}
    </div>
  );
}
