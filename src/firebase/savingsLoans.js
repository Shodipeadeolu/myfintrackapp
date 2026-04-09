import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, serverTimestamp, getDoc
} from 'firebase/firestore'
import { db } from './config'

const ownerId = (userId, householdId) => householdId || userId

// ── Savings Accounts ────────────────────────────────────────────
export const getSavingsAccounts = async (userId, householdId) => {
  const snap = await getDocs(query(
    collection(db, 'savings_accounts'),
    where('ownerId', '==', ownerId(userId, householdId))
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addSavingsAccount = async (userId, householdId, data) => {
  return addDoc(collection(db, 'savings_accounts'), {
    ...data,
    balance: 0,
    ownerId: ownerId(userId, householdId),
    createdBy: userId,
    createdAt: serverTimestamp()
  })
}

export const updateSavingsAccount = async (id, data) => {
  return updateDoc(doc(db, 'savings_accounts', id), { ...data, updatedAt: serverTimestamp() })
}

export const deleteSavingsAccount = async (id) => {
  return deleteDoc(doc(db, 'savings_accounts', id))
}

// ── Savings Transactions ────────────────────────────────────────
export const getSavingsTransactions = async (accountId) => {
  const snap = await getDocs(query(
    collection(db, 'savings_transactions'),
    where('accountId', '==', accountId)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

export const addSavingsTransaction = async (accountId, data) => {
  return addDoc(collection(db, 'savings_transactions'), {
    ...data, accountId, createdAt: serverTimestamp()
  })
}

// ── Loans ───────────────────────────────────────────────────────
export const getLoans = async (userId, householdId) => {
  const snap = await getDocs(query(
    collection(db, 'loans'),
    where('ownerId', '==', ownerId(userId, householdId))
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addLoan = async (userId, householdId, data) => {
  return addDoc(collection(db, 'loans'), {
    ...data,
    remainingBalance: data.principal,
    ownerId: ownerId(userId, householdId),
    createdBy: userId,
    createdAt: serverTimestamp()
  })
}

export const updateLoan = async (id, data) => {
  return updateDoc(doc(db, 'loans', id), { ...data, updatedAt: serverTimestamp() })
}

export const deleteLoan = async (id) => {
  return deleteDoc(doc(db, 'loans', id))
}

export const getLoanPayments = async (loanId) => {
  const snap = await getDocs(query(
    collection(db, 'loan_payments'),
    where('loanId', '==', loanId)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

export const addLoanPayment = async (loanId, data) => {
  return addDoc(collection(db, 'loan_payments'), {
    ...data, loanId, createdAt: serverTimestamp()
  })
}
