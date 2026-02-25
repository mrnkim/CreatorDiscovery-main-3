# Segment Match Visualization - Handoff

## Branch
`feature/segment-match-visualization`

## Summary
Creator Brand Match에서 매칭 결과를 보여줄 때, 어떤 구간끼리 비슷해서 추천된 건지 시각적으로 표시하도록 개선.

## Changes

### 1. Segment Match Data Pipeline
기존에는 Pinecone에서 클립 대 클립으로 유사도를 검색하면서도, video_id 기준 중복 제거 시 세그먼트 정보를 모두 버리고 있었음. 이제 video별 상위 3개 세그먼트 매치 쌍을 보존하여 프론트까지 전달.

**Files:**
- `src/types/index.ts` — `SegmentMatch` 타입 추가, `EmbeddingSearchResult`에 `segmentMatches?` 필드 추가
- `src/app/api/embeddingSearch/videoToVideo/route.ts` — 소스 클립의 start_time/end_time을 타겟 매치에 첨부, video별 top 3 세그먼트 쌍 보존
- `src/app/api/embeddingSearch/textToVideo/route.ts` — 타겟 클립의 start_time/end_time을 segmentMatches로 수집, video별 top 3 유지

### 2. Result Combination
- `src/app/creator-brand-match/page.tsx` — `combineSearchResults`에서 text/video 양쪽 segmentMatches를 병합, 상위 5개 유지

### 3. Ranking Logic Improvement
기존: 등급(High/Medium/Low) 우선 정렬 + 15% boost → 88% BOTH가 98% VIDEO보다 위에 오는 역전 발생
변경: 순수 점수순 정렬 + 5% boost. 라벨은 시각적 표시로만 사용.

### 4. Segment Playback UX
- 결과 카드에 마우스 올리면 첫 번째 매칭 구간 자동 재생 (muted, loop)
- 마우스 빼면 정지
- 개별 세그먼트 클릭 시 해당 구간 재생 (loop)
- VideoPlayer에 `play()`, `pause()` 메서드 추가 노출

**Files:**
- `src/components/VideoPlayer.tsx` — `onPlayerReady`에 `play`/`pause` 추가
- `src/components/SimilarVideoResults.tsx` — hover/click 기반 세그먼트 재생, 구간 루프, 매칭 구간 UI 표시

### 5. Text Search Term Fix
기존: user_metadata의 모든 string 값을 검색어로 사용 → 날짜(`2025-10-17T03:44:...`)가 검색어로 들어감
변경: brand_product_events에서 브랜드명, video_creator, video_tones, video_styles만 추출하여 검색어 구성. 검색어를 UI에도 표시.

**Files:**
- `src/hooks/apiHooks.ts` — `textToVideoEmbeddingSearch` 반환값에 searchTerm 포함, 메타데이터 파싱 개선
- `src/app/creator-brand-match/page.tsx` — textSearchTerm state 추가, SimilarVideoResults에 전달

## Matched Segments UI Format
- Video-to-video: `0:12-0:18 ↔ 0:34-0:40  92%`
- Text-to-video: `"Charlotte Tilbury as…" ↔ 0:34-0:40  28%`

## Future Work
- 세그먼트 클릭 시 소스 비디오의 해당 구간도 나란히 재생하는 모달/팝업 (side-by-side comparison)
