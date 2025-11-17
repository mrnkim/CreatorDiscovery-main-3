"use client";

import { useState, useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  fetchVideos,
  fetchVideoDetails,
  textToVideoEmbeddingSearch,
  videoToVideoEmbeddingSearch,
  checkAndEnsureEmbeddings,
} from "@/hooks/apiHooks";
import VideosDropDown from "@/components/VideosDropdown";
import Video from "@/components/Video";
import SimilarVideoResults from "@/components/SimilarVideoResults";
import VideoModalSimple from "@/components/VideoModalSimple";
import { VideoData, EmbeddingSearchResult, VideoPage } from "@/types";
import LoadingSpinner from "@/components/LoadingSpinner";
import VideoPlayer from "@/components/VideoPlayer";

// Component to render video tags
const VideoWithTags: React.FC<{
  videoId: string;
  indexId: string;
  isAnalyzingTags?: boolean;
}> = ({ videoId, indexId, isAnalyzingTags = false }) => {
  const { data: videoDetails, isLoading } = useQuery<VideoData, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => fetchVideoDetails(videoId, indexId),
    enabled: !!videoId && !!indexId,
  });

  // Render tags from user_metadata (same as SimilarVideoResults)
  const renderTags = (videoData: VideoData | undefined) => {
    // Show loading spinner only when actively analyzing tags (not when fetching existing data)
    if (isAnalyzingTags) {
      return (
        <div className="mt-1 pb-1">
          <div className="flex items-center justify-center py-4">
            <LoadingSpinner size="sm" className="mr-2" />
            <span className="text-sm text-gray-600">Analyzing tags...</span>
          </div>
        </div>
      );
    }

    // If we're loading video data (but not analyzing), show nothing (don't show loading spinner)
    if (isLoading) {
      return null;
    }

    // If we have video data but no user_metadata, show nothing
    if (!videoData || !videoData.user_metadata) {
      return null;
    }

    try {
      // Extract brands from brand_product_events
      const brands = new Set<string>();
      if (videoData.user_metadata.brand_product_events) {
        try {
          const events = JSON.parse(
            videoData.user_metadata.brand_product_events as string
          ) as unknown[];
          if (Array.isArray(events)) {
            events.forEach((event: unknown) => {
              if (
                event &&
                typeof event === "object" &&
                "brand" in event &&
                typeof (event as { brand: unknown }).brand === "string"
              ) {
                brands.add(String((event as { brand: string }).brand).trim());
              }
            });
          }
        } catch (error) {
          console.warn("Failed to parse brand_product_events:", error);
        }
      }

      const allTags = Object.entries(videoData.user_metadata)
        .filter(([key, value]) => {
          // Filter out certain keys and null/undefined values
          const excludeKeys = [
            "source",
            "brand_product_events",
            "analysis",
            "brand_product_analyzed_at",
            "brand_product_source",
          ];
          return !excludeKeys.includes(key) && value != null;
        })
        .flatMap(([, value]) => {
          // Handle different data types properly
          let processedValue: string[] = [];

          if (typeof value === "string") {
            // Check if it's a JSON string
            if (value.startsWith("[") && value.endsWith("]")) {
              try {
                const parsedArray = JSON.parse(value);
                if (Array.isArray(parsedArray)) {
                  processedValue = parsedArray
                    .filter(
                      (item) =>
                        typeof item === "string" && item.trim().length > 0
                    )
                    .map((item) => item.trim());
                }
              } catch {
                console.warn("Failed to parse JSON array:", value);
                // Fall back to treating as comma-separated string
                processedValue = value
                  .split(",")
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0);
              }
            } else if (value.startsWith("{") && value.endsWith("}")) {
              // Skip JSON objects - they're too complex for pills
              return [];
            } else {
              // Regular string - split by commas
              processedValue = value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item.length > 0);
            }
          } else if (typeof value === "number" || typeof value === "boolean") {
            processedValue = [value.toString()];
          } else if (Array.isArray(value)) {
            // Handle arrays directly
            processedValue = value
              .filter((item) => item != null)
              .map((item) =>
                typeof item === "string" ? item.trim() : String(item)
              )
              .filter((item) => item.length > 0);
          } else if (typeof value === "object") {
            // Skip complex objects that shouldn't be displayed as tags
            return [];
          } else {
            processedValue = [String(value)];
          }

          // Skip if no valid values
          if (processedValue.length === 0) {
            return [];
          }

          return processedValue
            .map((tag: string) => {
              // Trim and validate each tag
              const trimmedTag = tag.trim();
              if (trimmedTag.length === 0 || trimmedTag.length > 50) {
                return ""; // Skip empty or overly long tags
              }

              // Filter out unwanted tags (case insensitive)
              const lowerTag = trimmedTag.toLowerCase();
              const unwantedPatterns = [
                "not explicitly visible",
                "not explicitly",
                "explicitly visible",
                "none",
                "not visible",
              ];

              if (
                unwantedPatterns.some((pattern) => lowerTag.includes(pattern))
              ) {
                return ""; // Skip unwanted tags
              }

              // Properly capitalize - first lowercase everything then capitalize first letter of each word
              const properlyCapitalized = trimmedTag
                .toLowerCase()
                .split(" ")
                .map((word: string) => {
                  if (word.length === 0) return word;
                  return word.charAt(0).toUpperCase() + word.slice(1);
                })
                .join(" ");

              return properlyCapitalized;
            })
            .filter((tag: string) => tag !== "");
        })
        .filter((tag) => tag.length > 0) // Remove any empty tags
        .slice(0, 10); // Limit to 10 tags maximum to prevent UI overflow

      // Add brands to tags (brands first)
      const brandTags = Array.from(brands)
        .map((brand) => brand.trim())
        .filter((brand) => brand.length > 0);

      // Filter out unwanted tags from all tags (including brands)
      const unwantedPatterns = [
        "not explicitly visible",
        "not explicitly",
        "explicitly visible",
        "none",
        "not visible",
      ];

      const filteredBrandTags = brandTags.filter(
        (tag) =>
          !unwantedPatterns.some((pattern) =>
            tag.toLowerCase().includes(pattern)
          )
      );

      const filteredAllTags = allTags.filter(
        (tag) =>
          !unwantedPatterns.some((pattern) =>
            tag.toLowerCase().includes(pattern)
          )
      );

      const combinedTags = [...filteredBrandTags, ...filteredAllTags].slice(
        0,
        10
      ); // Limit to 10 tags total

      // Return null if no valid tags found
      if (combinedTags.length === 0) {
        return null;
      }

      return (
        <div className="mt-5 pb-1">
          <div className="flex flex-wrap gap-2">
            {combinedTags.map((tag, idx) => (
              <div
                key={`${tag}-${idx}`}
                className="inline-block flex-shrink-0 border border-gray-300 rounded-full px-2 py-[6px] text-black hover:bg-gray-200 transition-colors text-gray-700 text-xs font-normal font-['Milling'] leading-none"
              >
                #{tag}
              </div>
            ))}
          </div>
        </div>
      );
    } catch (error) {
      console.error(
        "❌ Error rendering tags for video:",
        videoData?._id,
        error
      );
      return (
        <div className="mt-1 text-xs text-gray-400 italic">
          Unable to load tags
        </div>
      );
    }
  };

  return renderTags(videoDetails);
};

