# Quickstart: Curated Video Feed

## Prerequisites

- Node.js + npm installed
- Supabase project running with migrations applied (including `add_download_tracking`)
- `sync_downloads.py` has been run (videos in DB with `is_downloaded = true`)
- `.env` configured with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `MEDIA_DIRECTORY`

## Development

```bash
npm run dev
```

## Key Files to Modify

### New Files
1. `src/app/feed/page.tsx` — Feed page (grid + chips + batching)
2. `src/components/video-card.tsx` — Reusable video card component
3. `src/components/creator-chips.tsx` — Creator filter chip row

### Modified Files
4. `src/app/api/videos/feed/route.ts` — Add pagination, creator filter, interleaving, creator metadata
5. `src/app/page.tsx` — Add "Watch" nav link, make creator cards navigate to `/feed?creator=ID`
6. `src/app/v/[id]/page.tsx` — Add end-of-video suggestions + "Back to feed" action

## Implementation Order

1. **API first**: Refactor feed endpoint with pagination, filtering, and interleaving
2. **Components**: Build video-card and creator-chips components
3. **Feed page**: Wire up the feed page consuming the API
4. **Navigation**: Connect home → feed and feed → player
5. **Player updates**: Add end-of-video suggestions
6. **Polish**: Scroll preservation, empty states, "That's everything!" message

## Verification

1. Navigate to `/feed` — should show interleaved video grid
2. Click a creator chip — should filter to that creator
3. Click "Show more" — should append next batch
4. Click a video card — should navigate to player
5. Press back from player — should return to feed at same scroll position
6. From home, click a creator — should open feed pre-filtered
