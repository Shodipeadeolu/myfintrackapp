import {
  collection, doc, getDocs, query, where,
  writeBatch, serverTimestamp, increment, setDoc
} from 'firebase/firestore'
import { db } from './config'

// ── Load ─────────────────────────────────────────────────────────

export const getCategoryMappings = async (userId, householdId) => {
  const ownerId = householdId || userId
  const snap = await getDocs(query(
    collection(db, 'categoryMappings'),
    where('ownerId', '==', ownerId)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Match ─────────────────────────────────────────────────────────

// Returns the best-matching mapping for a description, or null
export const matchCategory = (description, mappings) => {
  if (!description || !mappings.length) return null
  const descLower = description.toLowerCase()

  const matches = mappings.filter(m =>
    m.keyword && m.keyword.length >= 3 && descLower.includes(m.keyword)
  )
  if (!matches.length) return null

  // Prefer longer keywords (more specific), then higher usage count
  return matches.sort((a, b) =>
    b.keyword.length - a.keyword.length || (b.count || 0) - (a.count || 0)
  )[0]
}

// ── Build keywords from a merchant/description string ─────────────

export const extractKeywords = (merchant) => {
  if (!merchant) return []
  // Split on spaces, pipes, dashes
  const tokens = merchant.split(/[\s|,\-/]+/).map(t => t.toLowerCase().trim())
  return tokens.filter(t =>
    t.length >= 4 &&
    !/^\d+$/.test(t) &&               // skip pure numbers
    !/^(the|and|for|from|with|ltd|plc|nig|limited|nigeria|bank|opay|monie|point|quickteller|paystack|transfer|payment|charge|fee)$/.test(t)
  )
}

// ── Save ──────────────────────────────────────────────────────────

// Batch-save mappings learned from accepted transactions
export const batchSaveMappings = async (userId, householdId, pairs) => {
  // pairs: Array<{ keyword: string, category: string }>
  const ownerId = householdId || userId
  const batch = writeBatch(db)

  for (const { keyword, category } of pairs) {
    const key = keyword.toLowerCase().trim()
    if (!key || key.length < 4) continue

    // Doc ID: stable hash of owner + keyword
    const docId = `${ownerId}_${key.replace(/[^a-z0-9]/g, '_').slice(0, 50)}`
    const ref = doc(db, 'categoryMappings', docId)

    batch.set(ref, {
      ownerId,
      keyword: key,
      category,
      count: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  await batch.commit()
}
