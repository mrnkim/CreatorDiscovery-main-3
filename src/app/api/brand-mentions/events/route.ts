import { NextRequest, NextResponse } from 'next/server';
import { ProductEvent, ProductEventArraySchema, VideoAnalysisMetadata } from '@/types/brandMentions';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

interface EventsPostRequest {
  videoIds: string[];
  indexId: string;
  force?: boolean;
}

/**
 * GET handler for retrieving brand mention events for a single video
 * Query params: videoId (required), indexId (required), force (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    const indexId = searchParams.get('indexId');
    const force = searchParams.get('force') === 'true';

    // Validate required parameters
    if (!videoId || !indexId) {
      return NextResponse.json(
        { error: 'videoId and indexId are required query parameters' },
        { status: 400 }
      );
    }

    // First try to get events from video metadata
    if (!force) {
      try {
        const { events, analysis } = await getEventsFromMetadata(videoId, indexId);
        if (events && events.length > 0) {
          return NextResponse.json({ events, analysis });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to retrieve cached events: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue to analyze if cached events retrieval fails
      }
    }

    // If no cached events or force=true, call analyze endpoint
    const analyzeResponse = await fetch(new URL('/api/brand-mentions/analyze', request.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        indexId,
        force: true
      })
    });

    if (!analyzeResponse.ok) {
      const error = await analyzeResponse.text();
      throw new Error(`Failed to analyze video: ${error}`);
    }

    const analyzeResult = await analyzeResponse.json();
    return NextResponse.json({
      events: analyzeResult.events,
      analysis: analyzeResult.analysis || {}
    });
  } catch (error) {
    console.error('❌ Error retrieving brand mention events:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST handler for retrieving brand mention events for multiple videos
 * Body: { videoIds: string[], indexId: string, force?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body: EventsPostRequest = await request.json();
    const { videoIds, indexId, force = false } = body;

    // Validate required parameters
    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json(
        { error: 'videoIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!indexId) {
      return NextResponse.json(
        { error: 'indexId is required' },
        { status: 400 }
      );
    }

    // Process each video
    const results: Record<string, { events: ProductEvent[], analysis: VideoAnalysisMetadata }> = {};
    const errors: Record<string, string> = {};

    await Promise.all(videoIds.map(async (videoId) => {
      try {
        // Try to get events from metadata first
        if (!force) {
          try {
            const { events, analysis } = await getEventsFromMetadata(videoId, indexId);
            if (events && events.length > 0) {
              results[videoId] = { events, analysis };
              return;
            }
          } catch {
            // Continue to analyze if cached events retrieval fails
          }
        }

        // If no cached events or force=true, call analyze endpoint
        const analyzeResponse = await fetch(new URL('/api/brand-mentions/analyze', request.url).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId,
            indexId,
            force: true
          })
        });

        if (!analyzeResponse.ok) {
          const error = await analyzeResponse.text();
          throw new Error(`Failed to analyze video: ${error}`);
        }

        const analyzeResult = await analyzeResponse.json();
        results[videoId] = {
          events: analyzeResult.events,
          analysis: analyzeResult.analysis || {}
        };
      } catch (error) {
        errors[videoId] = error instanceof Error ? error.message : 'Unknown error';
      }
    }));

    return NextResponse.json({
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('❌ Error retrieving brand mention events for multiple videos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to retrieve brand mention events and analysis from video metadata
 */
async function getEventsFromMetadata(videoId: string, indexId: string): Promise<{ events: ProductEvent[], analysis: VideoAnalysisMetadata }> {
  // Fetch video details using existing API route
  const videoDetailUrl = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

  const response = await fetch(videoDetailUrl, {
    headers: {
      'Accept': 'application/json',
      'x-api-key': API_KEY || '',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch video details: ${response.statusText}`);
  }

  const videoDetail = await response.json();

  // Check if brand_product_events exists in user_metadata
  if (videoDetail.user_metadata?.brand_product_events) {
    try {
      const events = JSON.parse(videoDetail.user_metadata.brand_product_events);

      // Validate events with schema
      const validationResult = ProductEventArraySchema.safeParse(events);
      if (validationResult.success) {
        // Extract analysis data from metadata
        const analysis: VideoAnalysisMetadata = {};

        if (videoDetail.user_metadata.video_tones) {
          try {
            analysis.tones = JSON.parse(videoDetail.user_metadata.video_tones);
          } catch {
            console.warn('⚠️ Failed to parse video_tones from metadata');
          }
        }

        if (videoDetail.user_metadata.video_styles) {
          try {
            analysis.styles = JSON.parse(videoDetail.user_metadata.video_styles);
          } catch {
            console.warn('⚠️ Failed to parse video_styles from metadata');
          }
        }

        if (videoDetail.user_metadata.video_creator) {
          analysis.creator = videoDetail.user_metadata.video_creator;
        }

        return { events: validationResult.data, analysis };
      } else {
        console.warn('⚠️ Invalid events format in metadata, will reanalyze');
        throw new Error('Invalid events format in metadata');
      }
    } catch (error) {
      console.warn('⚠️ Failed to parse events from metadata:', error);
      throw new Error('Failed to parse events from metadata');
    }
  }

  // No events found in metadata
  return { events: [], analysis: {} };
}
