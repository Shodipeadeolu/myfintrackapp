import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, serverTimestamp
} from 'firebase/firestore'
import { db } from './config'

export const getBudgets = async (userId, householdId) => {
  const uid = householdId || userId
  const snap = await getDocs(query(
    collection(db, 'budgets'),
    where('ownerId', '==', uid)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addBudget = async (userId, householdId, data) => {
  return addDoc(collection(db, 'budgets'), {
    ...data,
    ownerId: householdId || userId,
    createdBy: userId,
    createdAt: serverTimestamp()
  })
}

export const updateBudget = async (id, data) => {
  return updateDoc(doc(db, 'budgets', id), { ...data, updatedAt: serverTimestamp() })
}

export const deleteBudget = async (id) => {
  return deleteDoc(doc(db, 'budgets', id))
}
