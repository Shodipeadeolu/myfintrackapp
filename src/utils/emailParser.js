export function extractEmailBody(payload) {
  if (!payload) return ''

  function decodeBase64url(data) {
    return atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  }

  function stripHtml(html) {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
  }

  if (payload.body && payload.body.data) {
    const decoded = decodeBase64url(payload.body.data)
    if (payload.mimeType === 'text/plain') return decoded
    if (payload.mimeType === 'text/html') return stripHtml(decoded)
  }

  if (payload.parts && payload.parts.length) {
    let htmlResult = ''
    for (const part of payload.parts) {
      const result = extractEmailBody(part)
      if (result && part.mimeType === 'text/plain') return result
      if (result && part.mimeType === 'text/html') htmlResult = result
    }
    if (htmlResult) return htmlResult
    for (const part of payload.parts) {
      const result = extractEmailBody(part)
      if (result) return result
    }
  }

  return ''
}

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
  const debitKeywords = ['debit', 'debited', 'withdrawal', 'pos ', 'purchase', 'charged', 'transfer out', 'sent to']
  const creditKeywords = ['credit', 'credited', 'deposit', 'received from', 'transfer in', 'inflow', 'reversal', 'refund']

  const hasDebit = debitKeywords.some(k => lower.includes(k))
  const hasCredit = creditKeywords.some(k => lower.includes(k))

  if (hasDebit) return 'expense'
  if (hasCredit) return 'income'
  return 'expense'
}

export function parseDescription(body, subject) {
  const patterns = [
    /(?:narration|description|details|merchant|remark)[:\s]+([^\n\r|]{3,80})/i,
    /(?:at |to |from )[:\s]*([A-Z][^\n\r|]{2,50})/
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(body)
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim().slice(0, 100)
    }
  }

  return (subject || 'Bank transaction').trim().slice(0, 100)
}

export function parseDate(headers, body) {
  const dateHeader = headers.find(h => h.name === 'Date')
  if (dateHeader) {
    const d = new Date(dateHeader.value)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  const isoMatch = /(\d{4}-\d{2}-\d{2})/.exec(body)
  if (isoMatch) return isoMatch[1]

  const slashMatch = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/.exec(body)
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

export function parseEmail(message, categories) {
  const headers = message.payload?.headers || []
  const subject = headers.find(h => h.name === 'Subject')?.value || ''
  const body = extractEmailBody(message.payload)
  const fullText = subject + '\n' + body

  const amount = parseAmount(fullText)
  const type = parseTransactionType(fullText)
  const description = parseDescription(body, subject)
  const date = parseDate(headers, body)
  const category = suggestCategory(fullText, categories)

  return {
    amount,
    type,
    description,
    date,
    category,
    subject,
    rawBody: body.slice(0, 500),
    confidence: amount ? 'high' : 'low'
  }
}
