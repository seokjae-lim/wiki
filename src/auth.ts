import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
  // OAuth credentials (set via wrangler secret or .dev.vars)
  KAKAO_CLIENT_ID?: string
  KAKAO_CLIENT_SECRET?: string
  NAVER_CLIENT_ID?: string
  NAVER_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  APP_URL?: string  // e.g. https://knowledge-wiki.pages.dev or http://localhost:3000
  SESSION_SECRET?: string
}

export const authRoutes = new Hono<{ Bindings: Bindings }>()

// =============================================
// Helper: Generate random ID
// =============================================
function generateId(length = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length]
  }
  return result
}

// =============================================
// Helper: Simple password hashing (Web Crypto API)
// =============================================
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_kwiki_salt_2026')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

// =============================================
// Helper: Get base URL
// =============================================
function getBaseUrl(c: any): string {
  return c.env.APP_URL || new URL(c.req.url).origin
}

// =============================================
// Helper: Create session
// =============================================
async function createSession(db: D1Database, userId: number, c: any): Promise<string> {
  const sessionId = generateId(48)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || ''
  const ua = c.req.header('user-agent') || ''

  await db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).bind(sessionId, userId, expiresAt.toISOString(), ip, ua).run()

  // Update last login
  await db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).bind(userId).run()

  return sessionId
}

// =============================================
// Helper: Set session cookie
// =============================================
function setSessionCookie(c: any, sessionId: string) {
  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  })
}

// =============================================
// Helper: Get current user from session
// =============================================
async function getCurrentUser(c: any): Promise<any | null> {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return null

  const db = c.env.DB
  try {
    const session = await db.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.name, u.avatar_url, u.provider, u.role, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).bind(sessionId).first()

    return session || null
  } catch {
    return null
  }
}

// =============================================
// Helper: Cleanup expired data
// =============================================
async function cleanupExpired(db: D1Database) {
  try {
    await db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run()
    await db.prepare(`DELETE FROM oauth_states WHERE expires_at < datetime('now')`).run()
  } catch {}
}

// =============================================
// GET /api/auth/me - Get current user
// =============================================
authRoutes.get('/me', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) {
    return c.json({ authenticated: false, user: null })
  }
  return c.json({
    authenticated: true,
    user: {
      id: user.user_id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      provider: user.provider,
      role: user.role
    }
  })
})

// =============================================
// POST /api/auth/register - Email registration
// =============================================
authRoutes.post('/register', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{ email: string; password: string; name: string }>()

  if (!body.email || !body.password || !body.name) {
    return c.json({ error: '이메일, 비밀번호, 이름을 모두 입력하세요.' }, 400)
  }

  if (body.password.length < 6) {
    return c.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(body.email)) {
    return c.json({ error: '유효한 이메일 주소를 입력하세요.' }, 400)
  }

  try {
    // Check existing user
    const existing = await db.prepare(`SELECT id FROM users WHERE email = ?`).bind(body.email.toLowerCase()).first()
    if (existing) {
      return c.json({ error: '이미 등록된 이메일입니다. 로그인하세요.' }, 409)
    }

    const passwordHash = await hashPassword(body.password)
    const result = await db.prepare(`
      INSERT INTO users (email, name, provider, password_hash)
      VALUES (?, ?, 'email', ?)
    `).bind(body.email.toLowerCase(), body.name.trim(), passwordHash).run()

    const userId = result.meta.last_row_id as number
    const sessionId = await createSession(db, userId, c)
    setSessionCookie(c, sessionId)

    return c.json({
      success: true,
      user: { id: userId, email: body.email.toLowerCase(), name: body.name.trim(), provider: 'email', role: 'user' }
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// =============================================
// POST /api/auth/login - Email login
// =============================================
authRoutes.post('/login', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{ email: string; password: string }>()

  if (!body.email || !body.password) {
    return c.json({ error: '이메일과 비밀번호를 입력하세요.' }, 400)
  }

  try {
    const user = await db.prepare(`
      SELECT id, email, name, avatar_url, provider, role, password_hash, is_active
      FROM users WHERE email = ? AND provider = 'email'
    `).bind(body.email.toLowerCase()).first<any>()

    if (!user) {
      return c.json({ error: '등록되지 않은 이메일입니다.' }, 401)
    }

    if (!user.is_active) {
      return c.json({ error: '비활성화된 계정입니다.' }, 403)
    }

    const valid = await verifyPassword(body.password, user.password_hash)
    if (!valid) {
      return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 401)
    }

    const sessionId = await createSession(db, user.id, c)
    setSessionCookie(c, sessionId)

    return c.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, provider: user.provider, role: user.role }
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// =============================================
// POST /api/auth/logout
// =============================================
authRoutes.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session')
  if (sessionId) {
    try {
      await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run()
    } catch {}
  }
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ success: true })
})

