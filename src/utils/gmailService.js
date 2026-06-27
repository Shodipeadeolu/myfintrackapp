const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SCOPE = 'https://www.googleapis.com/auth/gmail.metadata'

export async function requestGmailToken(clientId) {
  const redirectUri = import.meta.env.DEV
    ? window.location.origin + import.meta.env.BASE_URL
    : 'https://shodipeadeolu.github.io/myfintrackapp/'
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'token')
  authUrl.searchParams.set('scope', SCOPE)
  authUrl.searchParams.set('prompt', 'select_account')

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl.toString(), 'gmail_auth', 'width=520,height=650,left=200,top=100')
    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site, then try again.'))
      return
    }

    const check = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(check)
          reject(new Error('popup_closed_by_user'))
          return
        }
        const href = popup.location.href
        if (href.startsWith(window.location.origin)) {
          clearInterval(check)
          popup.close()
          const hash = new URLSearchParams(href.split('#')[1] || '')
          const token = hash.get('access_token')
          const expiresIn = hash.get('expires_in')
          const error = hash.get('error')
          if (error) { reject(new Error(hash.get('error_description') || error)); return }
          if (token) {
            const expiry = Date.now() + (Number(expiresIn) - 60) * 1000
            sessionStorage.setItem('gmail_token', token)
            sessionStorage.setItem('gmail_token_expiry', String(expiry))
            resolve(token)
          } else {
            reject(new Error('No access token received'))
          }
        }
      } catch {
        // Cross-origin while popup is on Google's domain — keep waiting
      }
    }, 300)

    setTimeout(() => {
      clearInterval(check)
      try { if (!popup.closed) popup.close() } catch {}
      reject(new Error('Authentication timed out'))
    }, 5 * 60 * 1000)
  })
}

export function getStoredToken() {
  const token = sessionStorage.getItem('gmail_token')
  const expiry = sessionStorage.getItem('gmail_token_expiry')
  if (!token || !expiry) return null
  if (Date.now() >= Number(expiry)) return null
  return token
}

export function clearGmailToken() {
  sessionStorage.removeItem('gmail_token')
  sessionStorage.removeItem('gmail_token_expiry')
}

async function gmailFetch(token, path, params = {}) {
  const url = new URL(`${GMAIL_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`)
  return res.json()
}

export async function verifyGmailConnection(token) {
  const data = await gmailFetch(token, '/profile')
  return data.emailAddress
}

export async function fetchEmailsFromSender(token, senderEmail, maxResults = 50, afterEpoch = null) {
  let q = `from:${senderEmail}`
  if (afterEpoch) q += ` after:${Math.floor(afterEpoch / 1000)}`
  const data = await gmailFetch(token, '/messages', { q, maxResults: String(maxResults) })
  return data.messages || []
}

export async function fetchEmailContent(token, messageId) {
  return gmailFetch(token, `/messages/${messageId}`, { format: 'metadata', metadataHeaders: 'Subject,From,Date' })
}
