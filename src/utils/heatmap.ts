import { ProductEvent, PerVideoHeatmapRow, LibraryHeatmapRow, HeatmapBucket } from '@/types/brandMentions';

/**
 * Creates an array of time buckets as percentages of total duration
 * @param totalDuration Total duration in seconds
 * @param numBuckets Number of buckets to create
 * @returns Array of buckets with start and end percentages (0-100)
 */
export function bucketizeTimeline(totalDuration: number, numBuckets: number): { start: number; end: number }[] {
  if (numBuckets <= 0) {
    throw new Error('Number of buckets must be greater than zero');
  }

  const buckets: { start: number; end: number }[] = [];
  const bucketSize = 100 / numBuckets;

  for (let i = 0; i < numBuckets; i++) {
    const start = i * bucketSize;
    const end = (i + 1) * bucketSize;
    buckets.push({ start, end });
  }

  return buckets;
}

/**
 * Calculates the overlap duration between an event and a time bucket
 * @param eventStart Event start time in seconds
 * @param eventEnd Event end time in seconds
 * @param bucketStart Bucket start time in seconds
 * @param bucketEnd Bucket end time in seconds
 * @returns Overlap duration in seconds
 */
function calculateOverlap(
  eventStart: number,
  eventEnd: number,
  bucketStart: number,
  bucketEnd: number
): number {
  return Math.max(0, Math.min(eventEnd, bucketEnd) - Math.max(eventStart, bucketStart));
}

/**
 * Aggregates product events by brand or product for a single video
 * @param events Array of product events
 * @param numBuckets Number of buckets to create
 * @param by Group by 'brand' or 'product'
 * @returns Array of heatmap rows with bucket values
 */
