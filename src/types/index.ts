// UI Component Types
export type Size = 'sm' | 'md' | 'lg';
export type Color = 'default' | 'primary';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: Size;
  color?: Color;
}

export interface VideoProps {
  videoId: string | null;
  indexId: string;
  showTitle?: boolean;
  videoDetails?: VideoData;
  playing?: boolean;
  onPlay?: () => void;
}

export interface VideosDropDownProps {
  indexId: string;
  onVideoChange: (videoId: string) => void;
  videosData: {
    pages: VideoPage[];
    pageParams: unknown[];
  };
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  selectedFile: File | null;
  taskId: string | null;
  footageVideoId: string | null;
}

// Video Data Types
export interface VideoData {
  _id: string;
  index_id?: string;
  system_metadata?: {
    filename?: string;
    duration?: number;
    video_title?: string;
    fps?: number;
    height?: number;
    width?: number;
    size?: number;
    model_names?: string[];
  };
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
    updated_at?: string;
  };
  user_metadata?: Record<string, unknown>;
  source?: Record<string, unknown>;
  embedding?: {
    video_embedding?: {
      segments?: Segment[];
    };
  };
}

export type VideoDetails = VideoData;

// API Response Types
export interface PaginatedResponse {
  data: VideoData[];
  page_info: {
    page: number;
    total_page: number;
    total_count: number;
  };
}

export interface VideoPage {
  data: VideoData[];
  page_info: {
    limit_per_page: number;
    page: number;
    total_duration: number;
    total_page: number;
    total_results: number;
  };
}

// Embedding and Search Types
export interface Segment {
  start_offset_sec?: number;
  end_offset_sec?: number;
  embedding_option?: string;
  embedding_scope?: string;
  float?: number[];
}

export interface EmbeddingSearchResult {
  id?: string;
  metadata?: {
    tl_video_id?: string;
    tl_index_id?: string;
    video_title?: string;
    video_file?: string;
    start_time?: number;
    end_time?: number;
    scope?: string;
    category?: string;
    [key: string]: unknown;
  };
  score: number;
  textScore?: number;
  videoScore?: number;
  originalSource?: 'TEXT' | 'VIDEO' | 'BOTH';
}

export interface SimilarVideoResultsProps {
  results: EmbeddingSearchResult[];
  indexId: string;
}

export interface SelectedVideoData {
  id: string;
  url: string;
  title: string;
  score?: number;
  textScore?: number;
  videoScore?: number;
  originalSource?: 'TEXT' | 'VIDEO' | 'BOTH';
  metadata?: VideoData;
}

// Embedding Check Result
export interface EmbeddingCheckResult {
  success: boolean;
  processedCount: number;
  totalCount: number;
  message?: string;
}
