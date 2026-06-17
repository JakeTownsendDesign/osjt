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

`UserProvider` wraps the entire app. It subscribes to `onAuthStateChanged` once and fetches `users/{uid}` from Firestore once per login. Exposes:

```js
const { user, profile, setProfile } = useUser()
```

- `user` — Firebase `User` object (`undefined` = loading, `null` = logged out)
- `profile` — Firestore `users/{uid}` doc data
- `setProfile` — call after saving profile changes so consuming components update without a reload

**Always read the current user's profile from this context.** Never fetch `users/{currentUid}` again inside a component — use `useUser()` instead.

---

### Routes

| Path | Component | Guard |
|---|---|---|
| `/` | `Home` | `ProtectedRoute` |
| `/explore` | `Explore` | `ProtectedRoute` |
| `/profile` | `Profile` (own) | `ProtectedRoute` |
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

---

### Firestore data model

```
users/{uid}
  displayName, username, bio, avatarURL, avatarColor,
  usernameChanged (bool), createdAt, updatedAt

usernames/{username}          ← reservation doc for uniqueness checks
  uid

albums/{albumId}
  title, description, maxPhotos, photoCount, contributorCount,
  likeCount, commentCount, score, thumbnailColors (string[]),
  status ('open' | 'complete'), createdBy (uid), createdAt, updatedAt

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

reports/{postId}__{uid}
  postId, albumId, reportedBy, createdAt
```

**Username uniqueness:** enforced via the `usernames` collection (doc ID = lowercase username, value = `{ uid }`). Before writing a new username, read `usernames/{username}` and check ownership. Release the old reservation (`deleteDoc`) before writing the new one.

**Album score:** denormalised field = `(photoCount × 3) + (likeCount × 2) + commentCount`. Used by Explore Popular tab to order albums with a single Firestore query.

**Avoiding composite indexes:** queries use single-field filters where possible; client-side sorting handles ordering (e.g. posts sorted by `createdAt.seconds` after fetch). This avoids needing composite Firestore indexes for MVP.

---

### Storage

Profile photos at `avatars/{uid}`. Storage rules must allow `write: if request.auth.uid == uid`.

---

### Layout system

`AppLayout` wraps all authenticated pages (except `CreateAlbum`... actually `CreateAlbum` is also wrapped). It renders:
- `SideNav` — hidden mobile, icon-only 72px tablet (768px+), icon+label 220px desktop (1200px+)
- `BottomNav` — mobile only, hidden at 768px+
- `main` content area with left margin matching the sidebar width

`CreateAlbum` and `AlbumView` are also wrapped with `AppLayout`.

**AlbumView layout:** on desktop (1200px+) uses a CSS grid — album content left, 380px sticky comment panel right. On mobile/tablet the comment section stacks below the grid.

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
- 5 example users + username reservations
- Current user's own profile doc
- 3 albums (owned by current user, with `score` computed)
- 9 posts per album (placeholder colours + captions)
- 18 comments across albums (mix of top-level + replies, with `likeCount`)

Runs pre-flight checks (project ID, Firestore read/write) before seeding. Re-running is safe — all writes use `setDoc` so existing docs are overwritten.
