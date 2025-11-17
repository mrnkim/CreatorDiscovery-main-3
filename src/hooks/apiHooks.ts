import axios from 'axios';
import {
  VideoPage,
  VideoData,
  PaginatedResponse,
  EmbeddingSearchResult,
  EmbeddingCheckResult
} from '@/types';

// Cache for vector existence checks to avoid repeated API calls
const vectorExistenceCache = new Map<string, { exists: boolean; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for failed video lookups to prevent repeated API calls for missing videos
const failedVideoCache = new Map<string, { timestamp: number; error: string }>();
const FAILED_VIDEO_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Clears the failed video cache
 * Useful when you want to retry fetching videos that previously failed
 */
export function clearFailedVideoCache(): void {
  failedVideoCache.clear();
}

/**
 * Gets the number of failed videos currently cached
 */
export function getFailedVideoCacheSize(): number {
  return failedVideoCache.size;
}

/**
 * Fetches video details with retry logic for videos that might be processing
 * @param videoId ID of the video to fetch
 * @param indexId Index ID where the video is stored
 * @param embed Whether to include embedding data
 * @param maxRetries Maximum number of retries (default: 2)
 * @param baseDelay Base delay between retries in ms (default: 1000)
 * @returns Promise with video details
 */
export async function fetchVideoDetailsWithRetry(
  videoId: string,
  indexId: string,
  embed: boolean = false,
  maxRetries: number = 2,
  baseDelay: number = 1000
): Promise<VideoData> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchVideoDetails(videoId, indexId, embed);
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message;

      // If it's a "not found" error, don't retry
      if (
        errorMessage.includes('not found') ||
        errorMessage.includes('cached failure') ||
        errorMessage.includes('resource_not_exists')
      ) {
        throw lastError;
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Unknown error occurred');
}

/**
 * Fetches videos from the API with pagination
 * @param page Page number to fetch
 * @param indexId Index ID to fetch videos from
 * @param limit Optional limit of videos per page
 * @returns Promise with paginated video data
 */
export async function fetchVideos(
  page: number = 1,
  indexId: string,
  limit: number = 12
): Promise<VideoPage> {
  try {
    const response = await axios.get<PaginatedResponse>('/api/videos', {
      params: {
        page,
        index_id: indexId,
        limit
      }
    });

    return {
      data: response.data.data,
      page_info: {
        limit_per_page: limit,
        page: response.data.page_info.page,
        total_page: response.data.page_info.total_page,
        total_results: response.data.page_info.total_count,
        total_duration: 0 // Not provided by the API
      }
    };
  } catch (error) {
    console.error('Error fetching videos:', error);
    throw error;
  }
}

/**
 * Fetches details for a specific video
 * @param videoId ID of the video to fetch
 * @param indexId Index ID where the video is stored
 * @param embed Whether to include embedding data
 * @returns Promise with video details
 */
export async function fetchVideoDetails(
  videoId: string,
  indexId: string,
  embed: boolean = false
): Promise<VideoData> {
  const cacheKey = `${videoId}-${indexId}`;
  const now = Date.now();

  // Check if this video has failed recently
  const failedCache = failedVideoCache.get(cacheKey);
  if (failedCache && (now - failedCache.timestamp) < FAILED_VIDEO_CACHE_DURATION) {
    throw new Error(`Video ${videoId} not found (cached failure)`);
  }

  try {
    const response = await axios.get<VideoData>(`/api/videos/${videoId}`, {
      params: {
        indexId,
        embed: embed ? 'true' : undefined
      }
    });
    return response.data;
  } catch (error) {
    // Check if it's a 404 error (video not found)
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const errorData = error.response.data;
      if (errorData?.code === 'VIDEO_NOT_FOUND') {
        // Cache this failure to avoid repeated API calls
        failedVideoCache.set(cacheKey, {
          timestamp: now,
          error: errorData.message || 'Video not found'
        });

        console.warn(`⚠️ Video ${videoId} not found in index ${indexId}. Cached failure to prevent repeated requests.`);
        throw new Error(`Video ${videoId} not found`);
      }
    }

    console.error(`Error fetching video details for ${videoId}:`, error);
    throw error;
  }
}

