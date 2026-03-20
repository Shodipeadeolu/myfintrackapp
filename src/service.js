import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, writeBatch,
  serverTimestamp, getDoc, setDoc
} from 'firebase/firestore'
import { db } from './config'

// ─── Helpers ─────────────────────────────────────────────────
const _genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// ─── Transactions ────────────────────────────────────────────
export const getTransactions = async (userId, householdId, startDate, endDate) => {
  const uid = householdId || userId
  // NOTE: combining where(range) + orderBy requires a composite index in Firestore.
  // We sort client-side instead so the app works without index configuration.
  const q = query(
    collection(db, 'transactions'),
    where('ownerId', '==', uid),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  )
  const snap = await getDocs(q)
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  // Sort descending by date client-side
  return docs.sort((a, b) => b.date.localeCompare(a.date))
}

export const addTransaction = async (userId, householdId, data) => {
  return addDoc(collection(db, 'transactions'), {
    ...data,
    ownerId: householdId || userId,
    createdBy: userId,
    createdAt: serverTimestamp()
  })
}

export const updateTransaction = async (id, data) => {
  return updateDoc(doc(db, 'transactions', id), { ...data, updatedAt: serverTimestamp() })
}

export const deleteTransaction = async (id) => {
  return deleteDoc(doc(db, 'transactions', id))
}

export const batchAddTransactions = async (userId, householdId, transactions, onProgress) => {
  const ownerId = householdId || userId
  const BATCH_SIZE = 499 // Firestore hard limit is 500 ops per batch
  let imported = 0
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = transactions.slice(i, i + BATCH_SIZE)
    chunk.forEach(tx => {
      const ref = doc(collection(db, 'transactions'))
      batch.set(ref, { ...tx, ownerId, createdBy: userId, createdAt: serverTimestamp() })
    })
    await batch.commit()
    imported += chunk.length
    onProgress && onProgress(Math.round((imported / transactions.length) * 100))
    // Yield to event loop so React can repaint the progress bar
    await new Promise(r => setTimeout(r, 0))
  }
  return imported
}

