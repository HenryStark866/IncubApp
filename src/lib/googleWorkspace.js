/**
 * Google Workspace (Gmail, Calendar, Drive, Sheets) vía OAuth del usuario.
 * Requiere VITE_GOOGLE_CLIENT_ID (OAuth 2.0 Web Client en Google Cloud).
 * Henry Stark Desarrollador
 */

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'openid',
  'email',
  'profile',
].join(' ')

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_KEY = 'incubapp_google_token_v1'

function clientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

export function googleConfigured() {
  return Boolean(clientId())
}

export function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    if (t.expires_at && t.expires_at < Date.now() + 60_000) {
      localStorage.removeItem(TOKEN_KEY)
      return null
    }
    return t
  } catch {
    return null
  }
}

function storeToken(token) {
  const expires_at = Date.now() + (Number(token.expires_in) || 3600) * 1000
  const row = { ...token, expires_at }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(row))
  return row
}

export function clearGoogleToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'))
    document.head.appendChild(s)
  })
}

/**
 * Solicita token OAuth al usuario (popup).
 */
export async function connectGoogle() {
  if (!googleConfigured()) {
    throw new Error(
      'Falta VITE_GOOGLE_CLIENT_ID. Crea un cliente OAuth Web en Google Cloud y agrégalo al .env'
    )
  }
  await loadScript(GIS_SRC)
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity no disponible')
  }
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error))
          return
        }
        resolve(storeToken(resp))
      },
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}

async function authFetch(url, options = {}, token) {
  const t = token || loadStoredToken()
  if (!t?.access_token) throw new Error('Google no conectado. Usa «Conectar Google».')
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    clearGoogleToken()
    throw new Error('Sesión de Google expirada. Vuelve a conectar.')
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err.slice(0, 300) || `Google API ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Gmail ─────────────────────────────────────────────────────

function decodeB64Url(data) {
  const s = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(s)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    try {
      return atob(s)
    } catch {
      return ''
    }
  }
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeB64Url(payload.body.data)
  const parts = payload.parts || []
  for (const p of parts) {
    if (p.mimeType === 'text/plain' && p.body?.data) return decodeB64Url(p.body.data)
  }
  for (const p of parts) {
    if (p.mimeType === 'text/html' && p.body?.data) {
      return decodeB64Url(p.body.data).replace(/<[^>]+>/g, ' ').slice(0, 2000)
    }
  }
  for (const p of parts) {
    const nested = extractBody(p)
    if (nested) return nested
  }
  return ''
}

export async function gmailListMessages({ max = 8, q = 'in:inbox' } = {}) {
  const list = await authFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`
  )
  const ids = list?.messages || []
  const out = []
  for (const m of ids.slice(0, max)) {
    const full = await authFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`
    )
    const headers = full.payload?.headers || []
    const get = (n) => headers.find((h) => h.name.toLowerCase() === n)?.value || ''
    out.push({
      id: full.id,
      threadId: full.threadId,
      subject: get('subject'),
      from: get('from'),
      date: get('date'),
      snippet: full.snippet,
      body: extractBody(full.payload).slice(0, 2500),
    })
  }
  return out
}

function toBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function gmailSend({ to, subject, body, cc }) {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body || '',
  ].filter((x) => x != null)
  const raw = toBase64Url(lines.join('\r\n'))
  return authFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  })
}

// ── Calendar ──────────────────────────────────────────────────

export async function calendarCreateEvent({
  summary,
  description,
  startIso,
  endIso,
  timeZone = 'America/Bogota',
}) {
  const body = {
    summary,
    description: description || '',
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone },
  }
  return authFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function calendarListUpcoming({ max = 8 } = {}) {
  const now = new Date().toISOString()
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?maxResults=${max}&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(now)}`
  const data = await authFetch(url)
  return (data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    htmlLink: e.htmlLink,
  }))
}

// ── Drive / Sheets ────────────────────────────────────────────

export async function driveListFiles({ max = 10, q } = {}) {
  const query = q || "trashed=false"
  const url =
    `https://www.googleapis.com/drive/v3/files?pageSize=${max}` +
    `&fields=files(id,name,mimeType,modifiedTime,webViewLink)` +
    `&q=${encodeURIComponent(query)}`
  const data = await authFetch(url)
  return data.files || []
}

export async function sheetsCreate({ title, headers = [], rows = [] }) {
  const created = await authFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: title || 'IncubApp hoja' },
    }),
  })
  const id = created.spreadsheetId
  const values = [headers.length ? headers : ['Columna A'], ...rows]
  if (values.length) {
    await authFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        body: JSON.stringify({ values }),
      }
    )
  }
  return {
    spreadsheetId: id,
    url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}`,
  }
}

export async function driveCreateDoc({ name, content }) {
  // Crear Google Doc vía Drive + contenido simple como archivo de texto en Drive
  const meta = {
    name: name || 'Nota IncubApp',
    mimeType: 'application/vnd.google-apps.document',
  }
  const boundary = 'incubapp_boundary'
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${content || ''}\r\n` +
    `--${boundary}--`
  const t = loadStoredToken()
  if (!t?.access_token) throw new Error('Google no conectado')
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error((await res.text()).slice(0, 300))
  const file = await res.json()
  return {
    id: file.id,
    name: file.name,
    url: `https://docs.google.com/document/d/${file.id}/edit`,
  }
}
