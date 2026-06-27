const functions = require('firebase-functions')
const admin = require('firebase-admin')
admin.initializeApp()
const db = admin.firestore()

// ── parsers (mirrors src/utils/emailParser.js) ──────────────────────────────

function parseAmount(text) {
  const patterns = [
    /(?:₦|NGN\s*)([0-9,]+\.?\d*)/gi,
    /Amount[:\s]+(?:₦|NGN\s*)?([0-9,]+\.?\d*)/gi,
    /([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)/g,
  ]
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''))
      if (value >= 1 && value <= 100_000_000) return value
    }
  }
  return null
}

function parseType(text) {
  const lower = text.toLowerCase()
  const credit = ['credit', 'credited', 'deposit', 'received from', 'transfer in', 'inflow', 'reversal', 'refund', 'transfer received']
  const debit  = ['debit', 'debited', 'withdrawal', 'pos ', 'purchase', 'charged', 'transfer out', 'sent to', 'your transfer of']
  if (credit.some(k => lower.includes(k))) return 'income'
  if (debit.some(k => lower.includes(k)))  return 'expense'
  return 'expense'
}

function parseDescription(body, subject) {
  const patterns = [
    /(?:narration|description|merchant|remark)[:\s]+([^\n\r|]{3,80})/i,
    /(?:name|recipient|beneficiary)[:\s]+([A-Z][A-Z\s]{2,50})/i,
    /(?:at |to |from )([A-Z][^\n\r|]{2,50})/,
  ]
  for (const p of patterns) {
    const m = p.exec(body || '')
    if (m && m[1] && m[1].trim().length > 2) return m[1].trim().slice(0, 100)
  }
  return (subject || 'Bank transaction').trim().slice(0, 100)
}

// ── HTTP endpoint ─────────────────────────────────────────────────────────────

exports.emailImport = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  const { userCode, subject, body, date, from: sender } = req.body || {}

  if (!userCode || !subject) {
    return res.status(400).json({ error: 'Missing userCode or subject' })
  }

  // Find user by their unique import code
  const snap = await db.collection('emailImportConfig')
    .where('importCode', '==', userCode)
    .limit(1)
    .get()

  if (snap.empty) return res.status(404).json({ error: 'Unknown import code' })

  const configDoc = snap.docs[0]
  const userId    = configDoc.id
  const { householdId } = configDoc.data()

  const fullText = `${subject}\n${body || ''}`
  const amount   = parseAmount(fullText)

  if (!amount) {
    return res.status(200).json({ skipped: true, reason: 'No amount detected' })
  }

  const txDate = date
    ? new Date(date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const bankName = (sender || '').replace(/<[^>]+>/, '').trim() || 'Bank'

  await db.collection('pendingImports').add({
    userId,
    householdId: householdId || null,
    subject,
    amount,
    type:        parseType(fullText),
    description: parseDescription(body, subject),
    date:        txDate,
    category:    '',
    bankName,
    rawBody:     (body || '').slice(0, 500),
    confidence:  'high',
    status:      'pending',
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
  })

  return res.status(200).json({ success: true, amount })
})