// =============================================
// OAuth: Save state & redirect
// =============================================
async function startOAuth(c: any, provider: string, authUrl: string) {
  const db = c.env.DB
  const state = generateId(32)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min
  const redirectUrl = c.req.query('redirect') || '/'

  await db.prepare(`
    INSERT INTO oauth_states (state, provider, redirect_url, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(state, provider, redirectUrl, expiresAt.toISOString()).run()

  // Cleanup old states periodically
  await cleanupExpired(db)

  return c.redirect(authUrl + '&state=' + state)
}

// =============================================
// OAuth: Handle callback & create/link user
// =============================================
async function handleOAuthCallback(
  c: any,
  provider: string,
  profile: { id: string; email: string; name: string; avatar_url: string }
): Promise<Response> {
  const db = c.env.DB

  // Check state
  const state = c.req.query('state')
  if (!state) return c.json({ error: 'Missing state' }, 400)

  const stateRow = await db.prepare(`
    SELECT * FROM oauth_states WHERE state = ? AND provider = ? AND expires_at > datetime('now')
  `).bind(state, provider).first<any>()

  if (!stateRow) return c.json({ error: 'Invalid or expired state' }, 400)

  // Delete used state
  await db.prepare(`DELETE FROM oauth_states WHERE state = ?`).bind(state).run()

  const redirectUrl = stateRow.redirect_url || '/'

  try {
    // Check if user exists by provider+id
    let user = await db.prepare(`
      SELECT * FROM users WHERE provider = ? AND provider_id = ?
    `).bind(provider, profile.id).first<any>()

    if (!user && profile.email) {
      // Check by email (link accounts)
      user = await db.prepare(`SELECT * FROM users WHERE email = ?`).bind(profile.email.toLowerCase()).first<any>()
      if (user) {
        // Update provider info for existing email user
        await db.prepare(`
          UPDATE users SET provider = ?, provider_id = ?, avatar_url = COALESCE(NULLIF(?, ''), avatar_url), updated_at = datetime('now')
          WHERE id = ?
        `).bind(provider, profile.id, profile.avatar_url, user.id).run()
      }
    }

    if (!user) {
      // Create new user
      const result = await db.prepare(`
        INSERT INTO users (email, name, avatar_url, provider, provider_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        profile.email?.toLowerCase() || `${provider}_${profile.id}@oauth.local`,
        profile.name || provider + ' User',
        profile.avatar_url || '',
        provider,
        profile.id
      ).run()

      user = { id: result.meta.last_row_id }
    }

    const sessionId = await createSession(db, user.id as number, c)
    setSessionCookie(c, sessionId)

    // Redirect back to app
    return c.redirect(redirectUrl)
  } catch (e: any) {
    return c.redirect('/?auth_error=' + encodeURIComponent(e.message))
  }
}

// =============================================
// KAKAO OAuth
// =============================================
authRoutes.get('/kakao', async (c) => {
  const clientId = c.env.KAKAO_CLIENT_ID
  if (!clientId) return c.json({ error: 'Kakao OAuth not configured' }, 500)

  const baseUrl = getBaseUrl(c)
  const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/kakao/callback`)
  const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code`

  return startOAuth(c, 'kakao', authUrl)
})

