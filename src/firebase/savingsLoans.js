import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from './config'

// ── Savings Accounts ──────────────────────────────────────────
export const getSavingsAccounts = async (userId, householdId) => {
  const ownerId = householdId || userId
  const snap = await getDocs(query(collection(db, 'savingsAccounts'), where('ownerId', '==', ownerId)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addSavingsAccount = async (userId, householdId, data) => {
  return addDoc(collection(db, 'savingsAccounts'), {
    ...data, ownerId: householdId || userId, createdBy: userId, createdAt: serverTimestamp()
  })
}

export const updateSavingsAccount = async (id, data) => {
  return updateDoc(doc(db, 'savingsAccounts', id), { ...data, updatedAt: serverTimestamp() })
}

export const deleteSavingsAccount = async (id) => deleteDoc(doc(db, 'savingsAccounts', id))

// Transactions within a savings account
export const getSavingsTxs = async (accountId) => {
  const snap = await getDocs(query(collection(db, 'savingsTxs'), where('accountId', '==', accountId)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addSavingsTx = async (accountId, userId, data) => {
  return addDoc(collection(db, 'savingsTxs'), {
    ...data, accountId, createdBy: userId, createdAt: serverTimestamp()
  })
}

// ── Loan Accounts ─────────────────────────────────────────────
export const getLoanAccounts = async (userId, householdId) => {
  const ownerId = householdId || userId
  const snap = await getDocs(query(collection(db, 'loanAccounts'), where('ownerId', '==', ownerId)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addLoanAccount = async (userId, householdId, data) => {
  return addDoc(collection(db, 'loanAccounts'), {
    ...data, ownerId: householdId || userId, createdBy: userId, createdAt: serverTimestamp()
  })
}

export const updateLoanAccount = async (id, data) => {
  return updateDoc(doc(db, 'loanAccounts', id), { ...data, updatedAt: serverTimestamp() })
}

export const deleteLoanAccount = async (id) => deleteDoc(doc(db, 'loanAccounts', id))

export const getLoanTxs = async (accountId) => {
  const snap = await getDocs(query(collection(db, 'loanTxs'), where('accountId', '==', accountId)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addLoanTx = async (accountId, userId, data) => {
  return addDoc(collection(db, 'loanTxs'), {
    ...data, accountId, createdBy: userId, createdAt: serverTimestamp()
  })
}
