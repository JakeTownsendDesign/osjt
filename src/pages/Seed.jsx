import { useState } from 'react'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { Link } from 'react-router-dom'
import styles from './Auth.module.css'
import seedStyles from './Seed.module.css'

// ─── Picsum helper ─────────────────────────────────────────────────────────
const img = (seed) => `https://picsum.photos/seed/${seed}/600/600`

const SEED_USERS = [
  { id: 'user-alice', displayName: 'Alice Johnson', username: 'alice',   avatarColor: '#f6339a', bio: 'Lover of golden hour and espresso.' },
  { id: 'user-bob',   displayName: 'Bob Smith',     username: 'bobsmith', avatarColor: '#4a90d9', bio: 'Street photographer based in London.' },
  { id: 'user-carol', displayName: 'Carol White',   username: 'carol_w',  avatarColor: '#50c878', bio: 'Chasing light around the world.' },
  { id: 'user-dave',  displayName: 'Dave Lee',      username: 'davelee',  avatarColor: '#9b59b6', bio: '' },
  { id: 'user-emma',  displayName: 'Emma Davis',    username: 'emmad',    avatarColor: '#e67e22', bio: 'Coffee, cameras, and coastlines.' },
]

// Albums: 3 owned by logged-in user, 3 owned by seed users
const SEED_ALBUMS = [
  // ── Owned by logged-in user ──────────────────────────────────────────────
  {
    id: 'spain-2026', owner: 'self',
    title: 'Spain Holidays 2026',
    description: 'Two weeks chasing sun, sea and sangria across the coast.',
    maxPhotos: 100, photoCount: 9, contributorCount: 6,
    likeCount: 142, commentCount: 4,
    thumbnailColors: ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc'],
    posts: [
      { seed: 'spain-beach',  caption: 'The coast just hits different in June 🌊', by: 'self',       likes: 24 },
      { seed: 'spain-market', caption: 'Mercado vibes all morning ☀️',             by: 'user-alice', likes: 18 },
      { seed: 'spain-arch',   caption: 'Gaudi never misses.',                       by: 'user-bob',   likes: 31 },
      { seed: 'spain-food',   caption: 'Tapas for breakfast, tapas for dinner 🍢',  by: 'user-carol', likes: 14 },
      { seed: 'spain-port',   caption: 'Harbour at dusk — unreal colours.',         by: 'user-dave',  likes: 22 },
      { seed: 'spain-tiles',  caption: 'The tilework in this city is obsessive.',   by: 'user-emma',  likes: 9  },
      { seed: 'spain-sea',    caption: 'Jumped in. Worth it.',                      by: 'self',       likes: 37 },
      { seed: 'spain-bar',    caption: 'This sangria kept us there until 2am.',     by: 'user-alice', likes: 11 },
      { seed: 'spain-roof',   caption: 'Rooftop views > everything.',               by: 'user-bob',   likes: 28 },
    ],
  },
  {
    id: 'sunday-coffee', owner: 'self',
    title: 'Sunday Morning Coffee',
    description: 'One perfect cup, from wherever you are in the world.',
    maxPhotos: 200, photoCount: 9, contributorCount: 5,
    likeCount: 310, commentCount: 3,
    thumbnailColors: ['#c8d8e8', '#b0c4d9', '#9eb3cb', '#c2d0df'],
    posts: [
      { seed: 'coffee-flat',   caption: 'Flat white in Edinburgh. Cold outside, warm inside ☕', by: 'self',       likes: 44 },
      { seed: 'coffee-pour',   caption: 'Pour over, no milk, no sugar, no regrets.',              by: 'user-alice', likes: 19 },
      { seed: 'coffee-window', caption: 'Rainy window + cortado = Sunday done right.',            by: 'user-carol', likes: 33 },
      { seed: 'coffee-beans',  caption: 'Ethiopian Yirgacheffe. The smell alone 😤',              by: 'user-emma',  likes: 27 },
      { seed: 'coffee-paris',  caption: 'A café in Montmartre. Took two sips and felt French.',  by: 'user-bob',   likes: 51 },
      { seed: 'coffee-cup',    caption: 'Tiny espresso, massive morning energy.',                  by: 'user-dave',  likes: 16 },
      { seed: 'coffee-latte',  caption: 'Latte art attempt number 47. Getting there.',            by: 'self',       likes: 38 },
      { seed: 'coffee-market2',caption: 'Found this gem in a side street in Lisbon.',             by: 'user-carol', likes: 22 },
      { seed: 'coffee-cold',   caption: 'Cold brew at the beach. Summer perfection.',             by: 'user-alice', likes: 29 },
    ],
  },
  {
    id: 'golden-hour', owner: 'self',
    title: 'Golden Hour',
    description: 'That magic light just before sunset.',
    maxPhotos: 50, photoCount: 6, contributorCount: 4,
    likeCount: 57, commentCount: 2,
    thumbnailColors: ['#f5e6c8', '#f0d9a8', '#e8c98a', '#f2ddb0'],
    posts: [
      { seed: 'golden-lake',    caption: 'The lake reflected everything. I nearly cried.',          by: 'self',       likes: 41 },
      { seed: 'golden-fields',  caption: 'Wheat fields at 7pm. Two minutes of perfect light.',     by: 'user-carol', likes: 33 },
      { seed: 'golden-rooftop', caption: 'Rooftop, good company, better light.',                   by: 'user-alice', likes: 28 },
      { seed: 'golden-coast',   caption: 'The sea turns to fire. This is why I shoot.',            by: 'user-dave',  likes: 19 },
      { seed: 'golden-silh',    caption: 'Silhouette game strong 🌅',                              by: 'user-bob',   likes: 45 },
      { seed: 'golden-forest',  caption: 'Trees filtering the last sun of the day.',               by: 'self',       likes: 22 },
    ],
  },

  // ── Owned by seed users ──────────────────────────────────────────────────
  {
    id: 'album-alice-berlin', owner: 'user-alice',
    title: 'Rainy Days in Berlin',
    description: 'Grey skies, cobblestones and the best coffee I have ever had.',
    maxPhotos: 60, photoCount: 7, contributorCount: 3,
    likeCount: 88, commentCount: 3,
    thumbnailColors: ['#c8cdd6', '#b5bbc8', '#a0a8bc', '#cdd1db'],
    posts: [
      { seed: 'berlin-street',  caption: 'Mitte in the rain. Empty streets, full heart.',          by: 'user-alice', likes: 17 },
      { seed: 'berlin-cafe',    caption: 'Found a record shop with a coffee bar inside. Peak.',    by: 'user-bob',   likes: 29 },
      { seed: 'berlin-wall',    caption: 'The Wall. Still heavy, still important.',                by: 'user-alice', likes: 38 },
      { seed: 'berlin-market2', caption: 'Sunday market. Bought two prints and a bratwurst.',     by: 'user-carol', likes: 14 },
      { seed: 'berlin-bahn',    caption: 'U-Bahn platform at rush hour. Great light weirdly.',    by: 'user-alice', likes: 22 },
      { seed: 'berlin-park',    caption: 'Tiergarten after the rain cleared. So quiet.',          by: 'user-bob',   likes: 11 },
      { seed: 'berlin-night',   caption: 'Berlin really starts at midnight.',                      by: 'user-alice', likes: 33 },
    ],
  },
  {
    id: 'album-bob-streetfood', owner: 'user-bob',
    title: 'Street Food Asia',
    description: 'Every meal eaten standing up at a stall. No regrets.',
    maxPhotos: 100, photoCount: 8, contributorCount: 4,
    likeCount: 214, commentCount: 4,
    thumbnailColors: ['#e8c8a0', '#d4b080', '#c09860', '#dcc090'],
    posts: [
      { seed: 'asia-noodles',  caption: 'Bowl of ramen that changed me. Bangkok, 6am.',          by: 'user-bob',   likes: 52 },
      { seed: 'asia-market',   caption: 'Night market energy is unmatched.',                      by: 'user-emma',  likes: 38 },
      { seed: 'asia-dumplings',caption: 'Dumplings in a paper bag. Burned my fingers. Ate them.', by: 'user-dave',  likes: 29 },
      { seed: 'asia-grill',    caption: 'Satay smoke, street lights, strangers. Perfect evening.', by: 'user-bob',  likes: 44 },
      { seed: 'asia-temple',   caption: 'Found this temple down an alley between two food stalls.',by: 'user-alice', likes: 21 },
      { seed: 'asia-fruit',    caption: 'Mango sticky rice from a lady on a bicycle. Life goals.', by: 'user-bob',  likes: 61 },
      { seed: 'asia-broth',    caption: 'Pho at sunrise. Best meal of the trip, easily.',         by: 'user-carol', likes: 33 },
      { seed: 'asia-vendor',   caption: 'She has been at this spot for 30 years. Legend.',        by: 'user-bob',   likes: 47 },
    ],
  },
  {
    id: 'album-carol-swim', owner: 'user-carol',
    title: 'Wild Swimming',
    description: 'Cold water, no wetsuits, zero hesitation.',
    maxPhotos: 40, photoCount: 6, contributorCount: 3,
    likeCount: 73, commentCount: 3,
    thumbnailColors: ['#a8d4e8', '#88bcd8', '#68a8cc', '#98c8e0'],
    posts: [
      { seed: 'swim-lake',    caption: 'Loch Lomond at 7am. 9°C. Screamed. Stayed in.',          by: 'user-carol', likes: 34 },
      { seed: 'swim-river',   caption: 'River Dart after a hike down. The cold hit different.',  by: 'user-alice', likes: 19 },
      { seed: 'swim-pool',    caption: 'Limestone pools in the Dordogne. Turquoise and freezing.', by: 'user-carol', likes: 28 },
      { seed: 'swim-sea',     caption: 'January sea swim. I am fine. This is fine.',              by: 'user-dave',  likes: 41 },
      { seed: 'swim-waterfall',caption: 'Waterfall plunge pool. Did not regret a single second.', by: 'user-carol', likes: 22 },
      { seed: 'swim-morning', caption: 'Dawn swim. The world before anyone else is awake.',       by: 'user-alice', likes: 15 },
    ],
  },
]