authRoutes.get('/kakao/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'No authorization code' }, 400)

  const baseUrl = getBaseUrl(c)
  const redirectUri = `${baseUrl}/api/auth/kakao/callback`

  // Exchange code for token
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: c.env.KAKAO_CLIENT_ID || '',
      client_secret: c.env.KAKAO_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      code
    })
  })
  const tokenData = await tokenRes.json() as any
  if (!tokenData.access_token) return c.json({ error: 'Token exchange failed', detail: tokenData }, 400)

  // Get user profile
  const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
  })
  const profileData = await profileRes.json() as any

  const kakaoAccount = profileData.kakao_account || {}
  const profile = {
    id: String(profileData.id),
    email: kakaoAccount.email || '',
    name: kakaoAccount.profile?.nickname || profileData.properties?.nickname || '',
    avatar_url: kakaoAccount.profile?.profile_image_url || profileData.properties?.profile_image || ''
  }

  return handleOAuthCallback(c, 'kakao', profile)
})

// =============================================
// NAVER OAuth
// =============================================
authRoutes.get('/naver', async (c) => {
  const clientId = c.env.NAVER_CLIENT_ID
  if (!clientId) return c.json({ error: 'Naver OAuth not configured' }, 500)

  const baseUrl = getBaseUrl(c)
  const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/naver/callback`)
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code`

  return startOAuth(c, 'naver', authUrl)
})

authRoutes.get('/naver/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'No authorization code' }, 400)

  const baseUrl = getBaseUrl(c)
  const redirectUri = `${baseUrl}/api/auth/naver/callback`

  // Exchange code for token
  const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: c.env.NAVER_CLIENT_ID || '',
      client_secret: c.env.NAVER_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      code
    })
  })
  const tokenData = await tokenRes.json() as any
  if (!tokenData.access_token) return c.json({ error: 'Token exchange failed', detail: tokenData }, 400)

  // Get user profile
  const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
  })
  const profileData = await profileRes.json() as any
  const naverProfile = profileData.response || {}

  const profile = {
    id: naverProfile.id || '',
    email: naverProfile.email || '',
    name: naverProfile.name || naverProfile.nickname || '',
    avatar_url: naverProfile.profile_image || ''
  }

  return handleOAuthCallback(c, 'naver', profile)
})

// =============================================
// GOOGLE OAuth
// =============================================
authRoutes.get('/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  if (!clientId) return c.json({ error: 'Google OAuth not configured' }, 500)

  const baseUrl = getBaseUrl(c)
  const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/google/callback`)
  const scope = encodeURIComponent('openid email profile')
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline`

  return startOAuth(c, 'google', authUrl)
})

authRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'No authorization code' }, 400)

  const baseUrl = getBaseUrl(c)
  const redirectUri = `${baseUrl}/api/auth/google/callback`

  // Exchange code for token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: c.env.GOOGLE_CLIENT_ID || '',
      client_secret: c.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      code
    })
  })
  const tokenData = await tokenRes.json() as any
  if (!tokenData.access_token) return c.json({ error: 'Token exchange failed', detail: tokenData }, 400)

  // Get user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
  })
  const profileData = await profileRes.json() as any

  const profile = {
    id: profileData.id || '',
    email: profileData.email || '',
    name: profileData.name || '',
    avatar_url: profileData.picture || ''
  }

  return handleOAuthCallback(c, 'google', profile)
})

// =============================================
// GET /api/auth/providers - Available OAuth providers
// =============================================
authRoutes.get('/providers', (c) => {
  const providers = []
  if (c.env.KAKAO_CLIENT_ID) providers.push({ id: 'kakao', name: '카카오', icon: 'comment', color: '#FEE500', textColor: '#191919' })
  if (c.env.NAVER_CLIENT_ID) providers.push({ id: 'naver', name: '네이버', icon: 'n', color: '#03C75A', textColor: '#FFFFFF' })
  if (c.env.GOOGLE_CLIENT_ID) providers.push({ id: 'google', name: 'Google', icon: 'google', color: '#FFFFFF', textColor: '#757575' })
  providers.push({ id: 'email', name: '이메일', icon: 'envelope', color: '#6366f1', textColor: '#FFFFFF' })

  return c.json({ providers })
})
