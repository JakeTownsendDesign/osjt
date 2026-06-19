# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project location

`/Users/jaketownsend/Documents/OSJT/osjt/`

## Commands

```bash
npm run dev      # start dev server (Vite, default port 5173)
npm run build    # production build
npm run preview  # preview production build locally
npm run deploy   # build + deploy to Firebase Hosting (requires firebase login first)
```

There are no tests or linting configured.

## Environment

Copy `.env.example` to `.env` and fill in the Firebase project values before running. All env vars are prefixed `VITE_` so Vite exposes them to the browser. The `.env` file must be present locally when running `npm run deploy` — the CI environment does not have it.

## Deployment

Firebase project ID: `osjt26`. Hosted at `https://osjt26.web.app`.

`firebase.json` points `public` at `dist/` with a `**` → `index.html` rewrite for React Router. `firebase-tools` is installed as a dev dependency so `npx firebase` works without a global install.

Always run `npm run deploy` locally (not from CI/sandbox) so the `.env` values are baked into the Vite build.

## Git

Remote: `https://github.com/JakeTownsendDesign/osjt` (private). Branch: `main`.

## Architecture

**Stack:** React 19 + Vite, Firebase (Auth, Firestore, Storage), React Router v7. No UI library — all styling is CSS Modules per component. No Tailwind.

**Font:** Elms Sans (Google Fonts, weights 400/500/600/700).  
**Primary colour:** `#f6339a`. Soft tint: `#fde8f3`.

**Entry:** `src/main.jsx` → `src/App.jsx`

---

### User context (`src/context/UserContext.jsx`)

`UserProvider` wraps the entire app. It subscribes to `onAuthStateChanged` once and then opens a **real-time `onSnapshot` listener** on `users/{uid}`. So the current user's profile (including the live daily-contribution counter) stays fresh everywhere with **no per-component reads**. Exposes:

```js
const { user, profile, setProfile } = useUser()
```

- `user` — Firebase `User` object (`undefined` = loading, `null` = logged out)
- `profile` — live Firestore `users/{uid}` doc data (snapshot-driven)
- `setProfile` — optimistic local update; the snapshot is the source of truth and will self-correct

Also exports helpers: `DAILY_CONTRIB_LIMIT` (3), `todayKey()` (YYYY-MM-DD), and `remainingContributions(profile)`.

**Always read the current user's profile from this context.** Never fetch `users/{currentUid}` again inside a component — use `useUser()` instead.

---

### Routes

| Path | Component | Guard |
|---|---|---|
| `/` | `Home` | `ProtectedRoute` |
| `/explore` | `Explore` | `ProtectedRoute` |
| `/profile` | `UserProfile` (own, read-only + Edit button) | `ProtectedRoute` |
| `/profile/edit` | `Profile` (edit form) | `ProtectedRoute` |
| `/users/:uid` | `UserProfile` (public) | `ProtectedRoute` |
| `/albums/:albumId` | `AlbumView` | `ProtectedRoute` |
| `/create-album` | `CreateAlbum` | `ProtectedRoute` |
| `/seed` | `Seed` | `ProtectedRoute` |
| `/verify-email` | `VerifyEmail` | `LoggedInRoute` |
| `/login` | `Login` | `AuthRoute` |
| `/signup` | `SignUp` | `AuthRoute` |

### Auth routing (App.jsx)

Guards consume `useUser()` — no props needed.

| Guard | Condition | Behaviour |
|---|---|---|
| `ProtectedRoute` | logged in **and** `emailVerified` | bounces unverified → `/verify-email`, unauthenticated → `/login` |
| `LoggedInRoute` | logged in (any state) | bounces verified → `/`, unauthenticated → `/login` |
| `AuthRoute` | not logged in or unverified | bounces verified → `/` |

---

### Firebase (`src/firebase.js`)

Exports `auth`, `db`, `storage` — import from here everywhere, never re-initialise.

Security rules live in the repo: `firestore.rules` and `storage.rules`, wired into `firebase.json`. Deploy with `npx firebase deploy --only firestore:rules,storage`. **Edit the repo files, not the console** — a console edit would be overwritten on the next deploy.

---