// Comments keyed by album ID
const SEED_COMMENTS_BY_ALBUM = {
  'spain-2026': [
    { id: 'cmt-spain-1', parentId: null,          by: 'user-alice', text: 'This album is giving me serious holiday envy 😍 When are you going back?', likes: 8 },
    { id: 'cmt-spain-2', parentId: null,          by: 'user-bob',   text: 'The lighting in these shots is incredible. What time of day were most taken?', likes: 5 },
    { id: 'cmt-spain-3', parentId: null,          by: 'user-carol', text: 'Sangria on a rooftop is my love language. Great album theme 🍊', likes: 12 },
    { id: 'cmt-spain-4', parentId: null,          by: 'self',       text: 'Keep the photos coming everyone — only 91 slots left!', likes: 3 },
    { id: 'cmt-spain-1r1', parentId: 'cmt-spain-1', by: 'user-dave', text: 'Same! Already looking at flights for next summer 🛫', likes: 2 },
    { id: 'cmt-spain-1r2', parentId: 'cmt-spain-1', by: 'user-emma', text: 'The south coast in April is magic. Highly recommend!', likes: 4 },
    { id: 'cmt-spain-2r1', parentId: 'cmt-spain-2', by: 'user-alice', text: 'Golden hour mostly — around 6–7pm. Makes everything look like a painting.', likes: 6 },
  ],
  'sunday-coffee': [
    { id: 'cmt-coffee-1', parentId: null,           by: 'user-emma',  text: 'My favourite album on here. There is something so calming about a great cup in a new place ☕', likes: 19 },
    { id: 'cmt-coffee-2', parentId: null,           by: 'user-carol', text: 'Mine was a cortado in Lisbon. Submitting mine tomorrow!', likes: 7 },
    { id: 'cmt-coffee-3', parentId: null,           by: 'user-alice', text: 'The variety here is wild. Flat whites, pour-overs, Greek frappes... love it all.', likes: 11 },
    { id: 'cmt-coffee-1r1', parentId: 'cmt-coffee-1', by: 'user-bob',  text: 'Completely agree. This is the most peaceful scroll on the internet.', likes: 5 },
    { id: 'cmt-coffee-2r1', parentId: 'cmt-coffee-2', by: 'user-emma', text: 'Oh a Lisbon cortado sounds incredible, can\'t wait to see it!', likes: 3 },
  ],
  'golden-hour': [
    { id: 'cmt-golden-1', parentId: null,            by: 'user-bob',   text: 'Only a few photos in and this is already one of the best albums here. That warm glow is everything.', likes: 9 },
    { id: 'cmt-golden-2', parentId: null,            by: 'user-dave',  text: 'Chasing golden hour is a sport and I am here for it 🌇', likes: 6 },
    { id: 'cmt-golden-1r1', parentId: 'cmt-golden-1', by: 'user-carol', text: 'The one I\'m submitting tomorrow was taken at a lake — the reflection doubled the glow 🤩', likes: 4 },
  ],
  'album-alice-berlin': [
    { id: 'cmt-berlin-1', parentId: null,             by: 'user-emma',  text: 'Berlin in the rain is an entirely different city. Love this so much.', likes: 14 },
    { id: 'cmt-berlin-2', parentId: null,             by: 'user-dave',  text: 'That record shop coffee bar — name?? Asking for myself immediately.', likes: 9 },
    { id: 'cmt-berlin-3', parentId: null,             by: 'self',       text: 'The Wall photo genuinely stopped me scrolling. Powerful.', likes: 21 },
    { id: 'cmt-berlin-2r1', parentId: 'cmt-berlin-2', by: 'user-alice', text: 'It\'s on Torstraße — tiny green door. You have to know it\'s there!', likes: 7 },
  ],
  'album-bob-streetfood': [
    { id: 'cmt-food-1', parentId: null,           by: 'user-carol', text: 'I can almost smell these photos. Incredible album.', likes: 23 },
    { id: 'cmt-food-2', parentId: null,           by: 'user-alice', text: 'The mango sticky rice one 😭 I need to go back to Thailand immediately.', likes: 31 },
    { id: 'cmt-food-3', parentId: null,           by: 'self',       text: 'The vendor portrait is genuinely special. Did you get her name?', likes: 18 },
    { id: 'cmt-food-4', parentId: null,           by: 'user-dave',  text: 'Ramen at 6am is the correct choice. Every time.', likes: 12 },
    { id: 'cmt-food-1r1', parentId: 'cmt-food-1', by: 'user-bob',   text: 'Ha! The smells were unreal. My clothes told the story for days.', likes: 8 },
    { id: 'cmt-food-3r1', parentId: 'cmt-food-3', by: 'user-bob',   text: 'Her name is Mae. Been at that spot 32 years. Absolute legend.', likes: 19 },
  ],
  'album-carol-swim': [
    { id: 'cmt-swim-1', parentId: null,           by: 'user-emma',  text: 'Wild swimming is the most alive I ever feel. This album is everything.', likes: 16 },
    { id: 'cmt-swim-2', parentId: null,           by: 'user-bob',   text: 'January sea swim 🥶 You are a braver person than me.', likes: 22 },
    { id: 'cmt-swim-3', parentId: null,           by: 'self',       text: 'That Loch Lomond shot at 7am makes me want to book a trip immediately.', likes: 11 },
    { id: 'cmt-swim-2r1', parentId: 'cmt-swim-2', by: 'user-carol', text: 'The cold is the whole point!! Come next January, I dare you 😂', likes: 9 },
  ],
}

const RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`

export default function Seed() {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [log, setLog] = useState([])
  const [showRules, setShowRules] = useState(false)
  const [copied, setCopied] = useState(false)

  function addLog(msg, type = 'info') {
    setLog((l) => [...l, { msg, type }])
  }

  async function handleSeed() {
    setStatus('running')
    setLog([])

    const currentUser = auth.currentUser
    if (!currentUser) {
      addLog('Not logged in — please log in first.', 'error')
      setStatus('error')
      return
    }

    // ── 0. Pre-flight checks ───────────────────────────────────────────────
    addLog('Running pre-flight checks…')

    // Check Firebase config is loaded
    const projectId = db.app.options.projectId
    if (!projectId || projectId === 'undefined') {
      addLog('  ✗ VITE_FIREBASE_PROJECT_ID is missing from your .env file.', 'error')
      setStatus('error')
      return
    }
    addLog(`  ✓ Firebase project: ${projectId}`)
    addLog(`  ✓ Logged in as: ${currentUser.email} (${currentUser.uid})`)

    // Test Firestore read
    try {
      await getDoc(doc(db, '_ping', 'test'))
      addLog('  ✓ Firestore read: OK')
    } catch (err) {
      if (err.code === 'permission-denied') {
        addLog('  ✗ Firestore read: permission-denied', 'error')
        addLog('    → Your Firestore database exists but rules are blocking reads.', 'warn')
        addLog('    → Paste the rules below and click Publish in the Firebase Console.', 'warn')
      } else if (err.code === 'unavailable' || err.message?.includes('Could not reach')) {
        addLog('  ✗ Firestore unreachable — is the database created?', 'error')
        addLog('    → Go to Firebase Console → Firestore Database → Create database.', 'warn')
      } else {
        addLog(`  ✗ Firestore error: ${err.code} — ${err.message}`, 'error')
      }
      setStatus('error')
      return
    }

    // Test Firestore write
    try {
      await setDoc(doc(db, '_ping', 'test'), { ok: true })
      addLog('  ✓ Firestore write: OK')
    } catch (err) {
      if (err.code === 'permission-denied') {
        addLog('  ✗ Firestore write: permission-denied', 'error')
        addLog('    → Your rules allow reads but not writes. Update and republish.', 'warn')
      } else {
        addLog(`  ✗ Firestore write error: ${err.code} — ${err.message}`, 'error')
      }
      setStatus('error')
      return
    }

    addLog('Pre-flight passed — seeding data…')
    addLog('')

    let hasError = false

    // ── 1. Seed example users ──────────────────────────────────────────────
    addLog('Seeding example users…')
    for (const u of SEED_USERS) {
      try {
        await setDoc(doc(db, 'users', u.id), {
          displayName: u.displayName,
          username:    u.username,
          bio:         u.bio,
          avatarColor: u.avatarColor,
          avatarURL:   null,
          usernameChanged: false,
          createdAt: serverTimestamp(),
        })
        await setDoc(doc(db, 'usernames', u.username), { uid: u.id })
        addLog(`  ✓ ${u.displayName} (@${u.username})`)
      } catch (err) {
        addLog(`  ✗ ${u.displayName}: ${err.code || err.message}`, 'error')
        hasError = true
      }
    }

    // ── 2. Initialise the logged-in user's own Firestore doc ───────────────
    addLog('Initialising your profile…')
    try {
      const derivedUsername = (currentUser.displayName || 'user')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 24) || 'user'

      await setDoc(doc(db, 'users', currentUser.uid), {
        displayName:     currentUser.displayName || '',
        username:        derivedUsername,
        bio:             '',
        avatarColor:     '#f6339a',
        avatarURL:       currentUser.photoURL || null,
        usernameChanged: false,
        createdAt:       serverTimestamp(),
      }, { merge: true })

      await setDoc(doc(db, 'usernames', derivedUsername), { uid: currentUser.uid }, { merge: true })
      addLog(`  ✓ Your account (@${derivedUsername})`)
    } catch (err) {
      addLog(`  ✗ Your profile: ${err.code || err.message}`, 'error')
      hasError = true
    }

    // ── 3. Seed albums ────────────────────────────────────────────────────────
    addLog('Seeding albums…')
    for (const album of SEED_ALBUMS) {
      const createdBy = album.owner === 'self' ? currentUser.uid : album.owner
      const { id, owner, posts: _posts, ...data } = album
      try {
        const score = (data.photoCount * 3) + (data.likeCount * 2) + data.commentCount
        await setDoc(doc(db, 'albums', id), {
          ...data,
          score,
          createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        addLog(`  ✓ "${album.title}" → ${createdBy === currentUser.uid ? 'you' : createdBy}`)
      } catch (err) {
        addLog(`  ✗ ${album.title}: ${err.code || err.message}`, 'error')
        hasError = true
      }
    }

    // ── 4. Seed posts (with real images) ──────────────────────────────────
    addLog('Seeding posts…')
    let totalPosts = 0
    for (const album of SEED_ALBUMS) {
      for (let i = 0; i < album.posts.length; i++) {
        const p = album.posts[i]
        const postId = `post-${album.id}-${i}`
        const createdBy = p.by === 'self' ? currentUser.uid : p.by
        try {
          await setDoc(doc(db, 'posts', postId), {
            albumId: album.id,
            createdBy,
            imageURL: img(p.seed),
            placeholderColor: album.thumbnailColors[i % album.thumbnailColors.length],
            caption: p.caption,
            likeCount: p.likes,
            createdAt: serverTimestamp(),
          })
          totalPosts++
        } catch (err) {
          addLog(`  ✗ post ${postId}: ${err.code || err.message}`, 'error')
          hasError = true
        }
      }
      addLog(`  ✓ ${album.posts.length} posts for "${album.title}"`)
    }

    // ── 5. Seed comments ─────────────────────────────────────────────────────
    addLog('Seeding comments…')
    let totalComments = 0
    for (const [albumId, comments] of Object.entries(SEED_COMMENTS_BY_ALBUM)) {
      for (const c of comments) {
        const { id, by, likes, ...rest } = c
        const createdBy = by === 'self' ? currentUser.uid : by
        try {
          await setDoc(doc(db, 'comments', id), {
            ...rest,
            albumId,
            createdBy,
            likeCount: likes,
            createdAt: serverTimestamp(),
          })
          totalComments++
        } catch (err) {
          addLog(`  ✗ ${id}: ${err.code || err.message}`, 'error')
          hasError = true
        }
      }
      addLog(`  ✓ ${comments.length} comments for "${albumId}"`)
    }

    if (hasError) {
      addLog('⚠️  Some writes failed — see errors above. Likely a Firestore rules issue.', 'warn')
      setStatus('error')
    } else {
      addLog('All done!')
      setStatus('done')
    }
  }

  function copyRules() {
    navigator.clipboard.writeText(RULES_SNIPPET)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.logo} />
      <h1 className={styles.title}>Seed Data</h1>
      <p className={styles.subtitle}>
        Populates Firestore with example albums, users, and username reservations. Run once in development.
      </p>

      <div className={styles.form}>
        {/* Firestore rules hint */}
        <div className={seedStyles.rulesBox}>
          <p className={seedStyles.rulesTitle}>Before you run</p>
          <p className={seedStyles.rulesText}>
            Make sure your Firestore security rules allow authenticated writes.{' '}
            <button className={seedStyles.rulesToggle} onClick={() => setShowRules((v) => !v)}>
              {showRules ? 'Hide rules ↑' : 'Show required rules ↓'}
            </button>
          </p>
          {showRules && (
            <div className={seedStyles.codeBlock}>
              <pre className={seedStyles.code}>{RULES_SNIPPET}</pre>
              <button className={seedStyles.copyBtn} onClick={copyRules}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <p className={seedStyles.rulesNote}>
                Paste this in the <strong>Firebase Console → Firestore → Rules</strong> tab, then publish.
              </p>
            </div>
          )}
        </div>

        {/* Run button */}
        {status !== 'done' && (
          <button
            className={styles.primaryButton}
            onClick={handleSeed}
            disabled={status === 'running'}
          >
            {status === 'running' ? 'Seeding…' : 'Run seed'}
          </button>
        )}

        {/* Log output */}
        {log.length > 0 && (
          <div className={seedStyles.logBox}>
            {log.map((entry, i) => (
              <p key={i} className={
                entry.type === 'error' ? seedStyles.logError
                : entry.type === 'warn' ? seedStyles.logWarn
                : seedStyles.logLine
              }>
                {entry.msg}
              </p>
            ))}
          </div>
        )}

        {status === 'error' && (
          <p className={seedStyles.logWarn}>
            Fix the errors above and run again — already-written docs will be safely overwritten.
          </p>
        )}

        {status === 'done' && (
          <>
            <p style={{ color: '#50c878', fontWeight: 600 }}>✓ Database seeded successfully.</p>
            <Link
              to="/"
              className={styles.primaryButton}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Go to Home
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
