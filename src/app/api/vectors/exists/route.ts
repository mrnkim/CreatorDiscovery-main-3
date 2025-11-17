import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('video_id');
  const indexId = searchParams.get('index_id');

  if (!videoId) {
    return NextResponse.json({ error: 'Missing required parameter: video_id' }, { status: 400 });
  }

  try {
    const index = getPineconeIndex();

    // Create filter - if indexId is provided, include it in the filter
    const filter: Record<string, string | number | boolean> = {
      tl_video_id: videoId
    };
    
    if (indexId) {
      filter.tl_index_id = indexId;
    }

    // Query Pinecone using a zero vector with dimension 1024
    // We're only interested in whether any vectors match our filter
    const queryResponse = await index.query({
      vector: new Array(1024).fill(0),
      filter: filter,
      topK: 1,
      includeMetadata: true
    });

    return NextResponse.json({
      exists: queryResponse.matches.length > 0
    });
  } catch (error) {
    console.error('Error checking if vector exists:', error);
    return NextResponse.json({ 
      error: 'Failed to check vector existence',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
