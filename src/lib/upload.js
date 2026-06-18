import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase'
import { todayKey } from '../context/UserContext'

const MAX_BYTES = 5 * 1024 * 1024

// Validate an image file (type + size). Returns an error string or null.
export function validateImage(file) {
  if (!file) return 'No file selected.'
  if (!file.type.startsWith('image/')) return 'Please select an image file.'
  if (file.size > MAX_BYTES) return 'Image must be under 5 MB.'
  return null
}

// Upload an image and return its download URL.
export async function uploadImage(file, path) {
  if (!storage.app.options.storageBucket) {
    throw new Error('Storage is not configured (VITE_FIREBASE_STORAGE_BUCKET missing).')
  }
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

// Compute the next daily-contribution counter from the live profile,
// handling the midnight rollover. No DB read required.
export function nextDailyContrib(profile) {
  const t = todayKey()
  const dc = profile?.dailyContrib
  if (!dc || dc.date !== t) return { date: t, count: 1 }
  return { date: t, count: (dc.count || 0) + 1 }
}
