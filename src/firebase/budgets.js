import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, serverTimestamp
} from 'firebase/firestore'
import { db } from './config'

// ── Base budgets ─────────────────────────────────────────────
export const getBudgets = async (userId, householdId) => {
  const uid = householdId || userId
  const snap = await getDocs(query(collection(db, 'budgets'), where('ownerId', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addBudget = async (userId, householdId, data) =>
  addDoc(collection(db, 'budgets'), {
    ...data,
    ownerId: householdId || userId,
    createdBy: userId,
    createdAt: serverTimestamp()
  })

export const updateBudget = async (id, data) =>
  updateDoc(doc(db, 'budgets', id), { ...data, updatedAt: serverTimestamp() })

export const deleteBudget = async (id) =>
  deleteDoc(doc(db, 'budgets', id))

// ── Monthly overrides ────────────────────────────────────────
// Stored in 'budgetOverrides' collection
// Each doc: { budgetId, ownerId, monthKey (YYYY-MM), amount }

export const getBudgetOverrides = async (userId, householdId, monthKey) => {
  const uid = householdId || userId
  const snap = await getDocs(
    query(
      collection(db, 'budgetOverrides'),
      where('ownerId', '==', uid),
      where('monthKey', '==', monthKey)
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const setBudgetOverride = async (userId, householdId, budgetId, monthKey, amount, note) => {
  const uid = householdId || userId
  // Check if override already exists for this budget+month
  const snap = await getDocs(
    query(
      collection(db, 'budgetOverrides'),
      where('ownerId', '==', uid),
      where('budgetId', '==', budgetId),
      where('monthKey', '==', monthKey)
    )
  )
  if (!snap.empty) {
    // Update existing override
    await updateDoc(doc(db, 'budgetOverrides', snap.docs[0].id), {
      amount, note: note || '', updatedAt: serverTimestamp()
    })
    return snap.docs[0].id
  } else {
    // Create new override
    const ref = await addDoc(collection(db, 'budgetOverrides'), {
      budgetId, ownerId: uid, monthKey, amount,
      note: note || '',
      createdBy: userId, createdAt: serverTimestamp()
    })
    return ref.id
  }
}

export const getBudgetOverridesRange = async (userId, householdId, startKey, endKey) => {
  const uid = householdId || userId
  // Equality-only query (avoids needing a composite index for ownerId + monthKey range);
  // filter the range client-side since overrides per household are a small set.
  const snap = await getDocs(query(collection(db, 'budgetOverrides'), where('ownerId', '==', uid)))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => o.monthKey >= startKey && o.monthKey <= endKey)
}

export const deleteBudgetOverride = async (userId, householdId, budgetId, monthKey) => {
  const uid = householdId || userId
  const snap = await getDocs(
    query(
      collection(db, 'budgetOverrides'),
      where('ownerId', '==', uid),
      where('budgetId', '==', budgetId),
      where('monthKey', '==', monthKey)
    )
  )
  if (!snap.empty) {
    await deleteDoc(doc(db, 'budgetOverrides', snap.docs[0].id))
  }
}
