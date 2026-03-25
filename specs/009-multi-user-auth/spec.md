# Feature Specification: Multi-User Authentication & Per-User Subscriptions

**Feature Branch**: `009-multi-user-auth`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "Create a multi-user experience where channels are added globally and each user (parent + two kids) sees only the creators they are subscribed to. Supabase Auth for login, per-user subscriptions at the creator level, role-based admin access for the parent account."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - User Authentication and Personalized Feed (Priority: P1)

A user opens PradoTube, is redirected to a login page, enters their email and password, and lands on a feed showing only videos from creators they are subscribed to. All pages except login are inaccessible without authentication.

**Why this priority**: Authentication is the foundation — nothing else works without it. The feed must also be scoped to the logged-in user for the feature to have any value.

**Independent Test**: Can be tested by creating a user account, logging in, subscribing to a creator, and verifying the feed shows only videos from that creator's channels.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor, **When** they navigate to any page (feed, creator, video), **Then** they are redirected to the login page.
2. **Given** a logged-in user with subscriptions to 2 of 5 creators, **When** they view the feed, **Then** only videos from those 2 creators' channels appear.
3. **Given** a logged-in user, **When** they navigate to a creator page (`/c/[slug]`), **Then** they see videos only if they are subscribed to that creator; otherwise they see an empty or "not subscribed" state.
4. **Given** a logged-in user, **When** they click "log out", **Then** their session ends and they are redirected to the login page.
5. **Given** an authenticated user, **When** they navigate to the login page, **Then** they are redirected to the feed.

---

### User Story 2 - Parent Manages Subscriptions for All Accounts (Priority: P2)

The parent navigates to `/admin/subscriptions` and sees all user accounts (themselves and their two kids). For each account, the parent can toggle which creators that user is subscribed to. Changes take effect immediately — the next time that user views their feed, it reflects the updated subscriptions.

**Why this priority**: Without subscription management, users have no content. This is the control plane that makes per-user feeds possible.

**Independent Test**: Can be tested by logging in as the parent, navigating to `/admin/subscriptions`, toggling a creator subscription for a child account, then logging in as that child and verifying the feed changed.

**Acceptance Scenarios**:

1. **Given** the parent is logged in and navigates to `/admin/subscriptions`, **When** the page loads, **Then** they see a list of all user accounts with each account's current creator subscriptions displayed.
2. **Given** the parent is on the subscriptions admin page, **When** they add a creator subscription for a child account, **Then** the subscription is saved and that child's feed includes videos from that creator.
3. **Given** the parent is on the subscriptions admin page, **When** they remove a creator subscription for a child account, **Then** the subscription is removed and that child's feed no longer includes videos from that creator.

---

### User Story 3 - Child Sees Personalized Feed, Cannot Access Admin (Priority: P3)

A child opens PradoTube, logs in with their own credentials, and sees a feed containing only videos from creators the parent has subscribed them to. They cannot access any admin pages.

**Why this priority**: This validates the end-to-end multi-user experience from the child's perspective and confirms role-based access control works.

**Independent Test**: Can be tested by logging in as a child account and verifying the feed matches their subscriptions and that `/admin/*` pages are inaccessible.

**Acceptance Scenarios**:

1. **Given** a child user is logged in, **When** they view the feed, **Then** they see only videos from creators the parent subscribed them to.
2. **Given** a child user is logged in, **When** they attempt to navigate to `/admin` or `/admin/subscriptions`, **Then** they are denied access (redirected to feed or shown an unauthorized message).
3. **Given** a child user is logged in, **When** they click on a creator chip, **Then** they see that creator's videos only if they are subscribed to that creator.

---

### User Story 4 - Existing Admin Restricted to Parent (Priority: P4)

The existing admin pages (`/admin` for channel/creator management) continue to function as before but are now restricted to the parent account only.

**Why this priority**: Preserves existing admin functionality while adding access control. Lower priority because admin already works — this just gates access.

**Independent Test**: Can be tested by logging in as the parent and verifying admin pages work, then logging in as a child and verifying admin pages are blocked.

**Acceptance Scenarios**:

1. **Given** the parent is logged in, **When** they navigate to `/admin`, **Then** they see the existing channel/creator management interface unchanged.
2. **Given** a child user is logged in, **When** they navigate to `/admin`, **Then** they are redirected to the feed.

---

### Edge Cases

- What happens when a user has zero subscriptions? They see an empty feed with a friendly message indicating no content is available (not an error state).
- What happens when the parent removes a creator that a child is subscribed to? The subscription becomes orphaned — the system handles this gracefully (no videos shown, subscription can be cleaned up by the parent).
- What happens if a user's session expires while browsing? They are redirected to login on the next navigation or data fetch.
- What happens if someone manipulates requests to bypass access control? Row-level security at the data layer ensures no unauthorized data is returned regardless of client-side behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require authentication to access any page except the login page.
- **FR-002**: System MUST provide a login page where users can sign in with email and password.
- **FR-003**: System MUST support multiple user accounts (at least 3: one parent, two children).
- **FR-004**: System MUST distinguish between "admin" (parent) and "member" (child) roles.
- **FR-005**: System MUST maintain a per-user subscription list at the creator level (not the channel level).
- **FR-006**: The feed page MUST show only videos from creators the logged-in user is subscribed to.
- **FR-007**: Creator pages (`/c/[slug]`) MUST respect the user's subscriptions — only showing content for subscribed creators.
- **FR-008**: The `/admin/subscriptions` page MUST allow the parent to view and manage subscriptions for all user accounts.
- **FR-009**: All `/admin/*` pages MUST be restricted to users with the admin role.
- **FR-010**: Channels and creators MUST remain global resources — they are not per-user. Only subscriptions are per-user.
- **FR-011**: System MUST enforce access control at the data layer so that users can only read videos for creators they are subscribed to.
- **FR-012**: System MUST provide a way to log out.
- **FR-013**: Video pages (`/v/[id]`) MUST only be accessible if the video belongs to a creator the user is subscribed to.

### Key Entities

- **User Account**: A person who can log in. Has a role (admin or member) and a set of creator subscriptions.
- **User Subscription**: A link between a user account and a creator. Determines what content appears in that user's feed.
- **Creator** (existing): A content creator grouping. Subscriptions are at this level.
- **Channel** (existing): A YouTube channel belonging to a creator. Remains global — not per-user.
- **Video** (existing): A video belonging to a channel. Visibility in feeds is determined by the user's creator subscriptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Each user sees only videos from their subscribed creators — zero unsubscribed-creator videos appear in any user's feed.
- **SC-002**: The parent can update any user's subscriptions and the change is reflected in that user's feed within 5 seconds.
- **SC-003**: Non-admin users cannot access any admin functionality — all attempts result in redirection.
- **SC-004**: Users can log in and reach their personalized feed in under 10 seconds.
- **SC-005**: The system supports at least 3 concurrent user accounts with fully independent subscription sets.

## Assumptions

- Users will be created manually by the parent (no self-registration — this is a family app).
- Email/password authentication is sufficient (no OAuth or social login needed).
- The parent is the only admin. There is no need for multiple admin users.
- Existing Python sync scripts (producer/consumer) do not need changes — they operate on global channel/video data, not per-user data.
- The three user accounts (parent + two kids) will be created during initial setup, not through a registration flow in the app.
