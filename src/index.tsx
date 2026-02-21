import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRoutes } from './api'
import { authRoutes } from './auth'
import { pageRoutes } from './pages'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY?: string
  KAKAO_CLIENT_ID?: string
  KAKAO_CLIENT_SECRET?: string
  NAVER_CLIENT_ID?: string
  NAVER_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  APP_URL?: string
  SESSION_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API
app.use('/api/*', cors())

// API routes
app.route('/api', apiRoutes)

// Auth routes
app.route('/api/auth', authRoutes)

// Page routes (HTML)
app.route('/', pageRoutes)

export default app
