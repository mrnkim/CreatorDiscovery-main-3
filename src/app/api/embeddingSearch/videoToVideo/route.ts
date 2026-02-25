import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

type QueryMatch = {
  id: string;
  score?: number;
  metadata?: {
    tl_video_id?: string;
    tl_index_id?: string;
    start_time?: number;
    end_time?: number;
    scope?: string;
    [key: string]: unknown;
  };
  values?: number[];
  resultType?: string;
};

type EnrichedMatch = QueryMatch & {
  sourceStartTime?: number;
  sourceEndTime?: number;
};

const MAX_SEGMENTS_PER_VIDEO = 3;

export async function POST(req: Request) {
  try {
    const { videoId, indexId } = await req.json();
    const index = getPineconeIndex();

    // First, get the original video's clip embedding (limit to top clips for performance)
    const originalClipQuery = await index.query({
      filter: {
        tl_video_id: videoId,
        scope: 'clip'
      },
      topK: 10, // Reduced from 100 to 10 for better performance
      includeMetadata: true,
      includeValues: true,
      vector: new Array(1024).fill(0)
    });

    // If we found matching clips, search for similar videos for each match
    const similarResults: { matches: QueryMatch[]; sourceStartTime?: number; sourceEndTime?: number }[] = [];
    if (originalClipQuery.matches.length > 0) {
      // Process clips in parallel with concurrency limit
      const MAX_CONCURRENT_CLIPS = 3;

      for (let i = 0; i < originalClipQuery.matches.length; i += MAX_CONCURRENT_CLIPS) {
        const clipBatch = originalClipQuery.matches.slice(i, i + MAX_CONCURRENT_CLIPS);

        const batchResults = await Promise.all(
          clipBatch.map(async (originalClip) => {
            const vectorValues = originalClip.values || new Array(1024).fill(0);
            const queryResult = await index.query({
              vector: vectorValues,
              filter: {
                tl_index_id: indexId,
                scope: 'clip'
              },
              topK: 5,
              includeMetadata: true,
            });

            return {
              matches: queryResult.matches as QueryMatch[],
              sourceStartTime: originalClip.metadata?.start_time as number | undefined,
              sourceEndTime: originalClip.metadata?.end_time as number | undefined,
            };
          })
        );

        similarResults.push(...batchResults);
      }
    }

    // Flatten all matches with source clip info attached
    const allEnrichedResults: EnrichedMatch[] = [];

    for (const result of similarResults) {
      for (const match of result.matches) {
        allEnrichedResults.push({
          ...match,
          resultType: 'clip',
          sourceStartTime: result.sourceStartTime,
          sourceEndTime: result.sourceEndTime,
        });
      }
    }

    // Group by tl_video_id: keep best match + collect segment pairs
    const videoMap: Record<string, {
      bestMatch: EnrichedMatch;
      segmentMatches: { sourceStartTime?: number; sourceEndTime?: number; targetStartTime: number; targetEndTime: number; score: number }[];
    }> = {};

    for (const match of allEnrichedResults) {
      const tlVideoId = match.metadata?.tl_video_id as string;
      if (!tlVideoId) continue;

      const segmentPair = {
        sourceStartTime: match.sourceStartTime,
        sourceEndTime: match.sourceEndTime,
        targetStartTime: (match.metadata?.start_time as number) ?? 0,
        targetEndTime: (match.metadata?.end_time as number) ?? 0,
        score: match.score ?? 0,
      };

      if (!videoMap[tlVideoId]) {
        videoMap[tlVideoId] = {
          bestMatch: match,
          segmentMatches: [segmentPair],
        };
      } else {
        if ((match.score ?? 0) > (videoMap[tlVideoId].bestMatch.score ?? 0)) {
          videoMap[tlVideoId].bestMatch = match;
        }
        videoMap[tlVideoId].segmentMatches.push(segmentPair);
      }
    }

    // Build final results with top segment matches per video
    const uniqueResults = Object.values(videoMap).map(({ bestMatch, segmentMatches }) => ({
      ...bestMatch,
      segmentMatches: segmentMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SEGMENTS_PER_VIDEO),
    }));

    // Sort by score
    const sortedResults = uniqueResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return NextResponse.json(sortedResults);

  } catch (error) {
    console.error('Error in embedding search:', error);
    return NextResponse.json(
      { error: 'Failed to process embedding search' },
      { status: 500 }
    );
  }
}