### Firestore data model

```
users/{uid}
  displayName, username, bio, avatarURL, avatarColor,
  usernameChanged (bool), createdAt, updatedAt,
  dailyContrib { date: 'YYYY-MM-DD', count }   ← daily contribution counter

usernames/{username}          ← reservation doc for uniqueness checks
  uid

albums/{albumId}
  title, description, maxPhotos, photoCount, contributorCount,
  likeCount, commentCount, score, thumbnailColors (string[]),
  thumbnailURLs (string[], first 4 post images for card previews),
  createdBy (uid), createdAt, updatedAt

posts/{postId}
  albumId, createdBy (uid), imageURL, placeholderColor,
  caption, likeCount, createdAt

likes/{postId}__{uid}
  postId, userId, albumId, createdAt

comments/{commentId}
  albumId, parentId (null = top-level, commentId = reply — max 1 level),
  text, createdBy (uid), likeCount, createdAt

commentLikes/{commentId}__{uid}
  commentId, userId, albumId, createdAt

follows/{followerId}__{followeeId}
  followerId, followeeId, createdAt

reports/{postId|album-albumId}__{uid}
  postId?, albumId, reportedBy, type?, createdAt
```

> **Note:** albums no longer use a `status` field. "Full" is derived live from `photoCount >= maxPhotos`, so removing a photo re-opens contributions automatically.

**Username uniqueness:** enforced via the `usernames` collection (doc ID = lowercase username, value = `{ uid }`). Before writing a new username, read `usernames/{username}` and check ownership. Release the old reservation (`deleteDoc`) before writing the new one.

**Album score:** denormalised field = `(photoCount × 3) + (likeCount × 2) + commentCount`. Used by Explore Popular tab to order albums with a single Firestore query.

**Avoiding composite indexes:** queries use single-field filters where possible; client-side sorting handles ordering (e.g. posts sorted by `createdAt.seconds` after fetch). This avoids needing composite Firestore indexes for MVP.

---

### Storage

- Profile photos: `avatars/{uid}` — owner-only write.
- Post photos: `posts/{albumId}/{postId}` — any signed-in user may write.

Upload helpers live in `src/lib/upload.js`: `uploadImage(file, path)`, `validateImage(file)` (image type, ≤ 5 MB), and `nextDailyContrib(profile)` (computes the next counter value, handling the midnight rollover, with no DB read).

---

### Photo contributions & limits

- **Daily limit:** a user may contribute **3 photos per day** to albums they don't own. The count lives on `users/{uid}.dailyContrib` and is read live from `UserContext`. Owners adding starter photos to their own album are exempt.
- **Album capacity:** adding is blocked when `photoCount >= maxPhotos` ("Album full"); reversible — removing a photo re-opens it.
- **Atomic write:** contributing writes the post + album counter update + user `dailyContrib` in **one `writeBatch`** so the security rules' `getAfter()` can verify the increment.
- **Album creation:** owner adds 1–3 starter photos (min 1 required), uploaded in `CreateAlbum`.
- **Removal:** a user can remove their own photos from any album; the album owner can remove any photo. Removal does **not** restore the daily slot.

### Security rules (`firestore.rules`)

- **`posts` create** is the key gate: requires `withinCapacity(albumId)` (album's `photoCount` after the write ≤ `maxPhotos`) AND either the album is owned by the user OR `withinDailyLimit()`. The latter uses `get()` + `getAfter()` to confirm the same write increments `dailyContrib` for **today** (date derived from `request.time`, so a tampered clock can't reset it) and stays ≤ 3.
- **Field-level locks** via `changedKeys().hasOnly([...])`: non-owners may only change counter/engagement fields on `albums` (counts, thumbnails, updatedAt), `posts` (likeCount), and `comments` (likeCount).
- **Deletes:** posts/comments deletable by their author or the album owner; albums by their owner.

---

### Layout system

`AppLayout` wraps every authenticated page. It renders:
- `SideNav` — hidden mobile, icon-only 72px tablet (768px+), icon+label 220px desktop (1200px+)
- `BottomNav` — mobile only, hidden at 768px+. The Profile tab shows the current user's avatar (from `useUser()`), not a generic icon.
- `main` content area (full width minus the sidebar; no max-width cap)

