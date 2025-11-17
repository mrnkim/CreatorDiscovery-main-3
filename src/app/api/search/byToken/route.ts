import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export const runtime = "nodejs";

interface SearchResult {
  video_id: string;
  thumbnail_url: string;
  start: number;
  end: number;
  confidence: string;
  score: number;
  index_id: string;
}

// Raw item coming from Twelve Labs search response
interface TLSearchItem {
  video_id: string;
  thumbnail_url: string;
  start: number;
  end: number;
  confidence: string;
  score: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pageToken = searchParams.get("pageToken");
    const indexId = searchParams.get("indexId");

    const apiKey = process.env.TWELVELABS_API_KEY;
    const apiBaseUrl = process.env.TWELVELABS_API_BASE_URL;

    if (!apiKey || !apiBaseUrl) {
      return NextResponse.json(
        { error: "API key or API base URL is not set" },
        { status: 500 }
      );
    }

    if (!pageToken) {
      return NextResponse.json(
        { error: "Page token is required" },
        { status: 400 }
      );
    }

    if (!indexId) {
      return NextResponse.json(
        { error: "Index ID is required" },
        { status: 400 }
      );
    }

    // Call the Twelve Labs API with the page token
    // According to the API docs: GET https://api.twelvelabs.io/v1.3/search/:page-token
    const url = `${apiBaseUrl}/search/${pageToken}`;
    const response = await axios.get(url, {
      headers: {
        "accept": "application/json",
        "x-api-key": apiKey,
      },
      params: {
        index_id: indexId,
      },
    });

    const responseData = response.data;

    if (!responseData || !responseData.data) {
      return NextResponse.json(
        { error: "Invalid response from Twelve Labs API" },
        { status: 500 }
      );
    }

    // Normalize the results
    const normalizedResults: SearchResult[] = (responseData.data as TLSearchItem[]).map((item: TLSearchItem) => ({
      video_id: item.video_id,
      thumbnail_url: item.thumbnail_url,
      start: item.start,
      end: item.end,
      confidence: item.confidence,
      score: item.score,
      index_id: indexId
    }));

    // Return the search results as a JSON response
    return NextResponse.json({
      pageInfo: responseData.page_info || {},
      data: normalizedResults,
    });
  } catch (error: unknown) {
    // Attempt to extract meaningful status/message information
    const err = error as { response?: { status?: number; data?: { message?: string } } ; message?: string };
    console.error("Error in byToken search handler:", err?.response?.data || err);

    const status = err?.response?.status ?? 500;
    const message = err?.response?.data?.message ?? err?.message ?? "Unexpected error";

    return NextResponse.json({ error: message }, { status });
  }
}
