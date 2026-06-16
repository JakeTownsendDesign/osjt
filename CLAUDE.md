# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project location

`/Users/jaketownsend/Documents/OSJT/osjt/`

## Commands

```bash
npm run dev      # start dev server (Vite, default port 5173)
npm run build    # production build
npm run preview  # preview production build locally
```

There are no tests or linting configured.

## Environment

Copy `.env.example` to `.env` and fill in the Firebase project values before running. All env vars are prefixed `VITE_` so Vite exposes them to the browser.

## Architecture

**Stack:** React 19 + Vite, Firebase (Auth, Firestore, Storage), React Router v7. No UI library — all styling is CSS Modules per component. No Tailwind.

**Entry:** `src/main.jsx` → `src/App.jsx`

### Auth routing (App.jsx)

Three route guard components control access:

| Guard | Condition | Used for |
|---|---|---|
| `ProtectedRoute` | logged in **and** `emailVerified` | all app screens |
| `LoggedInRoute` | logged in (any verification state) | `/verify-email` only |
| `AuthRoute` | not logged in, or logged in but unverified | `/login`, `/signup` |

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

Sign-up sends a verification email (`sendEmailVerification`) and redirects to `/verify-email`. That screen has a "I've verified" button that calls `reload(user)` to refresh Firebase's cached state. Unverified users are bounced to `/verify-email` by `ProtectedRoute` on every navigation.

Email changes on the profile page use `verifyBeforeUpdateEmail` (not `updateEmail`) — the address only changes after the user clicks the link sent to the new address.

### Styling conventions

- One `.module.css` file per page/component, co-located in the same directory.
- Auth screens share `src/pages/Auth.module.css` (SignUp, Login, VerifyEmail, Seed all import it).
- Design tokens: brand orange `#ff5c39`, background cream `#faf7f2`, text `#1b1b1f`, muted `#8a8a93`, border `#ececec`.
- Max app width 390px (iPhone canvas), centred via `#root` in `src/index.css`.

### Dev seed

Navigate to `/seed` while logged in to populate Firestore with example albums and users. Requires Firestore rules that allow authenticated writes — the seed page shows the required rules snippet. Albums are seeded with `createdBy` set to the currently logged-in user's UID so they appear on the Profile page.