**AlbumView layout:** the comment section always stacks below the photo grid (single column at every breakpoint).

**AlbumView photo grid:** clicking a photo expands it to a 3×3 block via `grid-auto-flow: dense` + a unique `view-transition-name` per tile (uses the View Transitions API for smooth reflow; falls back to an instant swap in Firefox). Like/options + contributor details only appear on the expanded photo, overlaid on the image bottom.

---

### Key component patterns

**CommentSection (`src/components/CommentSection.jsx`):**
- Reads `currentUserProfile` from `useUser()` context — no Firestore fetch for the current user
- Only fetches profiles of *other* commenters
- Supports 1-level threading (top-level + replies; replies cannot themselves be replied to)
- Delete rules: album owner can delete any comment; comment owner can only delete their own
- Optimistic like/unlike with revert on error

**AlbumView (`src/pages/AlbumView.jsx`):**
- Posts fetched with single `where('albumId')` filter, sorted client-side (no composite index)
- Likes fetched by `userId` only, filtered client-side by `albumId`
- All Firestore operations wrapped in try/catch with visible error state

**Home (`src/pages/Home.jsx`):**
- A single-column **network feed** — a merged, time-sorted timeline of updates from the people the current user follows. Three event types: `album` (a followed user created an album), `post` (a photo added to a followed user's album), `comment` (a comment on a followed user's album).
- Fetch order: (1) `follows where followerId == me` → followee set; (2) `albums where createdBy in [followees]` → album events + the album-id set; (3) `posts`/`comments where albumId in [albumIds]`. Events are merged, sorted by `createdAt.seconds` desc, sliced to 40, then actor profiles are batch-fetched.
- Firestore `in` accepts ≤ 10 values — the `chunk()` helper splits both the followee and album-id lists; empty lists short-circuit to an empty feed (the "follow people in Explore" empty state).
- The current user's own posts/comments are filtered out (the feed is about others). Album events never carry a follow button (the creator is followed by definition); `post`/`comment` events show a **Follow** button on the poster/commenter only when not self and not already followed, using the same optimistic-toggle pattern as Explore's People tab.
- Album `•••` menu: owner sees Edit/Delete; others see "Report album"

**UserProfile (`src/pages/UserProfile.jsx`):** serves both `/profile` (own — no `:uid`, shows "Edit profile") and `/users/:uid` (others — shows Follow/Following toggle). Displays follower/following counts derived from the `follows` collection.

**Home (`src/pages/Home.jsx`):** a follow-based activity feed ("Your feed"). Loads who the user follows, then their albums/posts/comments, merges them into one reverse-chronological timeline, and batch-fetches actor profiles. Firestore `in` queries are chunked to 10 values (`chunk()` helper). Empty state prompts the user to follow people via Explore.

---

### Email verification flow

Sign-up sends `sendEmailVerification` and redirects to `/verify-email`. The screen has an "I've verified" button that calls `reload(user)` to refresh Firebase's cached state.

Email changes use `verifyBeforeUpdateEmail` (not `updateEmail`) — the address only updates after the user clicks the link sent to the new address.

---

### Styling conventions

- One `.module.css` file per page/component, co-located in the same directory.
- Auth screens share `src/pages/Auth.module.css`.
- Design tokens: primary `#f6339a`, tint `#fde8f3`, text `#1b1b1f`, muted `#8a8a93`, border `#ececec`, background `#faf7f2`.
- Responsive breakpoints: 768px (tablet), 1200px (desktop).

---

### Dev seed

Navigate to `/seed` while logged in to populate Firestore with:
- 5 example users + username reservations, and the current user's own profile doc
- 6 albums — 3 owned by the current user, 3 by seed users — each with `score`, `thumbnailURLs`, and real images (via Picsum, `picsum.photos/seed/{word}/600/600`)
- 6–9 posts per album with real image URLs and captions
- ~30 comments across albums (mix of top-level + replies, with `likeCount`)

Runs pre-flight checks (project ID, Firestore read/write) before seeding. Re-running is safe — all writes use `setDoc` so existing docs are overwritten.