export function aggregatePerVideo(
  events: ProductEvent[],
  numBuckets: number,
  by: 'brand' | 'product' = 'brand',
  videoDuration?: number
): PerVideoHeatmapRow[] {
  if (!events || events.length === 0) {
    return [];
  }

  // Use provided duration or find from the latest event end time
  const duration = videoDuration || Math.max(...events.map(event => event.timeline_end));

  if (duration <= 0) {
    return [];
  }

  // Create time buckets in seconds
  const bucketDuration = duration / numBuckets;

  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
    startSec: i * bucketDuration,
    endSec: (i + 1) * bucketDuration,
    startPct: (i * bucketDuration / duration) * 100,
    endPct: ((i + 1) * bucketDuration / duration) * 100
  }));

  // Group events by brand or product
  const groupedEvents: Record<string, ProductEvent[]> = {};

  events.forEach(event => {
    const key = by === 'brand' ? event.brand : event.product_name;
    if (!groupedEvents[key]) {
      groupedEvents[key] = [];
    }
    groupedEvents[key].push(event);
  });

  // Create heatmap rows
  const rows: PerVideoHeatmapRow[] = [];

  Object.entries(groupedEvents).forEach(([key, groupEvents]) => {

    // First, assign each event to its best matching bucket to avoid duplicates
    const eventToBucketMap = new Map<number, number>(); // eventIndex -> bucketIndex

    groupEvents.forEach((event, eventIndex) => {
      let bestBucketIndex = -1;
      let bestOverlap = 0;

      buckets.forEach((bucket, bucketIndex) => {
        const overlap = calculateOverlap(
          event.timeline_start,
          event.timeline_end,
          bucket.startSec,
          bucket.endSec
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

    // Create buckets with values only from assigned events
    const heatmapBuckets: HeatmapBucket[] = buckets.map((bucket, bucketIndex) => {
      let value = 0;

      // Add value only from events assigned to this specific bucket
      let eventCount = 0;
      groupEvents.forEach((event, eventIndex) => {
        if (eventToBucketMap.get(eventIndex) === bucketIndex) {
          eventCount++;
          // Use a consistent value to show event presence (normalized by event duration)
          value += event.timeline_end - event.timeline_start;
        }
      });

      // If multiple events are assigned to the same bucket, use the count as intensity
      if (eventCount > 1) {
        // This shouldn't happen with better bucket granularity, but handle it gracefully
        value = eventCount; // Use event count as intensity
      }

      return {
        start: bucket.startPct,
        end: bucket.endPct,
        value
      };
    });

    rows.push({
      key,
      label: key,
      buckets: heatmapBuckets
    });
  });

  // Sort rows by total exposure (sum of bucket values) in descending order
  return rows.sort((a, b) => {
    const sumA = a.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    const sumB = b.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    return sumB - sumA;
  });
}

/**
 * Aggregates product events across multiple videos for a library view
 * @param videoDurations Record of video durations by video ID
 * @param eventsByVideo Record of events by video ID
 * @param numBuckets Number of buckets to create
 * @param brandFilter Optional array of brands to filter by
 * @returns Array of library heatmap rows
 */
export function aggregateLibrary(
  videoDurations: Record<string, number>,
  eventsByVideo: Record<string, ProductEvent[]>,
  numBuckets: number,
  brandFilter?: string[]
): LibraryHeatmapRow[] {
  const videoIds = Object.keys(eventsByVideo);

  if (videoIds.length === 0) {
    return [];
  }

  // We'll create buckets per video to match per-video view granularity

  // Process each video
  return videoIds.map(videoId => {
    const events = eventsByVideo[videoId] || [];
    const duration = videoDurations[videoId] || 0;

    if (duration <= 0 || events.length === 0) {
      // Return empty buckets if no duration or events
      const emptyBuckets = Array.from({ length: numBuckets }, (_, i) => ({
        start: (i / numBuckets) * 100,
        end: ((i + 1) / numBuckets) * 100,
        value: 0,
        brands: [] as string[]
      }));
      return {
        video_id: videoId,
        buckets: emptyBuckets
      };
    }

    // Filter events by brand if brandFilter is provided
    const filteredEvents = brandFilter && brandFilter.length > 0
      ? events.filter(event => brandFilter.includes(event.brand))
      : events;

    // Create time buckets in seconds (same as per-video view)
    const bucketDuration = duration / numBuckets;

    // First, assign each event to its best matching bucket (same logic as per-video view)
    const eventToBucketMap = new Map<number, number>(); // eventIndex -> bucketIndex

    filteredEvents.forEach((event, eventIndex) => {
      let bestBucketIndex = -1;
      let bestOverlap = 0;

      for (let bucketIndex = 0; bucketIndex < numBuckets; bucketIndex++) {
        const startSec = bucketIndex * bucketDuration;
        const endSec = (bucketIndex + 1) * bucketDuration;

        const overlap = calculateOverlap(
          event.timeline_start,
          event.timeline_end,
          startSec,
          endSec
        );

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestBucketIndex = bucketIndex;
        }
      }

      if (bestBucketIndex >= 0) {
        eventToBucketMap.set(eventIndex, bestBucketIndex);
      }
    });

    // Now create buckets with values only from assigned events
    const buckets: HeatmapBucket[] = Array.from({ length: numBuckets }, (_, i) => {
      const startSec = i * bucketDuration;
      const endSec = (i + 1) * bucketDuration;
      const startPct = (startSec / duration) * 100;
      const endPct = (endSec / duration) * 100;

      let totalOverlap = 0;
      const brandsInBucket = new Set<string>();

      // Add value only from events assigned to this specific bucket
      filteredEvents.forEach((event, eventIndex) => {
        if (eventToBucketMap.get(eventIndex) === i) {
          const overlap = calculateOverlap(
            event.timeline_start,
            event.timeline_end,
            startSec,
            endSec
          );
          totalOverlap += overlap;
          brandsInBucket.add(event.brand);
        }
      });

      return {
        start: startPct,
        end: endPct,
        value: totalOverlap,
        brands: Array.from(brandsInBucket)
      };
    });

    return {
      video_id: videoId,
      buckets
    };
  }).sort((a, b) => {
    // Sort by total exposure in descending order
    const sumA = a.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    const sumB = b.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    return sumB - sumA;
  });
}

/**
 * Normalizes bucket values to a 0-1 scale for consistent visualization
 * @param rows Array of heatmap rows (either PerVideoHeatmapRow or LibraryHeatmapRow)
 * @returns Same array with normalized values
 */
export function normalizeHeatmapValues<T extends { buckets: HeatmapBucket[] }>(rows: T[]): T[] {
  if (rows.length === 0) return rows;

  // Find the maximum value across all buckets
  let maxValue = 0;
  rows.forEach(row => {
    row.buckets.forEach(bucket => {
      maxValue = Math.max(maxValue, bucket.value);
    });
  });

  if (maxValue === 0) return rows;

  // Create a deep copy and normalize values
  return rows.map(row => ({
    ...row,
    buckets: row.buckets.map(bucket => ({
      ...bucket,
      value: bucket.value / maxValue
    }))
  }));
}