/**
 * Checks if vectors exist for a video in Pinecone
 * @param videoId ID of the video to check
 * @param indexId Index ID where the video is stored
 * @returns Promise with boolean indicating if vectors exist
 */
export async function checkVideoVectorsExist(
  videoId: string,
  indexId: string
): Promise<boolean> {
  const cacheKey = `${videoId}-${indexId}`;
  const now = Date.now();

  // Check cache first
  const cached = vectorExistenceCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.exists;
  }

  try {
    const response = await axios.get('/api/vectors/exists', {
      params: {
        video_id: videoId,
        index_id: indexId
      }
    });

    const exists = response.data.exists;

    // Cache the result
    vectorExistenceCache.set(cacheKey, { exists, timestamp: now });

    return exists;
  } catch (error) {
    console.error(`Error checking vectors for ${videoId}:`, error);
    return false;
  }
}

/**
 * Stores embedding vectors in Pinecone
 * @param videoId ID of the video
 * @param videoName Name of the video
 * @param embedding Embedding data to store
 * @param indexId Index ID where to store the vectors
 * @returns Promise with success status
 */
export async function storeVectors(
  videoId: string,
  videoName: string,
  embedding: VideoData['embedding'],
  indexId: string
): Promise<boolean> {
  try {
    const response = await axios.post('/api/vectors/store', {
      videoId,
      videoName,
      embedding,
      indexId
    });
    return response.data.success;
  } catch (error) {
    console.error(`Error storing vectors for ${videoId}:`, error);
    return false;
  }
}

/**
 * Ensures embeddings exist for source and target videos
 * @param videoId Source video ID
 * @param sourceIndexId Source index ID
 * @param targetIndexId Target index ID
 * @param targetVideos Optional array of target videos
 * @param processTargets Whether to process target videos
 * @returns Promise with embedding check result
 */
