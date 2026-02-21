import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRoutes } from './api'
import { pageRoutes } from './pages'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API
app.use('/api/*', cors())

// API routes
app.route('/api', apiRoutes)

// Page routes (HTML)
app.route('/', pageRoutes)

export default app
