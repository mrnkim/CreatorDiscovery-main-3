import { NextResponse } from 'next/server';
import { getPineconeClient, getPineconeIndex } from '@/utils/pinecone';

export async function GET() {
  try {
    // Check environment variables
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndex = process.env.PINECONE_INDEX;

    if (!pineconeApiKey) {
      console.error('❌ PINECONE_API_KEY is not defined in environment variables');
      return NextResponse.json(
        { error: 'PINECONE_API_KEY is not defined', success: false },
        { status: 500 }
      );
    }

    if (!pineconeIndex) {
      console.error('❌ PINECONE_INDEX is not defined in environment variables');
      return NextResponse.json(
        { error: 'PINECONE_INDEX is not defined', success: false },
        { status: 500 }
      );
    }

    // Initialize the Pinecone client and verify connection
    getPineconeClient();

    // Try to get the index
    const index = getPineconeIndex();

    // Try to get index stats
    const stats = await index.describeIndexStats();

    return NextResponse.json({
      success: true,
      message: 'Pinecone connection test successful',
      indexName: pineconeIndex,
      stats: {
        dimension: stats.dimension,
        namespaces: stats.namespaces ? Object.keys(stats.namespaces).length : 0,
        totalVectors: stats.totalRecordCount
      }
    });
  } catch (error) {
    console.error('❌ Pinecone connection test failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to connect to Pinecone',
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      { status: 500 }
    );
  }
}