export async function checkAndEnsureEmbeddings(
  videoId: string,
  sourceIndexId: string,
  targetIndexId: string,
  targetVideos: VideoData[] = [],
  processTargets: boolean = false
): Promise<EmbeddingCheckResult> {
  try {
    // Check if source video has vectors
    const sourceVectorsExist = await checkVideoVectorsExist(videoId, sourceIndexId);

    if (!sourceVectorsExist) {
      // Fetch video with embeddings
      const videoWithEmbedding = await fetchVideoDetails(videoId, sourceIndexId, true);

      if (!videoWithEmbedding.embedding?.video_embedding?.segments) {
        return {
          success: false,
          processedCount: 0,
          totalCount: 1 + targetVideos.length,
          message: `Failed to get embedding for source video ${videoId}`
        };
      }

      // Store vectors
      const videoName = videoWithEmbedding.system_metadata?.filename ||
                        videoWithEmbedding.system_metadata?.video_title ||
                        `video_${videoId}`;

      await storeVectors(videoId, videoName, videoWithEmbedding.embedding, sourceIndexId);
    }

    // If we don't need to process target videos, return early
    if (!processTargets || targetVideos.length === 0) {
      return {
        success: true,
        processedCount: 1,
        totalCount: 1
      };
    }

    // Process target videos with improved concurrency and batching
    const MAX_CONCURRENT = 5; // Increased concurrency
    let processedCount = 0;
    const totalCount = targetVideos.length;
    // First, check which videos need embedding processing
    const videosToProcess: VideoData[] = [];

    // Batch check vector existence for all videos
    for (let i = 0; i < targetVideos.length; i += MAX_CONCURRENT) {
      const batch = targetVideos.slice(i, i + MAX_CONCURRENT);

      const existenceChecks = await Promise.all(
        batch.map(async (video) => {
          const targetVideoId = video._id;
          const exists = await checkVideoVectorsExist(targetVideoId, targetIndexId);
          return { video, exists };
        })
      );

      // Collect videos that need processing
      existenceChecks.forEach(({ video, exists }) => {
        if (!exists) {
          videosToProcess.push(video);
        }
        processedCount++;
      });
    }
    // Process videos that need embeddings
    for (let i = 0; i < videosToProcess.length; i += MAX_CONCURRENT) {
      const batch = videosToProcess.slice(i, i + MAX_CONCURRENT);

      await Promise.all(batch.map(async (video) => {
        try {
          const targetVideoId = video._id;
          // Fetch video with embeddings
          const videoWithEmbedding = await fetchVideoDetails(targetVideoId, targetIndexId, true);

          if (videoWithEmbedding.embedding?.video_embedding?.segments) {
            const videoName = videoWithEmbedding.system_metadata?.filename ||
                            videoWithEmbedding.system_metadata?.video_title ||
                            `video_${targetVideoId}`;

            await storeVectors(targetVideoId, videoName, videoWithEmbedding.embedding, targetIndexId);
          } else {
            console.warn(`⚠️ No embedding data found for video: ${targetVideoId}`);
          }
        } catch (error) {
          console.error(`❌ Error processing target video ${video._id}:`, error);
        }
      }));
    }

    return {
      success: true,
      processedCount,
      totalCount
    };
  } catch (error) {
    console.error('Error ensuring embeddings:', error);
    return {
      success: false,
      processedCount: 0,
      totalCount: 1 + targetVideos.length,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Performs text-to-video embedding search
 * @param selectedVideoId ID of the selected video
 * @param sourceIndexId Source index ID
 * @param targetIndexId Target index ID
 * @returns Promise with search results
 */
export async function textToVideoEmbeddingSearch(
  selectedVideoId: string,
  sourceIndexId: string,
  targetIndexId: string
): Promise<EmbeddingSearchResult[]> {
  try {
    // Get video details to derive search term
    const videoDetails = await fetchVideoDetails(selectedVideoId, sourceIndexId);

    // Derive search term from video details
    let searchTerm = '';

    // Try to get meaningful text from the video metadata
    if (videoDetails.user_metadata) {
      // Check for descriptive fields in user metadata
      const metadataValues = Object.values(videoDetails.user_metadata)
        .filter(value => typeof value === 'string' && value.length > 0);

      if (metadataValues.length > 0) {
        // Join the first few metadata values
        searchTerm = metadataValues.slice(0, 3).join(' ');
      }
    }

    // If no user metadata, fall back to system metadata
    if (!searchTerm && videoDetails.system_metadata) {
      searchTerm = videoDetails.system_metadata.video_title ||
                  videoDetails.system_metadata.filename ||
                  `Video ${selectedVideoId}`;
    }

    // Remove file extensions if present
    searchTerm = searchTerm.replace(/\.[^/.]+$/, '');

    // Perform the search
    const response = await axios.post<EmbeddingSearchResult[]>('/api/embeddingSearch/textToVideo', {
      searchTerm,
      indexId: targetIndexId
    });

    return response.data;
  } catch (error) {
    console.error('Error in text-to-video search:', error);
    return [];
  }
}

/**
 * Performs video-to-video embedding search
 * @param selectedVideoId ID of the selected video
 * @param sourceIndexId Source index ID
 * @param targetIndexId Target index ID
 * @returns Promise with search results
 */
export async function videoToVideoEmbeddingSearch(
  selectedVideoId: string,
  sourceIndexId: string,
  targetIndexId: string
): Promise<EmbeddingSearchResult[]> {
  try {
    const response = await axios.post<EmbeddingSearchResult[]>('/api/embeddingSearch/videoToVideo', {
      videoId: selectedVideoId,
      indexId: targetIndexId
    });

    return response.data;
  } catch (error) {
    console.error('Error in video-to-video search:', error);
    return [];
  }
}
