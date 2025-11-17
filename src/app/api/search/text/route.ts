import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface SearchRequest {
  query: string;
  scope: 'brand' | 'creator' | 'all';
  page_limit?: number;
  page?: number;
}

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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.TWELVELABS_API_KEY;
    const apiBaseUrl = process.env.TWELVELABS_API_BASE_URL;
    const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID;
    const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID;

    if (!apiKey || !apiBaseUrl) {
      return NextResponse.json(
        { error: "API key or API base URL is not set" },
        { status: 500 }
      );
    }

    if (!brandIndexId || !creatorIndexId) {
      return NextResponse.json(
        { error: "Brand or Creator index ID is not set" },
        { status: 500 }
      );
    }

    const { query, scope, page_limit = 12, page = 1 }: SearchRequest = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    // Determine which indices to search based on scope
    const indicesToSearch =
      scope === 'all' ? [brandIndexId, creatorIndexId] :
      scope === 'brand' ? [brandIndexId] :
      scope === 'creator' ? [creatorIndexId] : [];

    if (indicesToSearch.length === 0) {
      return NextResponse.json(
        { error: "Invalid scope specified" },
        { status: 400 }
      );
    }

    // Helper function to retry API calls
    const retryApiCall = async (indexId: string, retryCount = 0): Promise<{ indexId: string; responseData: unknown }> => {
      const maxRetries = 2;
      const retryDelay = 1000 * (retryCount + 1); // 1s, 2s delays

      try {
        const searchDataForm = new FormData();
        searchDataForm.append("search_options", "visual");
        searchDataForm.append("search_options", "audio");
        searchDataForm.append("group_by", "clip");
        searchDataForm.append("sort_option", "score");
        searchDataForm.append("page_limit", page_limit.toString());
        searchDataForm.append("page", page.toString());
        searchDataForm.append("index_id", indexId);
        searchDataForm.append("query_text", query);

        const url = `${apiBaseUrl}/search`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            // Let fetch set the multipart boundary automatically
            "x-api-key": apiKey,
          },
          body: searchDataForm,
        });

        if (!response.ok) {
          const text = await response.text();

          // Handle specific error cases
          if (response.status === 500 && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return retryApiCall(indexId, retryCount + 1);
          } else if (response.status === 500) {
            throw new Error(
              `Twelve Labs API is temporarily unavailable (500). Please try again in a few moments.`
            );
          } else if (response.status === 429) {
            throw new Error(
              `Rate limit exceeded. Please wait a moment before searching again.`
            );
          } else if (response.status === 401) {
            throw new Error(
              `Authentication failed. Please check your API configuration.`
            );
          } else {
            throw new Error(
              `Twelve Labs API error ${response.status}: ${text || response.statusText}`
            );
          }
        }

        const responseData = await response.json();

        return {
          indexId,
          responseData,
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('500') && retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return retryApiCall(indexId, retryCount + 1);
        }
        throw error;
      }
    };

    const searchPromises = indicesToSearch.map(indexId => retryApiCall(indexId));
    const searchResults = await Promise.all(searchPromises);

    // Process and merge results
    const pageInfoByIndex: Record<string, unknown> = {};
    let mergedResults: SearchResult[] = [];

    searchResults.forEach(({ indexId, responseData }) => {
      const data = responseData as { data?: TLSearchItem[]; page_info?: unknown };
      if (data && data.data) {
        // Store page info for this index
        pageInfoByIndex[indexId] = data.page_info || {};

        // Normalize and add index information to each result
        const normalizedResults = (data.data as TLSearchItem[]).map((item: TLSearchItem) => ({
          video_id: item.video_id,
          thumbnail_url: item.thumbnail_url,
          start: item.start,
          end: item.end,
          confidence: item.confidence,
          score: item.score,
          index_id: indexId
        }));

        mergedResults = [...mergedResults, ...normalizedResults];
      }
    });

    // Sort merged results by score in descending order
    mergedResults.sort((a, b) => b.score - a.score);

    // Return the search results as a JSON response
    return NextResponse.json({
      pageInfoByIndex,
      data: mergedResults,
      hasMore: Object.values(pageInfoByIndex).some((pageInfo: unknown) => (pageInfo as { next_page_token?: string }).next_page_token),
      nextPageTokens: Object.fromEntries(
        Object.entries(pageInfoByIndex).map(([indexId, pageInfo]: [string, unknown]) => [
          indexId,
          (pageInfo as { next_page_token?: string }).next_page_token || null
        ])
      )
    });
  } catch (error: unknown) {
    // Attempt to extract meaningful status/message information
    const err = error as {
      response?: { status?: number; data?: { message?: string } };
      message?: string;
    };
    console.error("Error in text search handler:", err?.response?.data || err);

    const status = err?.response?.status ?? 500;
    const message =
      err?.response?.data?.message ?? err?.message ?? "Unexpected error";

    return NextResponse.json({ error: message }, { status });
  }
}
