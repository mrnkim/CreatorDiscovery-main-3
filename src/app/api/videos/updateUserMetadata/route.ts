import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Type definition for metadata update request
interface UserMetadataUpdateRequest {
  videoId: string;
  indexId: string;
  user_metadata: Record<string, string | number | boolean>;
}

export async function PUT(request: NextRequest) {
  try {
    // Parse request body
    const body: UserMetadataUpdateRequest = await request.json();
    const { videoId, indexId, user_metadata } = body;

    // Validate required parameters
    if (!videoId || !indexId) {
      console.error('❌ Missing required parameters:', { videoId, indexId });
      return NextResponse.json(
        { error: 'Video ID and Index ID are required' },
        { status: 400 }
      );
    }

    if (!user_metadata || typeof user_metadata !== 'object') {
      console.error('❌ Invalid user_metadata:', user_metadata);
      return NextResponse.json(
        { error: 'user_metadata must be a valid object' },
        { status: 400 }
      );
    }


    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('❌ Missing API key or base URL in environment variables');
      return NextResponse.json(
        { error: 'API credentials not configured' },
        { status: 500 }
      );
    }

    // Prepare API request
    const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

    const requestBody = {
      user_metadata
    };

    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(requestBody)
    };

    // Call Twelve Labs API
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ TwelveLabs API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to update metadata: ${response.statusText} - ${errorText}` },
        { status: response.status }
      );
    }

    // For 204 No Content response, don't try to parse JSON
    if (response.status === 204) {
      return NextResponse.json({
        success: true,
        message: 'Video metadata updated successfully'
      });
    }

    // For other success responses, try to parse JSON
    try {
      const responseData = await response.json();
      return NextResponse.json({
        success: true,
        message: 'Video metadata updated successfully',
        data: responseData
      });
    } catch (parseError) {
      return NextResponse.json({
        success: true,
        message: 'Video metadata updated successfully'
      });
    }
  } catch (error) {
    console.error('❌ Error updating video metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
