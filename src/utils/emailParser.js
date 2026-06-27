export function parseAmount(text) {
  const patterns = [
    /(?:₦|NGN\s*)([0-9,]+\.?\d*)/gi,
    /Amount[:\s]+(?:₦|NGN\s*)?([0-9,]+\.?\d*)/gi,
    /([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''))
      if (value >= 1 && value <= 100_000_000) return value
    }
  }

  return null
}

export function parseTransactionType(text) {
  const lower = text.toLowerCase()
  const debitKeywords = ['debit', 'debited', 'withdrawal', 'pos ', 'purchase', 'charged', 'transfer out', 'sent to', 'your transfer of']
  const creditKeywords = ['credit', 'credited', 'deposit', 'received from', 'transfer in', 'inflow', 'reversal', 'refund', 'transfer received']

  if (creditKeywords.some(k => lower.includes(k))) return 'income'
  if (debitKeywords.some(k => lower.includes(k))) return 'expense'
  return 'expense'
}

export function parseDescription(snippet, subject) {
  const patterns = [
    /(?:narration|description|merchant|remark)[:\s]+([^\n\r|]{3,80})/i,
    /(?:name|recipient|beneficiary)[:\s]+([A-Z][A-Z\s]{2,50})/i,
    /(?:at |to |from )[:\s]*([A-Z][^\n\r|]{2,50})/
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(snippet)
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim().slice(0, 100)
    }
  }

  return (subject || 'Bank transaction').trim().slice(0, 100)
}

export function parseDate(headers, text) {
  const dateHeader = headers.find(h => h.name === 'Date')
  if (dateHeader) {
    const d = new Date(dateHeader.value)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  const isoMatch = /(\d{4}-\d{2}-\d{2})/.exec(text)
  if (isoMatch) return isoMatch[1]

  const slashMatch = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/.exec(text)
  if (slashMatch) {
    const d = new Date(slashMatch[1])
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  return new Date().toISOString().split('T')[0]
}

export function suggestCategory(text, categories) {
  const lower = text.toLowerCase()
  const keywordMap = [
    { name: 'Food', keywords: ['restaurant','eatery','food','kfc','domino','chicken','pizza','groceries','supermarket','shoprite','buka','canteen','cafe','coffee','meal'] },
    { name: 'Transport', keywords: ['uber','bolt','fuel','petrol','bus','transport','flight','taxi','ride','filling station','tollgate'] },
    { name: 'Housing', keywords: ['rent','utility','electricity','water','internet','cable','nepa','phcn','landlord'] },
    { name: 'Health', keywords: ['pharmacy','hospital','clinic','doctor','medical','chemist','drug'] },
    { name: 'Shopping', keywords: ['mall','market','fashion','clothing','amazon','jumia','konga','shop','boutique'] },
    { name: 'Entertainment', keywords: ['netflix','dstv','showmax','cinema','spotify','subscription','streaming'] }
  ]

  const expenseCategories = categories.filter(c => c.type === 'expense')

  for (const group of keywordMap) {
    if (group.keywords.some(k => lower.includes(k))) {
      const found = expenseCategories.find(c => c.name === group.name)
      if (found) return found.name
    }
  }

  return expenseCategories[0]?.name || ''
}

// Uses gmail.metadata scope: parses from subject + snippet (~200 chars)
export function parseEmail(message, categories) {
  const headers = message.payload?.headers || []
  const subject = headers.find(h => h.name === 'Subject')?.value || ''
  const snippet = message.snippet || ''
  const fullText = subject + '\n' + snippet

  const amount = parseAmount(fullText)
  const type = parseTransactionType(fullText)
  const description = parseDescription(snippet, subject)
  const date = parseDate(headers, snippet)
  const category = suggestCategory(fullText, categories)

  return {
    amount,
    type,
    description,
    date,
    category,
    subject,
    rawBody: snippet,
    confidence: amount ? 'high' : 'low'
  }
}
