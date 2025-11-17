import { NextRequest, NextResponse } from "next/server";
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

    // Parse the multipart form data
    const formData = await request.formData();
    const scope = formData.get("scope") as 'brand' | 'creator' | 'all' || 'all';
    const pageLimit = Number(formData.get("page_limit")) || 12;
    
    // Get the image query (either file or URL)
    const imgFile = formData.get("file");
    const imgQuery = formData.get("query");

    if (!imgFile && !imgQuery) {
      return NextResponse.json(
        { error: "No image file or URL provided" },
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

    // Search each index in parallel
    const searchPromises = indicesToSearch.map(async (indexId) => {
      const searchDataForm = new FormData();
      searchDataForm.append("search_options", "visual");
      searchDataForm.append("group_by", "clip");
      searchDataForm.append("threshold", "medium");
      searchDataForm.append("sort_option", "score");
      searchDataForm.append("page_limit", pageLimit.toString());
      searchDataForm.append("index_id", indexId);
      searchDataForm.append("query_media_type", "image");

      // Add either the file or URL to the form data
      if (imgQuery) {
        searchDataForm.append("query_media_url", imgQuery);
      } else if (imgFile && imgFile instanceof Blob) {
        // Append the Blob/File directly; undici FormData supports File objects
        const file = imgFile as File;
        searchDataForm.append(
          "query_media_file",
          file,
          file.name || "image.jpg"
        );
      }

      const url = `${apiBaseUrl}/search`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          // Let fetch set the multipart boundary & content-type
          "x-api-key": apiKey,
        },
        body: searchDataForm,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Twelve Labs API error ${response.status}: ${
            text || response.statusText
          }`
        );
      }

      const responseData = await response.json();

      return {
        indexId,
        responseData,
      };
    });

    const searchResults = await Promise.all(searchPromises);

    // Process and merge results
    const pageInfoByIndex: Record<string, unknown> = {};
    let mergedResults: SearchResult[] = [];

    searchResults.forEach(({ indexId, responseData }) => {
      if (responseData && responseData.data) {
        // Store page info for this index
        pageInfoByIndex[indexId] = responseData.page_info || {};

        // Normalize and add index information to each result
        const normalizedResults = (responseData.data as TLSearchItem[]).map(
          (item: TLSearchItem) => ({
          video_id: item.video_id,
          thumbnail_url: item.thumbnail_url,
          start: item.start,
          end: item.end,
          confidence: item.confidence,
          score: item.score,
          index_id: indexId
        })
        );

        mergedResults = [...mergedResults, ...normalizedResults];
      }
    });

    // Sort merged results by score in descending order
    mergedResults.sort((a, b) => b.score - a.score);

    // Return the search results as a JSON response
    return NextResponse.json({
      pageInfoByIndex,
      data: mergedResults,
    });
  } catch (error: unknown) {
    // Attempt to extract meaningful status/message information
    const err = error as {
      response?: { status?: number; data?: { message?: string } };
      message?: string;
    };
    console.error(
      "Error in image search handler:",
      err?.response?.data || err
    );

    const status = err?.response?.status ?? 500;
    const message =
      err?.response?.data?.message ?? err?.message ?? "Unexpected error";

    return NextResponse.json({ error: message }, { status });
  }
}
