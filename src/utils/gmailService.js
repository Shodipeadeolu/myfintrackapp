const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

let gisLoadPromise = null;

function loadGIS() {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

export async function requestGmailToken(clientId) {
  await loadGIS();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      prompt: '',
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        const expiry = Date.now() + (resp.expires_in - 60) * 1000;
        sessionStorage.setItem('gmail_token', resp.access_token);
        sessionStorage.setItem('gmail_token_expiry', String(expiry));
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export function getStoredToken() {
  const token = sessionStorage.getItem('gmail_token');
  const expiry = sessionStorage.getItem('gmail_token_expiry');
  if (!token || !expiry) return null;
  if (Date.now() >= Number(expiry)) return null;
  return token;
}

export function clearGmailToken() {
  sessionStorage.removeItem('gmail_token');
  sessionStorage.removeItem('gmail_token_expiry');
}

async function gmailFetch(token, path, params = {}) {
  const url = new URL(`${GMAIL_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
  return res.json();
}

export async function verifyGmailConnection(token) {
  const data = await gmailFetch(token, '/profile');
  return data.emailAddress;
}

export async function fetchEmailsFromSender(token, senderEmail, maxResults = 50, afterEpoch = null) {
  let q = `from:${senderEmail}`;
  if (afterEpoch) q += ` after:${Math.floor(afterEpoch / 1000)}`;
  const data = await gmailFetch(token, '/messages', { q, maxResults: String(maxResults) });
  return data.messages || [];
}

export async function fetchEmailContent(token, messageId) {
  return gmailFetch(token, `/messages/${messageId}`, { format: 'full' });
}
