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

**Entry:** `src/main.jsx` → `src/App.jsx`

### Routes

| Path | Component | Guard |
|---|---|---|
| `/` | `Home` | `ProtectedRoute` |
| `/explore` | `Explore` | `ProtectedRoute` |
| `/profile` | `Profile` (own) | `ProtectedRoute` |
| `/users/:uid` | `UserProfile` (public) | `ProtectedRoute` |
| `/seed` | `Seed` | `ProtectedRoute` |
| `/verify-email` | `VerifyEmail` | `LoggedInRoute` |
| `/login` | `Login` | `AuthRoute` |
| `/signup` | `SignUp` | `AuthRoute` |

### Auth routing (App.jsx)

| Guard | Condition | Behaviour |
|---|---|---|
| `ProtectedRoute` | logged in **and** `emailVerified` | bounces unverified → `/verify-email`, unauthenticated → `/login` |
| `LoggedInRoute` | logged in (any state) | bounces verified → `/`, unauthenticated → `/login` |
| `AuthRoute` | not logged in or unverified | bounces verified → `/` |

`user` state is `undefined` while Firebase resolves (guards render `null`), `null` when logged out, or the Firebase `User` object when logged in.

### Firebase (`src/firebase.js`)

Exports `auth`, `db`, `storage` — import from here everywhere, never re-initialise.

### Firestore data model

```
users/{uid}
  displayName, username, bio, avatarURL, avatarColor,
  usernameChanged (bool), createdAt, updatedAt

usernames/{username}          ← reservation doc for uniqueness checks
  uid

albums/{albumId}
  title, description, maxPhotos, photoCount, contributorCount,
  thumbnailColors (string[]), createdBy (uid), updatedAt
```

Username uniqueness is enforced via the `usernames` collection — each doc ID is the lowercase username, value is `{ uid }`. Before writing a new username, read `usernames/{username}` and check ownership. Release the old reservation (`deleteDoc`) before writing the new one.

### Storage

Profile photos stored at `avatars/{uid}`.

### Email verification flow

Sign-up sends a verification email (`sendEmailVerification`) and redirects to `/verify-email`. That screen has an "I've verified" button that calls `reload(user)` to refresh Firebase's cached state. Unverified users are bounced to `/verify-email` by `ProtectedRoute` on every navigation.

Email changes on the profile page use `verifyBeforeUpdateEmail` (not `updateEmail`) — the address only changes after the user clicks the link sent to the new address.

### Home feed

`Home.jsx` fetches albums ordered by `updatedAt desc`, then batch-fetches user profiles for all unique `createdBy` UIDs in a single `Promise.all`. Each `AlbumCard` receives the album and its poster's profile. The poster header (avatar + `@username`) links to `/profile` for the current user's own albums, or `/users/:uid` for others.

### Profile pages

- `/profile` — editable own profile (avatar upload to Storage, username with one-time change lock, email via `verifyBeforeUpdateEmail`, bio, own albums grid).
- `/users/:uid` — read-only public profile showing avatar, display name, username, bio, and albums grid.

### Styling conventions

- One `.module.css` file per page/component, co-located in the same directory.
- Auth screens share `src/pages/Auth.module.css` (SignUp, Login, VerifyEmail, Seed all import it).
- Design tokens: brand orange `#ff5c39`, background cream `#faf7f2`, text `#1b1b1f`, muted `#8a8a93`, border `#ececec`.
- Max app width 390px (iPhone canvas), centred via `#root` in `src/index.css`.

### Dev seed

Navigate to `/seed` while logged in to populate Firestore with example albums and users. Runs pre-flight checks (project ID, Firestore read/write) before seeding and reports per-item errors. Requires Firestore rules that allow authenticated writes — the seed page shows the required rules snippet. Albums are seeded with `createdBy` set to the currently logged-in user's UID so they appear on the Profile page.
