import { db } from './config'
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore'

export async function getEmailImportConfig(userId) {
  const ref = doc(db, 'emailImportConfig', userId)
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

export async function saveEmailImportConfig(userId, data) {
  const ref = doc(db, 'emailImportConfig', userId)
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

export async function addPendingImport(userId, householdId, importData) {
  const ownerId = householdId || userId
  const ref = collection(db, 'pendingImports')
  return await addDoc(ref, {
    ...importData,
    ownerId,
    createdBy: userId,
    status: 'pending',
    createdAt: serverTimestamp()
  })
}

export async function getPendingImports(userId, householdId) {
  const ownerId = householdId || userId
  const ref = collection(db, 'pendingImports')
  const q = query(
    ref,
    where('ownerId', '==', ownerId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(100)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updatePendingImport(id, data) {
  const ref = doc(db, 'pendingImports', id)
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

export async function dismissPendingImport(id) {
  const ref = doc(db, 'pendingImports', id)
  await updateDoc(ref, { status: 'dismissed' })
}

export async function getScannedEmailIds(userId) {
  const config = await getEmailImportConfig(userId)
  return config?.scannedEmailIds || []
}

export async function markEmailsScanned(userId, emailIds) {
  const existing = await getScannedEmailIds(userId)
  const merged = [...new Set([...existing, ...emailIds])].slice(-1000)
  await saveEmailImportConfig(userId, { scannedEmailIds: merged })
}