export default function CreatorBrandMatch() {
  const description: string | undefined = undefined;
  const [sourceType, setSourceType] = useState<"brand" | "creator">("brand"); // Default: Brand → Creator
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarResults, setSimilarResults] = useState<EmbeddingSearchResult[]>(
    []
  );
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(false);
  const [targetVideos, setTargetVideos] = useState<VideoData[]>([]);
  const [embeddingsReady, setEmbeddingsReady] = useState(false);
  const [isProcessingTargetEmbeddings, setIsProcessingTargetEmbeddings] =
    useState(false);
  const [targetEmbeddingsProgress, setTargetEmbeddingsProgress] = useState({
    processed: 0,
    total: 0,
  });
  const [showProcessingMessage, setShowProcessingMessage] = useState(true);
  const [isAnalyzingTags, setIsAnalyzingTags] = useState(false);
  const [isReadyForAnimation, setIsReadyForAnimation] = useState(false);

  // Modal state
  const [modalVideo, setModalVideo] = useState<{
    videoId: string;
    videoUrl: string;
    title: string;
    description?: string;
  } | null>(null);

  // Get index IDs from environment variables
  const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID || "";
  const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID || "";

  // Determine source and target index IDs based on sourceType
  const sourceIndexId = sourceType === "brand" ? brandIndexId : creatorIndexId;
  const targetIndexId = sourceType === "brand" ? creatorIndexId : brandIndexId;
  const showResults =
    similarResults.length > 0 && !isAnalyzing && embeddingsReady;

  // Fetch videos for the source index (for dropdown selection)
  const {
    data: videosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingVideos,
  } = useInfiniteQuery<VideoPage>({
    queryKey: ["videos", sourceIndexId, sourceType],
    queryFn: ({ pageParam = 1 }) =>
      fetchVideos(Number(pageParam), sourceIndexId),
    getNextPageParam: (lastPage) => {
      if (lastPage.page_info.page < lastPage.page_info.total_page) {
        return lastPage.page_info.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!sourceIndexId,
    staleTime: 2 * 60 * 1000, // 2 minutes - videos don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
  });

  // Fetch target videos for embedding preparation using React Query
  const { data: targetVideosData } = useQuery({
    queryKey: ["targetVideos", targetIndexId],
    queryFn: () => fetchVideos(1, targetIndexId, 20),
    enabled: !!targetIndexId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    select: (data) => data.data, // Extract just the data array
  });

  // Update targetVideos state when data is available
  useEffect(() => {
    if (targetVideosData) {
      setTargetVideos(targetVideosData);
    }
  }, [targetVideosData]);

  useEffect(() => {
    setIsReadyForAnimation(true);
  }, []);

  // Handle video selection
  const handleVideoChange = async (videoId: string) => {
    setSelectedVideoId(videoId);
    setSimilarResults([]);
    setEmbeddingsReady(false);

    // Analyze videos to generate tags only if they don't already have user_metadata
    if (sourceIndexId) {
      try {
        // First, fetch video details to check if user_metadata exists
        const videoDetails = await fetchVideoDetails(videoId, sourceIndexId);

        // Check if user_metadata exists and has meaningful data
        const hasUserMetadata =
          videoDetails?.user_metadata &&
          Object.keys(videoDetails.user_metadata).length > 0;

        if (hasUserMetadata) {
          return;
        }

        // Only analyze if no user_metadata exists
        setIsAnalyzingTags(true);

        const response = await axios.post("/api/brand-mentions/analyze", {
          videoId,
          indexId: sourceIndexId,
          force: true,
          segmentAnalysis: true,
        });

        if (response.data && response.data.events) {
        }
      } catch (error) {
        console.error(
          `❌ Error handling video selection for ${videoId}:`,
          error
        );
      } finally {
        setIsAnalyzingTags(false);
      }
    }
  };

  // Handle opening video modal
  const handleOpenVideoModal = (videoId: string) => {
    const video = videosData?.pages
      .flatMap((page: { data: VideoData[] }) => page.data)
      .find((video: VideoData) => video._id === videoId);

    if (video && video.hls?.video_url) {
      setModalVideo({
        videoId: video._id,
        videoUrl: video.hls.video_url,
        title:
          video.system_metadata?.filename ||
          video.system_metadata?.video_title ||
          "Video",
        description: `Duration: ${
          video.system_metadata?.duration
            ? Math.round(video.system_metadata.duration)
            : 0
        }s`,
      });
    }
  };

  // Handle closing video modal
  const handleCloseVideoModal = () => {
    setModalVideo(null);
  };

  // Find matches between source and target videos
  const handleFindMatches = async () => {
    if (!selectedVideoId) return;

    setIsAnalyzing(true);
    setSimilarResults([]);

    try {
      // Use target videos from React Query cache
      const targetVideosToProcess = targetVideos.length > 0 ? targetVideos : [];
      // Check and ensure embeddings for source and target videos
      setIsLoadingEmbeddings(true);
      setIsProcessingTargetEmbeddings(true);

      const startTime = Date.now();
      const embeddingResult = await checkAndEnsureEmbeddings(
        selectedVideoId,
        sourceIndexId,
        targetIndexId,
        targetVideosToProcess,
        true
      );
      const embeddingTime = Date.now() - startTime;

      setTargetEmbeddingsProgress({
        processed: embeddingResult.processedCount,
        total: embeddingResult.totalCount,
      });

      setEmbeddingsReady(embeddingResult.success);
      setIsLoadingEmbeddings(false);
      setIsProcessingTargetEmbeddings(false);

      if (!embeddingResult.success) {
        console.error("❌ Embedding processing failed");
        return;
      }

      // Run searches in parallel for better performance
      const searchStartTime = Date.now();

      const [textResults, videoResults] = await Promise.all([
        textToVideoEmbeddingSearch(
          selectedVideoId,
          sourceIndexId,
          targetIndexId
        ),
        videoToVideoEmbeddingSearch(
          selectedVideoId,
          sourceIndexId,
          targetIndexId
        ),
      ]);

      const searchTime = Date.now() - searchStartTime;

      // Combine results with a boost for videos that appear in both searches
      const combinedResults = combineSearchResults(textResults, videoResults);

      setSimilarResults(combinedResults);
    } catch (error) {
      console.error("❌ Error finding matches:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper function to determine match level
  const getMatchLevel = (
    score: number,
    source?: string
  ): "High" | "Medium" | "Low" => {
    // BOTH source results are always High
    if (source === "BOTH") {
      return "High";
    }

    // Single source cases based on score
    if (score >= 1) return "High";
    if (score >= 0.5) return "Medium";
    return "Low";
  };

  // Helper function to get match level priority for sorting
  const getMatchLevelPriority = (level: "High" | "Medium" | "Low"): number => {
    switch (level) {
      case "High":
        return 3;
      case "Medium":
        return 2;
      case "Low":
        return 1;
      default:
        return 0;
    }
  };

  // Combine text and video search results with a boost for overlapping results
  const combineSearchResults = (
    textResults: EmbeddingSearchResult[],
    videoResults: EmbeddingSearchResult[]
  ): EmbeddingSearchResult[] => {
    const resultMap = new Map<string, EmbeddingSearchResult>();

    // Process text search results
    textResults.forEach((result) => {
      const videoId = result.metadata?.tl_video_id;
      if (videoId) {
        resultMap.set(videoId, {
          ...result,
          textScore: result.score,
          originalSource: "TEXT",
        });
      }
    });

    // Process video search results and merge with text results if they exist
    videoResults.forEach((result) => {
      const videoId = result.metadata?.tl_video_id;
      if (!videoId) return;

      if (resultMap.has(videoId)) {
        // Video exists in both searches - merge and boost
        const existingResult = resultMap.get(videoId)!;
        const textScore = existingResult.textScore || 0;
        const videoScore = result.score;

        // Calculate combined score with a boost
        const maxScore = Math.max(textScore, videoScore);
        const boostedScore = maxScore * 1.15; // 15% boost when in both results

        resultMap.set(videoId, {
          ...existingResult,
          score: boostedScore,
          videoScore,
          textScore,
          originalSource: "BOTH",
        });
      } else {
        // Video only in video search
        resultMap.set(videoId, {
          ...result,
          videoScore: result.score,
          originalSource: "VIDEO",
        });
      }
    });

    // Convert map to array and sort by match level (High, Medium, Low), then by score within each level
    return Array.from(resultMap.values()).sort((a, b) => {
      const levelA = getMatchLevel(a.score, a.originalSource);
      const levelB = getMatchLevel(b.score, b.originalSource);

      // First sort by match level priority (High > Medium > Low)
      const levelPriorityA = getMatchLevelPriority(levelA);
      const levelPriorityB = getMatchLevelPriority(levelB);

      if (levelPriorityA !== levelPriorityB) {
        return levelPriorityB - levelPriorityA; // Higher priority first
      }

      // If same level, sort by score (higher score first)
      return b.score - a.score;
    });
  };

  // Auto-select first video when videos are loaded (for both brand and creator)
  useEffect(() => {
    if (videosData?.pages?.[0]?.data?.[0] && !selectedVideoId) {
      const firstVideo = videosData.pages[0].data[0];
      // Trigger full selection flow so tags/analyze run immediately
      handleVideoChange(firstVideo._id);
    }
  }, [videosData, selectedVideoId]);

  // Dismiss status messages
  const dismissMessage = () => {
    setShowProcessingMessage(false);
  };

  const leftPanelBaseClass =
    "flex flex-col gap-20 justify-center items-center transform-gpu h-full";
  const leftPanelTransitionClass = isReadyForAnimation
    ? "transition-all duration-500 ease-out"
    : "";
  const leftPanelStateClass = showResults
    ? "w-3/5 -translate-x-2 md:-translate-x-1"
    : "w-full translate-x-0";
  const leftPanelClasses = [
    leftPanelBaseClass,
    leftPanelTransitionClass,
    leftPanelStateClass,
  ]
    .filter(Boolean)
    .join(" ");

  const rightPanelBaseClass =
    "flex flex-col justify-start overflow-hidden min-w-0 transform-gpu h-full max-w-[436px]";
  const rightPanelTransitionClass = isReadyForAnimation
    ? "transition-all duration-500 ease-out"
    : "";
  const rightPanelStateClass = showResults
    ? "w-2/5 opacity-100 scale-100 pointer-events-auto"
    : "w-0 opacity-0 scale-95 pointer-events-none";
  const rightPanelClasses = [
    rightPanelBaseClass,
    rightPanelTransitionClass,
    rightPanelStateClass,
  ]
    .filter(Boolean)
    .join(" ");

  const shouldShowStatusHeader = Boolean(
    description ||
      (isLoadingEmbeddings && showProcessingMessage) ||
      (isProcessingTargetEmbeddings &&
        targetEmbeddingsProgress.total > 0 &&
        showProcessingMessage)
  );

  return (
    <div className="bg-zinc-100 h-screen flex flex-col">
      {/* Main Content Layout - Left: Reference Video, Right: Results */}
      <div className="flex-1 flex gap-8 min-h-0 w-full px-4 items-start justify-between py-6">
        {/* Left Side - Reference Video Selection */}
        <div className={leftPanelClasses}>
          {/* Source Type Toggle */}
          <div className="relative flex max-w-lg items-center justify-center rounded-2xl bg-gray-100 outline outline-1 outline-gray-700 p-0.5">
            <span
              className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-[14px] bg-[#1D1C1B] transition-transform duration-200 ease-out ${
                sourceType === "brand" ? "translate-x-0" : "translate-x-full"
              }`}
            />

            <button
              type="button"
              onClick={() => {
                setSourceType("brand");
                setSelectedVideoId(null);
                setSimilarResults([]);
                setEmbeddingsReady(false);
              }}
              className={`relative z-10 flex-1 px-3 py-2 text-sm font-normal transition-colors ${
                sourceType === "brand" ? "text-white" : "text-gray-700"
              }`}
            >
              Brand → Creator
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceType("creator");
                setSelectedVideoId(null);
                setSimilarResults([]);
                setEmbeddingsReady(false);
              }}
              className={`relative z-10 flex-1 px-3 py-2 text-sm font-normal transition-colors ${
                sourceType === "creator" ? "text-white" : "text-gray-700"
              }`}
            >
              Creator → Brand
            </button>
          </div>

          <div className="flex flex-col gap-5 w-full max-w-90 h-[370px] justify-center">
            {/* Video Dropdown */}
            <div className="flex-shrink-0 flex justify-center">
              <VideosDropDown
                indexId={sourceIndexId}
                onVideoChange={handleVideoChange}
                videosData={videosData || { pages: [], pageParams: [] }}
                fetchNextPage={fetchNextPage}
                hasNextPage={!!hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                isLoading={isLoadingVideos}
                selectedFile={null}
                taskId={null}
                footageVideoId={selectedVideoId}
              />
            </div>

            {/* Selected Video Preview */}
            {selectedVideoId && (
              <div className="flex flex-col items-center flex-shrink-0 min-h-[370px]">
                <div className="relative h-[168px] md:h-[344px] ">
                  <VideoPlayer
                    videoId={selectedVideoId}
                    indexId={sourceIndexId}
                    className="w-full h-full max-w-[300px] max-h-[168px] lg:max-w-[612px] lg:max-h-[344px] rounded-[32px]"
                    showBrandTag={sourceType === "brand"}
                    showCreatorTag={sourceType === "creator"}
                  />
                </div>
                {/* Video Tags - using Video component's data */}
                <VideoWithTags
                  videoId={selectedVideoId}
                  indexId={sourceIndexId}
                  isAnalyzingTags={isAnalyzingTags}
                />
              </div>
            )}
          </div>
          {/* Find Matches Button */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 w-full gap-4">
            <div className="text-center justify-center text-[#45423F] text-base font-normal font-['Milling'] leading-normal">
              Select a video and click below to see results.
            </div>
            <button
              onClick={handleFindMatches}
              disabled={!selectedVideoId || isAnalyzing}
              className={`"h-12 px-[18px] py-[10px] text-xl rounded-2xl inline-flex justify-center items-center gap-2 w-max ${
                !selectedVideoId || isAnalyzing
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#1D1C1B] text-white hover:bg-gray-800"
              }`}
            >
              {isAnalyzing ? (
                <span className="flex items-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  Finding Matches...
                </span>
              ) : (
                "Find Matches"
              )}
            </button>
          </div>
        </div>

        {/* Right Side - Search Results */}
        <div className={rightPanelClasses}>
          {similarResults.length > 0 ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-none bg-gray-100 rounded-[32px] border border-1 border-gray-300">
                <SimilarVideoResults
                  results={similarResults}
                  indexId={targetIndexId}
                  sourceType={sourceType}
                />
              </div>
            </div>
          ) : !isAnalyzing && embeddingsReady ? (
            <div className="text-center text-gray-600 mt-8">
              No matching {sourceType === "brand" ? "creators" : "brands"}{" "}
              found. Try selecting a different video.
            </div>
          ) : (
            <></>
          )}
        </div>
      </div>

      {/* Video Modal */}
      {modalVideo && (
        <VideoModalSimple
          videoUrl={modalVideo.videoUrl}
          videoId={modalVideo.videoId}
          isOpen={!!modalVideo}
          onClose={handleCloseVideoModal}
          title={modalVideo.title}
          description={modalVideo.description}
        />
      )}
    </div>
  );
}
