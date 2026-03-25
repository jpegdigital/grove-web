# Tasks: Multi-User Authentication & Per-User Subscriptions

**Input**: Design documents from `/specs/009-multi-user-auth/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies and create Supabase client infrastructure

- [x] T001 Install `@supabase/ssr` package via `npm install @supabase/ssr`
- [x] T002 [P] Create browser Supabase client factory in `src/lib/supabase/client.ts` using `createBrowserClient` from `@supabase/ssr` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [x] T003 [P] Create server Supabase client factory in `src/lib/supabase/server.ts` using `createServerClient` from `@supabase/ssr` with cookie adapter via `next/headers`
- [x] T004 [P] Create admin Supabase client in `src/lib/supabase/admin.ts` using `createClient` from `@supabase/supabase-js` with `SUPABASE_SECRET_KEY` (service role, server-only)
- [x] T005 Delete `src/lib/supabase.ts` and update all imports across the codebase to use `createClient` from `@/lib/supabase/client` — files to update: `src/hooks/use-feed.ts`, `src/lib/queries/creators.ts`, `src/app/api/videos/[id]/route.ts`, `src/app/admin/page.tsx`, `src/app/v/[id]/page.tsx`, `src/app/page.tsx`, and any other files importing from `@/lib/supabase`

**Checkpoint**: App compiles and works as before with the new client factory (no auth yet, same publishable key)

---

## Phase 2: Foundational (Database + Auth Infrastructure)

**Purpose**: Database schema, RLS policies, proxy, and auth callback — MUST complete before any user story

- [x] T006 Create Supabase migration file `supabase/migrations/20260325000001_multi_user_auth.sql` with: (a) `profiles` table (user_id UUID PK → auth.users, role TEXT CHECK admin/member, display_name TEXT, created_at), (b) `user_subscriptions` table (id UUID PK, user_id UUID → auth.users, creator_id UUID → creators, unique(user_id, creator_id), indexes on user_id and creator_id), (c) `custom_access_token_hook` function that reads role from profiles and injects into JWT app_metadata, (d) grant execute on hook to `supabase_auth_admin`, grant profiles table to `supabase_auth_admin`
- [x] T007 In the same migration file, drop ALL existing permissive RLS policies (channels, curated_channels, videos, creators) and create new policies per `contracts/rls-policies.md`: authenticated SELECT on global tables (creators, channels, curated_channels), admin-only write on all tables, subscription-scoped SELECT on videos, own-row SELECT on profiles and user_subscriptions, admin CRUD on profiles and user_subscriptions
- [x] T008 Apply the migration via the Supabase MCP tool `apply_migration`
- [x] T009 Create proxy session refresh helper in `src/lib/supabase/proxy.ts` — creates a `createServerClient` with request cookie adapters, calls `getUser()` to trigger token refresh, returns the response with updated cookies
- [x] T010 Create Next.js 16 proxy file at `src/proxy.ts` — imports `updateSession` from `@/lib/supabase/proxy`, applies route protection: exclude `_next/static`, `_next/image`, `favicon.ico`; allow `/login` and `/auth/callback` without auth; redirect unauthenticated users to `/login`; redirect authenticated users on `/login` to `/feed`; check admin role for `/admin/*` paths and redirect non-admins to `/feed`
- [x] T011 Create auth callback route handler at `src/app/auth/callback/route.ts` — reads `code` query param, exchanges for session via `supabase.auth.exchangeCodeForSession(code)`, redirects to `/feed`

**Checkpoint**: Proxy protects all routes. Unauthenticated users redirected to `/login` (which 404s — login page created in next phase). Migration applied with new tables and RLS.

---

## Phase 3: User Story 1 — User Authentication and Personalized Feed (Priority: P1) — MVP

**Goal**: Users can log in with email/password and see a feed filtered to only their subscribed creators' videos.

**Independent Test**: Create a user in Supabase, add subscriptions for 2 of 5 creators, log in, verify feed shows only those 2 creators' videos.

### Implementation for User Story 1

- [x] T012 [US1] Create login page at `src/app/login/page.tsx` — email/password form using shadcn/ui components (Input, Button, Card), calls `supabase.auth.signInWithPassword()`, redirects to `/feed` on success, shows error message on failure. Style with Fredoka heading + Nunito body + bright palette consistent with app theme.
- [x] T013 [US1] Add auth state and logout to `src/app/layout.tsx` — listen for auth state changes via `supabase.auth.onAuthStateChange()`, display current user's display name and a logout button in the header/nav area, call `supabase.auth.signOut()` on logout click which redirects to `/login`
- [x] T014 [US1] Update `src/hooks/use-feed.ts` to use `createClient()` from `@/lib/supabase/client` instead of the singleton import — the browser client automatically includes auth tokens, so RLS filters videos by user's subscriptions. No query logic changes needed (RLS handles filtering).
- [x] T015 [US1] Update `src/app/page.tsx` (home page) — filter the creator grid to show only creators the user is subscribed to. Query `user_subscriptions` for the current user's creator IDs, then filter the creators list to only include subscribed creators.
- [x] T016 [US1] Update `src/app/v/[id]/page.tsx` — ensure the video player page uses the authenticated client. If RLS returns no data (user not subscribed to that creator), show a "video not available" message instead of an error.
- [x] T017 [US1] Update `src/app/c/[slug]/page.tsx` — if user navigates to a creator they're not subscribed to, show a friendly "not subscribed" empty state instead of an empty feed.

**Checkpoint**: Users can log in, see their personalized feed, view videos from subscribed creators, and log out. Unsubscribed content is hidden by RLS.

---

## Phase 4: User Story 2 — Parent Manages Subscriptions for All Accounts (Priority: P2)

**Goal**: Parent (admin) can view all user accounts and toggle creator subscriptions per account at `/admin/subscriptions`.

**Independent Test**: Log in as parent, navigate to `/admin/subscriptions`, toggle a creator for a child account, verify the child's feed reflects the change.

### Implementation for User Story 2

- [x] T018 [US2] Create subscription management page at `src/app/admin/subscriptions/page.tsx` — fetch all profiles (admin can read all via RLS), fetch all creators, fetch all user_subscriptions. Display a matrix/grid UI: rows = user accounts, columns = creators. Each cell is a toggle (checkbox or switch) indicating whether that user is subscribed to that creator. Use shadcn/ui components (Card, Switch/Checkbox, Table or grid layout).
- [x] T019 [US2] Implement subscription toggle logic in `src/app/admin/subscriptions/page.tsx` — when admin toggles a subscription on: INSERT into `user_subscriptions` (user_id, creator_id). When toggled off: DELETE from `user_subscriptions` where user_id and creator_id match. Use optimistic updates with React Query `useMutation` for immediate UI feedback.
- [x] T020 [US2] Add navigation link to `/admin/subscriptions` from the existing admin page — add a link/tab in `src/app/admin/page.tsx` or the admin layout that navigates to the subscription management page.

**Checkpoint**: Parent can manage all users' subscriptions. Changes persist and are reflected in each user's feed.

---

## Phase 5: User Story 3 — Child Sees Personalized Feed, Cannot Access Admin (Priority: P3)

**Goal**: Child users see only their subscribed content and cannot access admin pages.

**Independent Test**: Log in as child, verify feed matches subscriptions, navigate to `/admin` and verify redirect to `/feed`.

### Implementation for User Story 3

- [x] T021 [US3] Verify proxy admin role check works for child accounts — the proxy (T010) already redirects non-admin users from `/admin/*` to `/feed`. Test this by logging in as a member account and attempting to access `/admin` and `/admin/subscriptions`. If the proxy role check isn't working (e.g., JWT doesn't have the role claim yet), debug and fix the `custom_access_token_hook` and proxy logic.
- [x] T022 [US3] Hide admin navigation elements for non-admin users in `src/app/layout.tsx` — read the user's role from the session JWT (`app_metadata.role`), conditionally render admin links only for admin users. Child users should not see any admin navigation options.

**Checkpoint**: Child users see only their content. Admin pages are inaccessible both via navigation and direct URL access.

---

## Phase 6: User Story 4 — Existing Admin Restricted to Parent (Priority: P4)

**Goal**: Existing admin functionality (`/admin` channel/creator management) continues to work but is restricted to the parent (admin role) only.

**Independent Test**: Log in as parent, verify `/admin` works as before. Log in as child, verify `/admin` redirects to `/feed`.

### Implementation for User Story 4

- [x] T023 [US4] Update `src/app/admin/page.tsx` to use `createClient()` from `@/lib/supabase/client` — the admin page already works, but must use the authenticated client so RLS allows admin write operations (create/update/delete creators, channels, curated_channels). Verify all CRUD operations still function correctly with the new RLS policies.
- [x] T024 [US4] Update `src/app/api/videos/[id]/route.ts` to use the server client from `@/lib/supabase/server` — API route handlers should use the server client (which reads cookies from the request) so that RLS applies correctly on the server side.

**Checkpoint**: Admin panel fully functional for parent account. All existing CRUD operations work with new role-based RLS.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, UX improvements, and verification

- [x] T025 Handle zero-subscriptions state in `src/hooks/use-feed.ts` and `src/app/page.tsx` — when a user has no subscriptions, display a friendly empty state message ("No creators subscribed yet — ask a parent to set up your feed!") instead of showing a blank or error state.
- [x] T026 Add loading states to `src/app/login/page.tsx` — disable submit button and show spinner during sign-in to prevent double-submission.
- [x] T027 [P] Verify `src/app/styleguide/page.tsx` still works behind auth (it should, since proxy requires auth for all non-login routes).
- [x] T028 Run `npm run build` and `npm run lint` to verify no compilation or lint errors across all changes.
- [x] T029 Run quickstart.md validation — walk through all 5 verification steps documented in `specs/009-multi-user-auth/quickstart.md` to confirm end-to-end functionality.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T005 must complete so imports are updated) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion; no dependency on US1
- **User Story 3 (Phase 5)**: Depends on Phase 2 completion; validates proxy from T010
- **User Story 4 (Phase 6)**: Depends on Phase 2 completion; no dependency on other stories
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2. This is the MVP.
- **US2 (P2)**: Independent after Phase 2. Can be built in parallel with US1.
- **US3 (P3)**: Independent after Phase 2. Mostly verification of proxy + UI hiding.
- **US4 (P4)**: Independent after Phase 2. Updates existing admin page.

### Within Each Phase

- Tasks within a phase are sequential unless marked [P]
- T002, T003, T004 can run in parallel (different files)
- T006 and T007 are in the same migration file (sequential)

### Parallel Opportunities

```
Phase 1: T002 ─┐
         T003 ─┼─ parallel (different files)
         T004 ─┘
         T005 ─── sequential (depends on T002-T004)

Phase 2: T006 → T007 → T008 (migration: sequential)
         T009 ─┐
         T010 ─┼─ parallel with each other, after T008
         T011 ─┘

Phase 3-6: Can proceed in priority order (P1 → P2 → P3 → P4)
           or in parallel if team capacity allows
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T011)
3. Complete Phase 3: User Story 1 (T012-T017)
4. **STOP and VALIDATE**: Log in as a test user, verify personalized feed works
5. Deploy if ready — users can now log in and see their content

### Incremental Delivery

1. Setup + Foundational → Auth infrastructure ready
2. Add US1 → Users can log in and see personalized feeds (MVP!)
3. Add US2 → Parent can manage subscriptions via admin UI
4. Add US3 → Child accounts validated, admin hidden from children
5. Add US4 → Existing admin restricted to parent
6. Polish → Edge cases, empty states, build verification

### Post-Deploy Manual Steps

After deploying the migration:
1. Enable Custom Access Token Hook in Supabase Dashboard (Authentication → Hooks)
2. Create 3 user accounts in Supabase Dashboard (Authentication → Users)
3. Insert corresponding `profiles` rows (via SQL or admin UI)
4. Set initial subscriptions via `/admin/subscriptions`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- RLS does the heavy lifting for feed filtering — no application-level query changes needed for video scoping
- Python sync scripts are unaffected (they use `DATABASE_URL` which bypasses RLS)
- The Custom Access Token Hook must be enabled manually in the Supabase Dashboard after migration
- Commit after each task or logical group