// ─── Categories ──────────────────────────────────────────────
export const getCategories = async (userId, householdId) => {
  const uid = householdId || userId
  const snap = await getDocs(query(
    collection(db, 'categories'),
    where('ownerId', '==', uid)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addCategory = async (userId, householdId, data) => {
  return addDoc(collection(db, 'categories'), {
    ...data,
    ownerId: householdId || userId,
    createdBy: userId,
    createdAt: serverTimestamp()
  })
}

export const updateCategory = async (id, data) => {
  return updateDoc(doc(db, 'categories', id), data)
}

export const deleteCategory = async (id) => {
  return deleteDoc(doc(db, 'categories', id))
}

export const seedDefaultCategories = async (userId) => {
  const defaults = [
    { name: 'Food', icon: '🍔', type: 'expense', subcategories: ['Groceries', 'Restaurants', 'Coffee'] },
    { name: 'Transport', icon: '🚗', type: 'expense', subcategories: ['Fuel', 'Public Transit', 'Parking', 'Rideshare'] },
    { name: 'Housing', icon: '🏠', type: 'expense', subcategories: ['Rent', 'Utilities', 'Internet', 'Maintenance'] },
    { name: 'Health', icon: '💊', type: 'expense', subcategories: ['Pharmacy', 'Doctor', 'Gym', 'Insurance'] },
    { name: 'Entertainment', icon: '🎬', type: 'expense', subcategories: ['Streaming', 'Games', 'Events', 'Hobbies'] },
    { name: 'Shopping', icon: '🛍️', type: 'expense', subcategories: ['Clothing', 'Electronics', 'Home', 'Personal Care'] },
    { name: 'Miscellaneous', icon: '📦', type: 'expense', subcategories: ['Other'] },
    { name: 'Salary', icon: '💼', type: 'income', subcategories: ['Monthly Salary', 'Bonus', 'Commission'] },
    { name: 'Business', icon: '📊', type: 'income', subcategories: ['Freelance', 'Sales', 'Consulting'] },
    { name: 'Other Income', icon: '💰', type: 'income', subcategories: ['Gift', 'Refund', 'Investment'] },
  ]
  const batch = writeBatch(db)
  defaults.forEach(cat => {
    const ref = doc(collection(db, 'categories'))
    batch.set(ref, { ...cat, ownerId: userId, createdBy: userId, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

// ─── Household ───────────────────────────────────────────────
export const getHousehold = async (householdId) => {
  const snap = await getDoc(doc(db, 'households', householdId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const createHousehold = async (userId, name) => {
  const ref = doc(collection(db, 'households'))
  const code = _genCode()
  await setDoc(ref, {
    name,
    ownerId: userId,
    inviteCode: code,
    members: [{ userId, role: 'owner', joinedAt: new Date().toISOString() }],
    createdAt: serverTimestamp()
  })
  return ref.id
}

export const updateHousehold = async (id, data) => {
  return updateDoc(doc(db, 'households', id), data)
}

export const getHouseholdInvites = async (email) => {
  // Compound query on inviteeEmail + status needs a composite index.
  // Query only by email and filter status client-side to avoid index requirement.
  const snap = await getDocs(query(
    collection(db, 'invites'),
    where('inviteeEmail', '==', email.toLowerCase())
  ))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.status === 'pending')
}

export const createInvite = async (householdId, householdName, inviterName, inviteeEmail, role) => {
  return addDoc(collection(db, 'invites'), {
    householdId,
    householdName,
    inviterName,
    inviteeEmail: inviteeEmail.toLowerCase(),
    role,
    status: 'pending',
    createdAt: serverTimestamp()
  })
}

export const acceptInvite = async (inviteId, inviteData, userId) => {
  const batch = writeBatch(db)
  batch.update(doc(db, 'invites', inviteId), { status: 'accepted' })
  const household = await getHousehold(inviteData.householdId)
  const members = [...(household.members || []), {
    userId,
    role: inviteData.role,
    joinedAt: new Date().toISOString()   // serverTimestamp() not allowed inside arrays
  }]
  batch.update(doc(db, 'households', inviteData.householdId), { members })
  await batch.commit()
}

export const declineInvite = async (inviteId) => {
  return updateDoc(doc(db, 'invites', inviteId), { status: 'declined' })
}

export const removeMember = async (householdId, userId) => {
  const household = await getHousehold(householdId)
  const members = household.members.filter(m => m.userId !== userId)
  return updateDoc(doc(db, 'households', householdId), { members })
}

export const updateMemberRole = async (householdId, userId, role) => {
  const household = await getHousehold(householdId)
  const members = household.members.map(m => m.userId === userId ? { ...m, role } : m)
  return updateDoc(doc(db, 'households', householdId), { members })
}

// ─── User profile ─────────────────────────────────────────────
export const getUserProfile = async (userId) => {
  const snap = await getDoc(doc(db, 'users', userId))
  return snap.exists() ? snap.data() : null
}

export const setUserProfile = async (userId, data) => {
  return setDoc(doc(db, 'users', userId), data, { merge: true })
}

// ─── Invite Codes ─────────────────────────────────────────────
export const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O,0,I,1 to avoid confusion
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export const setHouseholdInviteCode = async (householdId, role = 'record-edit') => {
  const code = generateInviteCode()
  await updateDoc(doc(db, 'households', householdId), { inviteCode: code, inviteCodeRole: role })
  return code
}

export const getHouseholdByCode = async (code) => {
  const snap = await getDocs(query(
    collection(db, 'households'),
    where('inviteCode', '==', code.toUpperCase().trim())
  ))
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

export const joinHouseholdByCode = async (code, userId) => {
  const hh = await getHouseholdByCode(code)
  if (!hh) throw new Error('Invalid code. Check and try again.')
  if (hh.members?.some(m => m.userId === userId))
    throw new Error('You are already a member of this household.')
  const role = hh.inviteCodeRole || 'record-edit'
  const members = [...(hh.members || []), {
    userId,
    role,
    joinedAt: new Date().toISOString()
  }]
  await updateDoc(doc(db, 'households', hh.id), { members })
  return hh
}
