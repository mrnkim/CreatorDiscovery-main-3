# Creator Discovery

Creator Discovery is a Next.js 15 application that showcases Twelve Labs video-understanding technology through three production-ready demos:

1. **Creator – Brand Match** – find the best creator videos for a given brand video (and vice-versa) using multimodal embeddings stored in Pinecone.
2. **Semantic Search** – unified text & image search across brand/creator indices with rich facet filtering.
3. **Brand Mention Detection** – automatic extraction and visualization of brand/product appearances inside creator videos.

Together these features illustrate how to combine Twelve Labs APIs with vector search and modern React tooling to build powerful media-intelligence products.

---

## Key Features

| Feature | Highlights |
|---------|------------|
| **Creator–Brand Match** | • Generates text & video embeddings (Twelve Labs Embed API) <br>• Stores/queries in Pinecone with simple 15 % boost when a clip appears in both text & video results <br>• Bidirectional *Source → Target* toggle (Brand→Creator default) <br>• React Query powered dropdown & results grid |
| **Semantic Search** | • Text **and** image search (Search API) <br>• Optional image cropping modal before search <br>• Scope toggles: **All · Brand · Creator** <br>• Facet filters: Brand / Creator category, Vertical / Horizontal format <br>• Clickable thumbnails open a modal preview on the exact time-range |
| **Brand Mention Detection** | • Uses **Analyze** API with a structured prompt to extract product events <br>• Zod validation & deduplication/merging of overlapping events <br>• Library & per-video heatmaps with *Total Exposure* summary row (50 time buckets) <br>• Bounding-box overlay and event description in video modal <br>• Filters: creators, formats, regions, brands, duration threshold, time window |

---

## Architecture & Design

### Tech Stack
- **Next.js 15 App Router** (SSR + API routes)
- **TypeScript** throughout
- **React Query** for data-fetching / caching
- **TailwindCSS v4** with inline CSS variables (see `src/app/globals.css`)
- **Zod** for runtime schema validation
- **Pinecone** vector DB for embeddings

### High-Level Data Flow

| Flow | Steps |
|------|-------|
| Creator–Brand Match | ① Select source video → ② Ensure embeddings exist (store via `/api/vectors/store`) → ③ Query Pinecone (`/api/embeddingSearch/...`) → ④ Merge & boost results → ⑤ Show grid |
| Semantic Search (Text) | ① POST `/api/search/text` → ② Twelve Labs Search API parallel across indices → ③ Normalize & merge → ④ Fetch video details for UI |
| Semantic Search (Image) | Same as text but multipart upload to Search API (image or cropped blob) |
| Brand Mention Detection | ① GET/POST `/api/brand-mentions/events` → ② If cached, return; else POST `/api/brand-mentions/analyze` → ③ Parse, validate, deduplicate → ④ Save to `user_metadata` → ⑤ Build heatmap buckets in client |

### Project Structure (highlights)

```
src/
  app/
    creator-brand-match/           ← feature page 1 (page.tsx)
    semantic-search/               ← feature page 2
    brand-mention-detection/       ← feature page 3
    api/
      embeddingSearch/…            ← textToVideo & videoToVideo routes
      search/{text,image,byToken}  ← semantic search routes
      brand-mentions/{analyze,events}
      videos/…                     ← Twelve Labs video proxy routes
      vectors/{exists,store,…}
      proxy-image/route.ts         ← remote image CORS proxy
  components/
    Heatmap.tsx, VideoModalSimple.tsx, VideosDropdown.tsx …
  providers/
    ReactQueryProvider.tsx
  utils/
    pinecone.ts, heatmap.ts
  types/
    index.ts, brandMentions.ts
```

---

## Setup & Configuration

### Prerequisites
- **Node 18 or later**
- **npm** (or pnpm/yarn)

### Environment Variables

Create `.env.local` (or copy the example) with:

```
TWELVELABS_API_KEY=YOUR_API_KEY
TWELVELABS_API_BASE_URL=https://api.twelvelabs.io
NEXT_PUBLIC_BRAND_INDEX_ID=brd_xxxxxxxxx
NEXT_PUBLIC_CREATOR_INDEX_ID=crtr_xxxxxxxxx
PINECONE_API_KEY=YOUR_PINECONE_KEY
PINECONE_INDEX=creator-discovery
```

### Install & Run

```bash
# install deps
npm install

# dev server (http://localhost:3000)
npm run dev

# production build
npm run build
npm start
```

### Quick Verification

1. `GET /api/vectors/test-connection` → should return Pinecone stats.
2. Open:
   - `/creator-brand-match`
   - `/semantic-search`
   - `/brand-mention-detection`

If pages render without errors the env vars are configured correctly.

---

## Usage Guide

| Path | What to do |
|------|------------|
| `/creator-brand-match` | 1. Choose *Brand* or *Creator* source. 2. Pick a video from dropdown. 3. Click **Find Matches**. 4. Review top results. |
| `/semantic-search` | • Enter text and press **Search** – or – click **Search by Image**, upload/crop, then search.<br>• Use facet chips to narrow results.<br>• Click a thumbnail for in-context modal playback. |
| `/brand-mention-detection` | 1. Apply filters (optional). 2. In library view, click a heatmap cell to drill into per-video view. 3. Click a brand-time cell to open the modal with bounding box and description. |

---

## Selected API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/embeddingSearch/textToVideo` | Generate text embedding → query Pinecone |
| `POST /api/embeddingSearch/videoToVideo` | Use video embedding segments to query |
| `POST /api/search/text` / `POST /api/search/image` | Unified semantic search (text / image) |
| `GET/POST /api/brand-mentions/events` | Cached retrieval or batch analyze for brand mentions |
| `POST /api/brand-mentions/analyze` | Run Twelve Labs **Analyze** prompt and deduplicate |
| `GET /api/videos` | List videos in an index |
| `PUT /api/videos/updateUserMetadata` | Save arbitrary `user_metadata` |
| `POST /api/vectors/store` | Upsert embedding vectors into Pinecone |
| `GET /api/proxy-image` | Server-side fetch of remote image to avoid CORS |

---

## Notes & Troubleshooting

- **Missing Env Vars** – Most API routes return `500` with clear error if keys/IDs are absent.
- **Rate Limits** – Twelve Labs free tier may throttle; check response status 429.
- **Embeddings not ready** – Match feature shows progress bar while vectors are stored; rerun if interrupted.
- **Thumbnails vs Video URLs** – Some index items may lack `hls.video_url`; modal opens only when present.
- **Large video sets** – `/api/videos` caps to 50 per request; update pagination logic if needed.

Happy hacking!
