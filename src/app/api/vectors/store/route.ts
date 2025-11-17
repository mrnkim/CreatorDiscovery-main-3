import { NextResponse } from 'next/server';
import { Segment } from '@/types/index';
import { getPineconeIndex } from '@/utils/pinecone';

function sanitizeVectorId(str: string) {
  const sanitized = str
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace other special characters with underscore
    .replace(/_{2,}/g, '_'); // Replace multiple consecutive underscores with single underscore
  return sanitized;
}

export async function POST(request: Request) {
  try {
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error(`❌ Failed to parse request body:`, parseError);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { videoId, videoName, embedding, indexId } = requestBody;

    if (!videoId || !embedding) {
      console.error(`❌ Missing required parameters: videoId or embedding`);
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // First check if embedding has valid segments
    if (!embedding.video_embedding || !embedding.video_embedding.segments || embedding.video_embedding.segments.length === 0) {
      console.error(`❌ Invalid embedding structure - no segments found`);
      return NextResponse.json(
        { error: 'Invalid embedding structure - missing segments' },
        { status: 400 }
      );
    }

    // Step 1: Extract video title from metadata
    let videoTitle = '';
    let actualFileName = '';

    // First priority: Use system_metadata from the embedding
    if (embedding.system_metadata) {
      if (embedding.system_metadata.video_title) {
        videoTitle = embedding.system_metadata.video_title;
      }

      if (embedding.system_metadata.filename) {
        actualFileName = embedding.system_metadata.filename;
      }
    }

    // Second priority: Use provided videoName if first priority not available
    if ((!videoTitle || !videoTitle.trim()) && videoName && videoName.trim() !== '') {
      // If videoName contains an extension, use it as filename and the name part as title
      if (videoName.includes('.')) {
        actualFileName = videoName;
        videoTitle = videoName.split('.')[0];
      } else {
        // If no extension, use as title and construct a filename
        videoTitle = videoName;
        if (!actualFileName) {
          actualFileName = `${videoName}.mp4`; // Default extension
        }
      }
    }

    // Check other locations if still not found
    if (!videoTitle || !videoTitle.trim()) {
      // Check in embedding.metadata
      if (embedding.metadata && embedding.metadata.filename) {
        actualFileName = embedding.metadata.filename;

        if (!videoTitle && actualFileName.includes('.')) {
          videoTitle = actualFileName.split('.')[0];
        }
      }
      // Check in embedding.hls.metadata
      else if (embedding.hls && embedding.hls.metadata && embedding.hls.metadata.filename) {
        actualFileName = embedding.hls.metadata.filename;

        if (!videoTitle && actualFileName.includes('.')) {
          videoTitle = actualFileName.split('.')[0];
        }
      }
      // Check in embedding.source.filename
      else if (embedding.source && embedding.source.filename) {
        actualFileName = embedding.source.filename;

        if (!videoTitle && actualFileName.includes('.')) {
          videoTitle = actualFileName.split('.')[0];
        }
      }
    }

    // Fall back to video ID if still nothing found
    if (!videoTitle || !videoTitle.trim()) {
      videoTitle = videoId;
    }

    if (!actualFileName || !actualFileName.trim()) {
      actualFileName = `${videoTitle}.mp4`; // Default extension
    }

    // Determine vector ID base by sanitizing the title
    const vectorIdBase = sanitizeVectorId(videoTitle.replace(/\.[^/.]+$/, '')); // Remove file extension if present

    // Determine category based on the index ID
    const category = indexId.toLowerCase().includes('brand') ? 'brand' : 'creator';

    const vectorDimension = embedding.video_embedding.segments[0]?.float?.length || 0;

    // Check vector dimension
    if (vectorDimension !== 1024) {
      console.warn(`⚠️ WARNING: Vector dimension is ${vectorDimension}, expected 1024`);
    }

    // Create vectors from embedding segments
    const vectors = embedding.video_embedding.segments.map((segment: Segment, index: number) => {
      // Create a meaningful and unique vector ID
      const vectorId = `${vectorIdBase}_segment${index + 1}`;

      const vector = {
        id: vectorId,
        values: segment.float,
        metadata: {
          video_file: actualFileName,
          video_title: videoTitle,
          video_segment: index + 1,
          start_time: segment.start_offset_sec,
          end_time: segment.end_offset_sec,
          scope: segment.embedding_scope,
          tl_video_id: videoId,
          tl_index_id: indexId,
          category
        }
      };

      return vector;
    });

    try {
      const index = getPineconeIndex();

      // Upload vectors in batches
      const batchSize = 100;
      const totalBatches = Math.ceil(vectors.length / batchSize);

      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        try {
          // Test Pinecone connection before upserting
          try {
            await index.describeIndexStats();
          } catch (statsError) {
            console.error(`❌ Pinecone connection test failed:`, statsError);
            throw new Error(`Failed to connect to Pinecone: ${statsError instanceof Error ? statsError.message : 'Unknown error'}`);
          }

          // Perform the actual upsert
          await index.upsert(batch);
        } catch (error) {
          console.error(`❌ Error in batch ${batchNumber}:`, error);
          throw error;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully stored ${vectors.length} vectors for video ${videoId}`
      });
    } catch (error) {
      console.error('❌ Error in Pinecone operation:', error);
      return NextResponse.json(
        {
          error: 'Failed to store embeddings in Pinecone',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Error storing embeddings:', error);
    return NextResponse.json(
      {
        error: 'Failed to store embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
