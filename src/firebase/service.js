import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, writeBatch,
  serverTimestamp, getDoc, setDoc
} from 'firebase/firestore'
import { db } from './config'

// ─── Transactions ────────────────────────────────────────────
export const getTransactions = async (userId, householdId, startDate, endDate) => {
  const uid = householdId || userId
  const q = query(
    collection(db, 'transactions'),
    where('ownerId', '==', uid),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
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
  const BATCH_SIZE = 400
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
  await setDoc(ref, {
    name,
    ownerId: userId,
    members: [{ userId, role: 'owner', joinedAt: serverTimestamp() }],
    createdAt: serverTimestamp()
  })
  return ref.id
}

export const updateHousehold = async (id, data) => {
  return updateDoc(doc(db, 'households', id), data)
}

export const getHouseholdInvites = async (email) => {
  const snap = await getDocs(query(
    collection(db, 'invites'),
    where('inviteeEmail', '==', email),
    where('status', '==', 'pending')
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const createInvite = async (householdId, householdName, inviterName, inviteeEmail, role) => {
  return addDoc(collection(db, 'invites'), {
    householdId,
    householdName,
    inviterName,
    inviteeEmail,
    role,
    status: 'pending',
    createdAt: serverTimestamp()
  })
}

export const acceptInvite = async (inviteId, inviteData, userId) => {
  const batch = writeBatch(db)
  // Update invite status
  batch.update(doc(db, 'invites', inviteId), { status: 'accepted' })
  // Add member to household
  const household = await getHousehold(inviteData.householdId)
  const members = [...(household.members || []), {
    userId,
    role: inviteData.role,
    joinedAt: serverTimestamp()
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
