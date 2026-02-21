import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY?: string
}

export const apiRoutes = new Hono<{ Bindings: Bindings }>()

// =============================================
// GET /api/search - Full Text Search (Enhanced)
// =============================================
apiRoutes.get('/search', async (c) => {
  const db = c.env.DB
  const q = c.req.query('q') || ''
  const path = c.req.query('path') || ''
  const type = c.req.query('type') || ''
  const project = c.req.query('project') || ''
  const category = c.req.query('category') || ''
  const tag = c.req.query('tag') || ''
  const doc_stage = c.req.query('doc_stage') || ''
  const org = c.req.query('org') || ''
  const year = c.req.query('year') || ''
  const sort = c.req.query('sort') || 'relevance'
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  if (!q.trim()) {
    return c.json({ results: [], total: 0, page, limit, query: q })
  }

  let sql = `
    SELECT 
      c.chunk_id, c.file_path, c.file_type, c.project_path,
      c.doc_title, c.location_type, c.location_value, c.location_detail,
      snippet(chunks_fts, 0, '<mark>', '</mark>', '...', 40) as snippet,
      c.mtime, c.tags, c.category, c.sub_category, c.author, c.org,
      c.doc_stage, c.doc_year, c.importance, c.view_count,
      rank
    FROM chunks_fts
    JOIN chunks c ON chunks_fts.rowid = c.rowid
    WHERE chunks_fts MATCH ?
  `
  const queryParams: any[] = [q]

  if (path) { sql += ` AND c.file_path LIKE ?`; queryParams.push(`%${path}%`) }
  if (type) { sql += ` AND c.file_type = ?`; queryParams.push(type) }
  if (project) { sql += ` AND c.project_path LIKE ?`; queryParams.push(`%${project}%`) }
  if (category) { sql += ` AND c.category = ?`; queryParams.push(category) }
  if (tag) { sql += ` AND c.tags LIKE ?`; queryParams.push(`%${tag}%`) }
  if (doc_stage) { sql += ` AND c.doc_stage = ?`; queryParams.push(doc_stage) }
  if (org) { sql += ` AND c.org LIKE ?`; queryParams.push(`%${org}%`) }
  if (year) { sql += ` AND c.doc_year = ?`; queryParams.push(year) }

  if (sort === 'mtime') sql += ` ORDER BY c.mtime DESC`
  else if (sort === 'views') sql += ` ORDER BY c.view_count DESC`
  else if (sort === 'importance') sql += ` ORDER BY c.importance DESC`
  else sql += ` ORDER BY rank`

  sql += ` LIMIT ? OFFSET ?`
  queryParams.push(limit, offset)

  try {
    const results = await db.prepare(sql).bind(...queryParams).all()

    let countSql = `
      SELECT COUNT(*) as total FROM chunks_fts
      JOIN chunks c ON chunks_fts.rowid = c.rowid
      WHERE chunks_fts MATCH ?
    `
    const countParams: any[] = [q]
    if (path) { countSql += ` AND c.file_path LIKE ?`; countParams.push(`%${path}%`) }
    if (type) { countSql += ` AND c.file_type = ?`; countParams.push(type) }
    if (project) { countSql += ` AND c.project_path LIKE ?`; countParams.push(`%${project}%`) }
    if (category) { countSql += ` AND c.category = ?`; countParams.push(category) }
    if (tag) { countSql += ` AND c.tags LIKE ?`; countParams.push(`%${tag}%`) }
    if (doc_stage) { countSql += ` AND c.doc_stage = ?`; countParams.push(doc_stage) }
    if (org) { countSql += ` AND c.org LIKE ?`; countParams.push(`%${org}%`) }
    if (year) { countSql += ` AND c.doc_year = ?`; countParams.push(year) }

    const countResult = await db.prepare(countSql).bind(...countParams).first<{ total: number }>()

    return c.json({ results: results.results, total: countResult?.total || 0, page, limit, query: q })
  } catch (e: any) {
    return c.json({ results: [], total: 0, page, limit, query: q, error: e.message })
  }
})

// =============================================
// GET /api/browse - Browse without FTS (filter only)
// =============================================
apiRoutes.get('/browse', async (c) => {
  const db = c.env.DB
  const type = c.req.query('type') || ''
  const project = c.req.query('project') || ''
  const category = c.req.query('category') || ''
  const tag = c.req.query('tag') || ''
  const doc_stage = c.req.query('doc_stage') || ''
  const org = c.req.query('org') || ''
  const year = c.req.query('year') || ''
  const sort = c.req.query('sort') || 'mtime'
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  let conditions: string[] = []
  let params: any[] = []

  if (type) { conditions.push(`file_type = ?`); params.push(type) }
  if (project) { conditions.push(`project_path LIKE ?`); params.push(`%${project}%`) }
  if (category) { conditions.push(`category = ?`); params.push(category) }
  if (tag) { conditions.push(`tags LIKE ?`); params.push(`%${tag}%`) }
  if (doc_stage) { conditions.push(`doc_stage = ?`); params.push(doc_stage) }
  if (org) { conditions.push(`org LIKE ?`); params.push(`%${org}%`) }
  if (year) { conditions.push(`doc_year = ?`); params.push(year) }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  let orderBy = 'ORDER BY mtime DESC'
  if (sort === 'views') orderBy = 'ORDER BY view_count DESC'
  else if (sort === 'importance') orderBy = 'ORDER BY importance DESC'
  else if (sort === 'title') orderBy = 'ORDER BY doc_title ASC'

  try {
    const sql = `SELECT chunk_id, file_path, file_type, project_path, doc_title,
      location_type, location_value, location_detail, 
      substr(text, 1, 200) as snippet, mtime, tags, category, sub_category,
      author, org, doc_stage, doc_year, importance, view_count
      FROM chunks ${where} ${orderBy} LIMIT ? OFFSET ?`
    const results = await db.prepare(sql).bind(...params, limit, offset).all()

    const countSql = `SELECT COUNT(*) as total FROM chunks ${where}`
    const countResult = await db.prepare(countSql).bind(...params).first<{ total: number }>()

    return c.json({ results: results.results, total: countResult?.total || 0, page, limit })
  } catch (e: any) {
    return c.json({ results: [], total: 0, page, limit, error: e.message })
  }
})

// =============================================
// GET /api/doc/:chunk_id - Document Detail + view count++
// =============================================
apiRoutes.get('/doc/:chunk_id', async (c) => {
  const db = c.env.DB
  const chunkId = c.req.param('chunk_id')

  try {
    // Increment view count
    await db.prepare(`UPDATE chunks SET view_count = view_count + 1 WHERE chunk_id = ?`).bind(chunkId).run()

    const result = await db.prepare(`SELECT * FROM chunks WHERE chunk_id = ?`).bind(chunkId).first()
    if (!result) return c.json({ error: 'Chunk not found' }, 404)

    // Get related chunks from same file
    const related = await db.prepare(`
      SELECT chunk_id, doc_title, location_detail, substr(text, 1, 100) as snippet
      FROM chunks WHERE file_path = ? AND chunk_id != ? ORDER BY location_value LIMIT 5
    `).bind(result.file_path as string, chunkId).all()

    // Get similar category chunks
    const similar = await db.prepare(`
      SELECT chunk_id, doc_title, file_path, location_detail, category, 
        substr(text, 1, 100) as snippet
      FROM chunks WHERE category = ? AND chunk_id != ? AND category != ''
      ORDER BY importance DESC LIMIT 5
    `).bind(result.category as string, chunkId).all()

    return c.json({ ...result, related: related.results, similar: similar.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// =============================================
// GET /api/stats - Enhanced Statistics
// =============================================
apiRoutes.get('/stats', async (c) => {
  const db = c.env.DB

  try {
    const totalChunks = await db.prepare(`SELECT COUNT(*) as count FROM chunks`).first<{ count: number }>()
    const totalFiles = await db.prepare(`SELECT COUNT(DISTINCT file_path) as count FROM chunks`).first<{ count: number }>()
    const byType = await db.prepare(`
      SELECT file_type, COUNT(*) as count, COUNT(DISTINCT file_path) as file_count 
      FROM chunks GROUP BY file_type ORDER BY count DESC
    `).all()
    const byProject = await db.prepare(`
      SELECT project_path, COUNT(*) as chunk_count, COUNT(DISTINCT file_path) as file_count 
      FROM chunks GROUP BY project_path ORDER BY chunk_count DESC LIMIT 20
    `).all()
    const byCategory = await db.prepare(`
      SELECT category, COUNT(*) as count FROM chunks 
      WHERE category != '' GROUP BY category ORDER BY count DESC
    `).all()
    const byStage = await db.prepare(`
      SELECT doc_stage, COUNT(*) as count FROM chunks 
      WHERE doc_stage != '' GROUP BY doc_stage ORDER BY count DESC
    `).all()
    const byOrg = await db.prepare(`
      SELECT org, COUNT(*) as count FROM chunks 
      WHERE org != '' GROUP BY org ORDER BY count DESC LIMIT 10
    `).all()
    const byYear = await db.prepare(`
      SELECT doc_year, COUNT(*) as count FROM chunks 
      WHERE doc_year != '' GROUP BY doc_year ORDER BY doc_year DESC
    `).all()
    const topViewed = await db.prepare(`
      SELECT chunk_id, doc_title, file_type, project_path, view_count, category
      FROM chunks ORDER BY view_count DESC LIMIT 10
    `).all()
    const lastIndexed = await db.prepare(`SELECT MAX(indexed_at) as last FROM chunks`).first<{ last: string }>()

    return c.json({
      total_chunks: totalChunks?.count || 0,
      total_files: totalFiles?.count || 0,
      by_type: byType.results,
      by_project: byProject.results,
      by_category: byCategory.results,
      by_stage: byStage.results,
      by_org: byOrg.results,
      by_year: byYear.results,
      top_viewed: topViewed.results,
      last_indexed: lastIndexed?.last || null
    })
  } catch (e: any) {
    return c.json({
      total_chunks: 0, total_files: 0,
      by_type: [], by_project: [], by_category: [], by_stage: [],
      by_org: [], by_year: [], top_viewed: [],
      last_indexed: null, error: e.message
    })
  }
})

// =============================================
// GET /api/tags - Tag Cloud
// =============================================
apiRoutes.get('/tags', async (c) => {
  const db = c.env.DB
  try {
    const results = await db.prepare(`SELECT tags FROM chunks WHERE tags != '[]' AND tags != ''`).all()
    const tagCount: Record<string, number> = {}
    for (const row of results.results) {
      try {
        const tags = JSON.parse(row.tags as string)
        if (Array.isArray(tags)) {
          tags.forEach((t: string) => { tagCount[t] = (tagCount[t] || 0) + 1 })
        }
      } catch {}
    }
    const sorted = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
    return c.json({ tags: sorted })
  } catch (e: any) {
    return c.json({ tags: [], error: e.message })
  }
})

// =============================================
// GET /api/categories - Category List
// =============================================
apiRoutes.get('/categories', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare(`
      SELECT category, sub_category, COUNT(*) as count, COUNT(DISTINCT file_path) as file_count
      FROM chunks WHERE category != ''
      GROUP BY category, sub_category ORDER BY count DESC
    `).all()
    return c.json({ categories: result.results })
  } catch (e: any) {
    return c.json({ categories: [] })
  }
})

// =============================================
// GET /api/projects - Project List
// =============================================
apiRoutes.get('/projects', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare(`
      SELECT DISTINCT project_path, COUNT(*) as chunk_count, COUNT(DISTINCT file_path) as file_count,
        MIN(doc_year) as start_year, MAX(doc_year) as end_year
      FROM chunks GROUP BY project_path ORDER BY project_path
    `).all()
    return c.json({ projects: result.results })
  } catch (e: any) {
    return c.json({ projects: [] })
  }
})

// =============================================
// GET /api/filetypes - File Type List
// =============================================
apiRoutes.get('/filetypes', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare(`
      SELECT DISTINCT file_type, COUNT(*) as count
      FROM chunks GROUP BY file_type ORDER BY count DESC
    `).all()
    return c.json({ filetypes: result.results })
  } catch (e: any) {
    return c.json({ filetypes: [] })
  }
})

// =============================================
// GET /api/orgs - Organization List
// =============================================
apiRoutes.get('/orgs', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare(`
      SELECT org, COUNT(*) as count, COUNT(DISTINCT project_path) as project_count
      FROM chunks WHERE org != '' GROUP BY org ORDER BY count DESC
    `).all()
    return c.json({ orgs: result.results })
  } catch (e: any) {
    return c.json({ orgs: [] })
  }
})

// =============================================
// GET /api/trending - Trending/Popular Content
// =============================================
apiRoutes.get('/trending', async (c) => {
  const db = c.env.DB
  try {
    const popular = await db.prepare(`
      SELECT chunk_id, doc_title, file_type, file_path, project_path, 
        category, tags, view_count, location_detail
      FROM chunks ORDER BY view_count DESC LIMIT 10
    `).all()

    const recentlyIndexed = await db.prepare(`
      SELECT chunk_id, doc_title, file_type, file_path, project_path,
        category, tags, indexed_at, location_detail
      FROM chunks ORDER BY indexed_at DESC LIMIT 10
    `).all()

    return c.json({
      popular: popular.results,
      recently_indexed: recentlyIndexed.results
    })
  } catch (e: any) {
    return c.json({ popular: [], recently_indexed: [], error: e.message })
  }
})

// =============================================
// POST /api/chunks - Bulk Upload (Enhanced with metadata)
// =============================================
apiRoutes.post('/chunks', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{ chunks: any[] }>()

  if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return c.json({ error: 'No chunks provided' }, 400)
  }

  let inserted = 0
  let errors: string[] = []

  const batchSize = 50
  for (let i = 0; i < body.chunks.length; i += batchSize) {
    const batch = body.chunks.slice(i, i + batchSize)
    const statements = batch.map(chunk => {
      return db.prepare(`
        INSERT OR REPLACE INTO chunks 
        (chunk_id, file_path, file_type, project_path, doc_title, 
         location_type, location_value, location_detail, text, mtime, hash,
         tags, category, sub_category, author, org, doc_stage, doc_year,
         summary, importance, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        chunk.chunk_id,
        chunk.file_path,
        chunk.file_type,
        chunk.project_path || '',
        chunk.doc_title || '',
        chunk.location_type || '',
        chunk.location_value || '',
        chunk.location_detail || '',
        chunk.text || '',
        chunk.mtime || '',
        chunk.hash || '',
        JSON.stringify(chunk.tags || []),
        chunk.category || '',
        chunk.sub_category || '',
        chunk.author || '',
        chunk.org || '',
        chunk.doc_stage || '',
        chunk.doc_year || '',
        chunk.summary || '',
        chunk.importance || 50
      )
    })

    try {
      await db.batch(statements)
      inserted += batch.length
    } catch (e: any) {
      errors.push(`Batch ${i}-${i + batch.length}: ${e.message}`)
    }
  }

  return c.json({ inserted, errors, total_sent: body.chunks.length })
})

// =============================================
// DELETE /api/chunks - Clear all
// =============================================
apiRoutes.delete('/chunks', async (c) => {
  const db = c.env.DB
  try {
    await db.prepare(`DELETE FROM chunks`).run()
    return c.json({ message: 'All chunks deleted' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// =============================================
// POST /api/seed - Enhanced Demo Data
// =============================================
apiRoutes.post('/seed', async (c) => {
  const db = c.env.DB
  const demoChunks = getDemoData()

  const batchSize = 20
  let inserted = 0
  for (let i = 0; i < demoChunks.length; i += batchSize) {
    const batch = demoChunks.slice(i, i + batchSize)
    const statements = batch.map(chunk => {
      return db.prepare(`
        INSERT OR REPLACE INTO chunks 
        (chunk_id, file_path, file_type, project_path, doc_title, 
         location_type, location_value, location_detail, text, mtime, hash,
         tags, category, sub_category, author, org, doc_stage, doc_year,
         summary, importance, view_count, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        chunk.chunk_id, chunk.file_path, chunk.file_type, chunk.project_path,
        chunk.doc_title, chunk.location_type, chunk.location_value, chunk.location_detail,
        chunk.text, chunk.mtime, chunk.hash,
        JSON.stringify(chunk.tags), chunk.category, chunk.sub_category,
        chunk.author, chunk.org, chunk.doc_stage, chunk.doc_year,
        chunk.summary, chunk.importance, chunk.view_count || 0
      )
    })
    try {
      await db.batch(statements)
      inserted += batch.length
    } catch (e: any) {
      console.error('Seed batch error:', e.message)
    }
  }

  return c.json({ message: `Seeded ${inserted} demo chunks with rich metadata` })
})


// =============================================
// Demo Data - Rich Metadata
// =============================================
function getDemoData() {
  return [
    // === 국가중점데이터 사업 - PPT ===
    {
      chunk_id: 'demo-ppt-001-s01', file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx', project_path: '국가중점데이터', doc_title: '최종보고서_v3.2',
      location_type: 'slide', location_value: '1', location_detail: 'Slide 1',
      text: '제5차 국가중점데이터 개방 확대 및 활용 촉진 전략 수립 최종보고서. 수행기관: ○○컨설팅. 발주처: 한국지능정보사회진흥원(NIA). 2025년 12월.',
      mtime: '2025-12-15T10:30:00', hash: 'demo_hash_001_s01',
      tags: ['국가중점데이터', '데이터개방', 'NIA', '전략수립'], category: '데이터',
      sub_category: '데이터 개방', author: '○○컨설팅', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '최종보고', doc_year: '2025', summary: '국가중점데이터 개방 확대 전략의 최종보고서 표지',
      importance: 90, view_count: 45
    },
    {
      chunk_id: 'demo-ppt-001-s05', file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx', project_path: '국가중점데이터', doc_title: '최종보고서_v3.2',
      location_type: 'slide', location_value: '5', location_detail: 'Slide 5',
      text: '현황분석 프레임워크. As-Is 분석 대상: 공공데이터포털, 데이터스토어, 공공데이터 활용지원센터. 분석 관점: 데이터 거버넌스, 품질관리체계, 유통플랫폼 현황, 기관별 데이터 관리 성숙도.',
      mtime: '2025-12-15T10:30:00', hash: 'demo_hash_001_s05',
      tags: ['현황분석', '데이터 거버넌스', '품질관리', '공공데이터포털', '성숙도'],
      category: '데이터', sub_category: '거버넌스', author: '○○컨설팅',
      org: 'NIA(한국지능정보사회진흥원)', doc_stage: '최종보고', doc_year: '2025',
      summary: 'As-Is 현황분석 프레임워크 - 데이터 거버넌스, 품질관리, 유통플랫폼 분석 구조',
      importance: 85, view_count: 38
    },
    {
      chunk_id: 'demo-ppt-001-s12', file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx', project_path: '국가중점데이터', doc_title: '최종보고서_v3.2',
      location_type: 'slide', location_value: '12', location_detail: 'Slide 12',
      text: '기관별 데이터 인프라 현황 분석. 국토교통부: 국가공간정보포털 운영, 부동산 실거래가 데이터 개방. 보건복지부: 건강보험공단 빅데이터 연계, 의료데이터 표준화 추진. 환경부: 대기오염 실시간 데이터, 수질측정 네트워크 현황.',
      mtime: '2025-12-15T10:30:00', hash: 'demo_hash_001_s12',
      tags: ['인프라현황', '국토교통부', '보건복지부', '환경부', '빅데이터'],
      category: '인프라', sub_category: '데이터 인프라', author: '○○컨설팅',
      org: 'NIA(한국지능정보사회진흥원)', doc_stage: '최종보고', doc_year: '2025',
      summary: '국토교통부/보건복지부/환경부의 데이터 인프라 현황 비교 분석',
      importance: 80, view_count: 52
    },
    {
      chunk_id: 'demo-ppt-001-s18', file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx', project_path: '국가중점데이터', doc_title: '최종보고서_v3.2',
      location_type: 'slide', location_value: '18', location_detail: 'Slide 18',
      text: 'To-Be 목표모델 개념도. 통합 데이터 거버넌스 체계 구축. 단계: 1단계 데이터 표준화(2026), 2단계 플랫폼 고도화(2027), 3단계 AI 기반 자동화(2028). 핵심 KPI: 데이터 개방률 85% 달성, 활용건수 전년 대비 30% 증가.',
      mtime: '2025-12-15T10:30:00', hash: 'demo_hash_001_s18',
      tags: ['목표모델', '거버넌스', 'KPI', '로드맵', 'AI자동화'],
      category: '전략', sub_category: '목표모델', author: '○○컨설팅',
      org: 'NIA(한국지능정보사회진흥원)', doc_stage: '최종보고', doc_year: '2025',
      summary: '3단계 To-Be 목표모델 - 표준화→고도화→AI자동화, KPI 포함',
      importance: 95, view_count: 67
    },
    {
      chunk_id: 'demo-ppt-001-s25', file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx', project_path: '국가중점데이터', doc_title: '최종보고서_v3.2',
      location_type: 'slide', location_value: '25', location_detail: 'Slide 25',
      text: '이행과제 추진 로드맵. 1차년도(2026): 데이터 품질관리 체계 고도화, 메타데이터 표준 적용. 2차년도(2027): 데이터 유통 플랫폼 통합, API 게이트웨이 구축. 3차년도(2028): AI 기반 데이터 자동분류, 실시간 품질 모니터링.',
      mtime: '2025-12-15T10:30:00', hash: 'demo_hash_001_s25',
      tags: ['이행과제', '로드맵', '품질관리', '메타데이터', 'API게이트웨이'],
      category: '전략', sub_category: '이행계획', author: '○○컨설팅',
      org: 'NIA(한국지능정보사회진흥원)', doc_stage: '최종보고', doc_year: '2025',
      summary: '3개년 이행과제 로드맵 - 품질관리→플랫폼통합→AI자동분류',
      importance: 88, view_count: 41
    },

    // === 국가중점데이터 - PDF ===
    {
      chunk_id: 'demo-pdf-002-p03', file_path: '국가중점데이터/01. 제안요청서/RFP_국가중점데이터_2025.pdf',
      file_type: 'pdf', project_path: '국가중점데이터', doc_title: 'RFP_국가중점데이터_2025',
      location_type: 'page', location_value: '3', location_detail: 'Page 3',
      text: '사업 개요. 사업명: 제5차 국가중점데이터 개방 확대 및 활용 촉진. 사업기간: 2025.06 ~ 2025.12 (7개월). 사업예산: 5억원(부가세 포함). 발주기관: 한국지능정보사회진흥원(NIA). 수행범위: 현황분석, 중점데이터 선정, 개방전략 수립, 이행계획.',
      mtime: '2025-05-20T09:00:00', hash: 'demo_hash_002_p03',
      tags: ['RFP', '사업개요', '예산', 'NIA'], category: '사업관리',
      sub_category: '제안요청', author: 'NIA', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: 'RFP', doc_year: '2025',
      summary: '국가중점데이터 사업 RFP - 7개월/5억원, 현황분석~이행계획',
      importance: 75, view_count: 33
    },
    {
      chunk_id: 'demo-pdf-002-p15', file_path: '국가중점데이터/01. 제안요청서/RFP_국가중점데이터_2025.pdf',
      file_type: 'pdf', project_path: '국가중점데이터', doc_title: 'RFP_국가중점데이터_2025',
      location_type: 'page', location_value: '15', location_detail: 'Page 15',
      text: '평가기준. 기술평가(80점): 사업이해도(15), 수행방법론(25), 기술역량(20), 프로젝트관리(10), 유사수행실적(10). 가격평가(20점). 총 100점 만점. 협상적격자: 기술평가 75점 이상.',
      mtime: '2025-05-20T09:00:00', hash: 'demo_hash_002_p15',
      tags: ['평가기준', '기술평가', '배점', '방법론'], category: '사업관리',
      sub_category: '평가', author: 'NIA', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: 'RFP', doc_year: '2025',
      summary: '입찰평가 배점표 - 기술80점+가격20점, 협상적격 75점이상',
      importance: 70, view_count: 28
    },

    // === 국가중점데이터 - XLSX ===
    {
      chunk_id: 'demo-xlsx-003-s1-r5', file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx', project_path: '국가중점데이터', doc_title: '기관별_데이터현황',
      location_type: 'sheet', location_value: '기관목록', location_detail: 'Sheet:기관목록 Row:5',
      text: '국토교통부 | 국가공간정보포털 | 부동산 실거래가 | 개방완료 | 월1회 갱신 | API+파일 | 연간 2,500만건 활용',
      mtime: '2025-09-10T14:20:00', hash: 'demo_hash_003_s1_r5',
      tags: ['국토교통부', '공간정보', '부동산', 'API'], category: '데이터',
      sub_category: '기관 데이터', author: '○○컨설팅', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '국토교통부 데이터 현황 - 공간정보포털, 실거래가 개방',
      importance: 65, view_count: 22
    },
    {
      chunk_id: 'demo-xlsx-003-s1-r6', file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx', project_path: '국가중점데이터', doc_title: '기관별_데이터현황',
      location_type: 'sheet', location_value: '기관목록', location_detail: 'Sheet:기관목록 Row:6',
      text: '보건복지부 | 건강보험공단 | 진료비 청구자료 | 부분개방 | 분기갱신 | 분석용파일 | 비식별처리 필요',
      mtime: '2025-09-10T14:20:00', hash: 'demo_hash_003_s1_r6',
      tags: ['보건복지부', '건강보험', '비식별', '의료데이터'], category: '데이터',
      sub_category: '기관 데이터', author: '○○컨설팅', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '보건복지부 데이터 현황 - 진료비 자료, 비식별처리 필요',
      importance: 65, view_count: 30
    },
    {
      chunk_id: 'demo-xlsx-003-s1-r7', file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx', project_path: '국가중점데이터', doc_title: '기관별_데이터현황',
      location_type: 'sheet', location_value: '기관목록', location_detail: 'Sheet:기관목록 Row:7',
      text: '환경부 | 대기오염측정망 | 실시간 대기질 | 개방완료 | 실시간 | API | 연간 8,000만건 활용',
      mtime: '2025-09-10T14:20:00', hash: 'demo_hash_003_s1_r7',
      tags: ['환경부', '대기오염', '실시간', 'API'], category: '데이터',
      sub_category: '기관 데이터', author: '○○컨설팅', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '환경부 실시간 대기질 데이터 - API 개방완료, 8천만건',
      importance: 60, view_count: 18
    },
    {
      chunk_id: 'demo-xlsx-003-s2-r3', file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx', project_path: '국가중점데이터', doc_title: '기관별_데이터현황',
      location_type: 'sheet', location_value: '인프라현황', location_detail: 'Sheet:인프라현황 Row:3',
      text: '공공데이터포털 | 서버 24대 | 스토리지 500TB | CDN 적용 | 일평균 트래픽 2.3TB | AWS 클라우드 하이브리드',
      mtime: '2025-09-10T14:20:00', hash: 'demo_hash_003_s2_r3',
      tags: ['인프라', '서버', '클라우드', 'AWS', 'CDN'], category: '인프라',
      sub_category: '서버/스토리지', author: '○○컨설팅', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '공공데이터포털 인프라 현황 - 서버24대, 500TB, AWS 하이브리드',
      importance: 60, view_count: 15
    },

    // === 공공데이터 활용 실태조사 - PPT ===
    {
      chunk_id: 'demo-ppt-004-s03', file_path: '공공데이터활용실태조사/03. 보고서/실태조사_최종보고.pptx',
      file_type: 'pptx', project_path: '공공데이터활용실태조사', doc_title: '실태조사_최종보고',
      location_type: 'slide', location_value: '3', location_detail: 'Slide 3',
      text: '조사 개요. 조사목적: 공공데이터 개방 및 활용 수준 진단. 조사기간: 2025.04 ~ 2025.09. 조사대상: 중앙행정기관 43개, 지자체 243개, 공공기관 350개. 조사방법: 온라인 설문 + 현장실사.',
      mtime: '2025-10-01T16:00:00', hash: 'demo_hash_004_s03',
      tags: ['실태조사', '조사개요', '공공데이터', '설문'], category: '데이터',
      sub_category: '실태조사', author: '△△연구원', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '최종보고', doc_year: '2025',
      summary: '공공데이터 활용 실태조사 개요 - 636개 기관 대상, 설문+현장실사',
      importance: 82, view_count: 35
    },
    {
      chunk_id: 'demo-ppt-004-s08', file_path: '공공데이터활용실태조사/03. 보고서/실태조사_최종보고.pptx',
      file_type: 'pptx', project_path: '공공데이터활용실태조사', doc_title: '실태조사_최종보고',
      location_type: 'slide', location_value: '8', location_detail: 'Slide 8',
      text: '데이터 거버넌스 성숙도 분석. 전담조직 보유율: 중앙부처 78%, 지자체 32%, 공공기관 45%. CDO 임명률: 중앙부처 65%, 지자체 12%. 데이터 품질관리 정책 수립률: 55%.',
      mtime: '2025-10-01T16:00:00', hash: 'demo_hash_004_s08',
      tags: ['거버넌스', '성숙도', 'CDO', '품질관리', '전담조직'], category: '거버넌스',
      sub_category: '성숙도 분석', author: '△△연구원', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '최종보고', doc_year: '2025',
      summary: '데이터 거버넌스 성숙도 - CDO 임명률 지자체 12%로 저조',
      importance: 87, view_count: 48
    },
    {
      chunk_id: 'demo-ppt-004-s15', file_path: '공공데이터활용실태조사/03. 보고서/실태조사_최종보고.pptx',
      file_type: 'pptx', project_path: '공공데이터활용실태조사', doc_title: '실태조사_최종보고',
      location_type: 'slide', location_value: '15', location_detail: 'Slide 15',
      text: '보건복지부 사례분석. 건강보험 빅데이터 분석시스템 운영현황. 연간 분석과제 120건, 데이터 결합 45건. 비식별처리 프로세스 표준화 완료. 의료 AI 학습데이터 개방 확대 추진 중.',
      mtime: '2025-10-01T16:00:00', hash: 'demo_hash_004_s15',
      tags: ['보건복지부', '빅데이터', '비식별', '의료AI', '사례분석'], category: 'AI',
      sub_category: '의료 AI', author: '△△연구원', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '최종보고', doc_year: '2025',
      summary: '보건복지부 빅데이터 분석시스템 사례 - 연120건 분석, 의료AI 추진',
      importance: 78, view_count: 42
    },

    // === 공공데이터 활용 실태조사 - CSV ===
    {
      chunk_id: 'demo-csv-005-r10', file_path: '공공데이터활용실태조사/05. 데이터/기관별_성숙도점수.csv',
      file_type: 'csv', project_path: '공공데이터활용실태조사', doc_title: '기관별_성숙도점수',
      location_type: 'row', location_value: '10', location_detail: 'Row 10',
      text: '보건복지부,중앙부처,78.5,82.0,75.3,거버넌스우수,데이터결합활성화',
      mtime: '2025-08-15T11:00:00', hash: 'demo_hash_005_r10',
      tags: ['보건복지부', '성숙도', '거버넌스', '점수'], category: '거버넌스',
      sub_category: '성숙도 평가', author: '△△연구원', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '보건복지부 데이터 성숙도 점수 - 총점 78.5, 거버넌스 우수',
      importance: 55, view_count: 20
    },
    {
      chunk_id: 'demo-csv-005-r11', file_path: '공공데이터활용실태조사/05. 데이터/기관별_성숙도점수.csv',
      file_type: 'csv', project_path: '공공데이터활용실태조사', doc_title: '기관별_성숙도점수',
      location_type: 'row', location_value: '11', location_detail: 'Row 11',
      text: '국토교통부,중앙부처,82.1,88.5,79.8,플랫폼우수,공간정보특화',
      mtime: '2025-08-15T11:00:00', hash: 'demo_hash_005_r11',
      tags: ['국토교통부', '성숙도', '플랫폼', '공간정보'], category: '거버넌스',
      sub_category: '성숙도 평가', author: '△△연구원', org: 'NIA(한국지능정보사회진흥원)',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '국토교통부 데이터 성숙도 - 총점 82.1, 플랫폼 우수',
      importance: 55, view_count: 19
    },

    // === AI 중장기전략 사업 - PPT ===
    {
      chunk_id: 'demo-ppt-006-s02', file_path: 'AI중장기전략/03. 제안서/AI전략_제안서_최종.pptx',
      file_type: 'pptx', project_path: 'AI중장기전략', doc_title: 'AI전략_제안서_최종',
      location_type: 'slide', location_value: '2', location_detail: 'Slide 2',
      text: 'AI 중장기 발전 전략 수립 프로젝트 개요. 발주처: 과학기술정보통신부. 사업기간: 2025.03 ~ 2025.10. 목표: 국가 AI 경쟁력 강화를 위한 3개년 로드맵 수립. 주요과업: AI 생태계 분석, 핵심기술 선정, 인력양성 전략, 산업 활용 방안.',
      mtime: '2025-03-20T13:00:00', hash: 'demo_hash_006_s02',
      tags: ['AI전략', '과기정통부', '로드맵', '인력양성'], category: 'AI',
      sub_category: 'AI 전략', author: '□□컨설팅', org: '과학기술정보통신부',
      doc_stage: '제안서', doc_year: '2025',
      summary: 'AI 중장기 전략 프로젝트 개요 - 과기정통부 발주, 3개년 로드맵',
      importance: 88, view_count: 56
    },
    {
      chunk_id: 'demo-ppt-006-s10', file_path: 'AI중장기전략/03. 제안서/AI전략_제안서_최종.pptx',
      file_type: 'pptx', project_path: 'AI중장기전략', doc_title: 'AI전략_제안서_최종',
      location_type: 'slide', location_value: '10', location_detail: 'Slide 10',
      text: 'AI 핵심기술 분석. 생성형 AI: LLM, 멀티모달, RAG 기술 급성장. 엣지 AI: 온디바이스 추론 확대. 강화학습: 로봇, 자율주행 적용. 설명가능 AI(XAI): 공공/의료 분야 필수. 연합학습: 의료데이터 프라이버시 보호.',
      mtime: '2025-03-20T13:00:00', hash: 'demo_hash_006_s10',
      tags: ['생성형AI', 'LLM', 'RAG', '멀티모달', 'XAI', '연합학습'], category: 'AI',
      sub_category: 'AI 기술', author: '□□컨설팅', org: '과학기술정보통신부',
      doc_stage: '제안서', doc_year: '2025',
      summary: 'AI 핵심기술 5대 영역 - 생성형AI, 엣지AI, 강화학습, XAI, 연합학습',
      importance: 92, view_count: 71
    },
    {
      chunk_id: 'demo-ppt-006-s22', file_path: 'AI중장기전략/04. 산출물/AI_현황분석_보고서.pptx',
      file_type: 'pptx', project_path: 'AI중장기전략', doc_title: 'AI_현황분석_보고서',
      location_type: 'slide', location_value: '22', location_detail: 'Slide 22',
      text: '공공부문 AI 도입 현황. 도입률: 중앙부처 45%, 지자체 18%. 주요 활용 분야: 민원 챗봇(32%), 문서분류(28%), 이상탐지(15%). 장애요인: 데이터 부족(42%), 예산(35%), 인력(23%). 보건복지부: AI 기반 복지사각지대 발굴 시스템 운영.',
      mtime: '2025-07-15T10:00:00', hash: 'demo_hash_006_s22',
      tags: ['AI도입', '챗봇', '문서분류', '이상탐지', '장애요인'], category: 'AI',
      sub_category: 'AI 도입', author: '□□컨설팅', org: '과학기술정보통신부',
      doc_stage: '산출물', doc_year: '2025',
      summary: '공공부문 AI 도입 현황 - 부처45%/지자체18%, 챗봇·문서분류 중심',
      importance: 85, view_count: 63
    },

    // === AI 중장기전략 - PDF ===
    {
      chunk_id: 'demo-pdf-007-p08', file_path: 'AI중장기전략/01. RFP/AI전략수립_제안요청서.pdf',
      file_type: 'pdf', project_path: 'AI중장기전략', doc_title: 'AI전략수립_제안요청서',
      location_type: 'page', location_value: '8', location_detail: 'Page 8',
      text: '수행 요구사항. 국내외 AI 정책 동향 분석. 산업별 AI 도입 현황 조사. AI 핵심기술 트렌드 분석(생성형AI, 멀티모달, 에이전트 AI 포함). 공공분야 AI 적용 전략. 3개년 실행 로드맵 및 소요예산.',
      mtime: '2025-02-10T09:00:00', hash: 'demo_hash_007_p08',
      tags: ['RFP', '요구사항', 'AI정책', '에이전트AI'], category: '사업관리',
      sub_category: '제안요청', author: '과학기술정보통신부', org: '과학기술정보통신부',
      doc_stage: 'RFP', doc_year: '2025',
      summary: 'AI 전략 RFP 수행요구사항 - 정책분석, 기술트렌드, 로드맵',
      importance: 72, view_count: 25
    },

    // === AI 중장기전략 - ipynb ===
    {
      chunk_id: 'demo-ipynb-008-c3', file_path: 'AI중장기전략/06. 분석코드/AI_adoption_analysis.ipynb',
      file_type: 'ipynb', project_path: 'AI중장기전략', doc_title: 'AI_adoption_analysis',
      location_type: 'cell', location_value: '3', location_detail: 'Cell 3 (markdown)',
      text: '## 공공기관 AI 도입률 분석\n\n중앙부처, 지자체, 공공기관별 AI 도입률을 비교 분석한다.\n데이터 출처: 2025 공공부문 AI 활용 실태조사(NIA)',
      mtime: '2025-08-20T15:30:00', hash: 'demo_hash_008_c3',
      tags: ['AI도입률', '분석', 'NIA', '실태조사'], category: 'AI',
      sub_category: 'AI 분석', author: '□□컨설팅', org: '과학기술정보통신부',
      doc_stage: '분석코드', doc_year: '2025',
      summary: 'AI 도입률 비교분석 노트북 - 기관유형별 도입률 분석',
      importance: 58, view_count: 14
    },
    {
      chunk_id: 'demo-ipynb-008-c5', file_path: 'AI중장기전략/06. 분석코드/AI_adoption_analysis.ipynb',
      file_type: 'ipynb', project_path: 'AI중장기전략', doc_title: 'AI_adoption_analysis',
      location_type: 'cell', location_value: '5', location_detail: 'Cell 5 (code)',
      text: "import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv('ai_adoption_survey.csv')\n\n# 기관유형별 AI 도입률\nadoption_by_type = df.groupby('기관유형')['AI도입여부'].mean()\nprint(adoption_by_type)\n\n# 보건복지부 상세 분석\nmohw = df[df['기관명'] == '보건복지부']\nprint(mohw[['시스템명', 'AI적용분야', '도입시기', '예산규모']])",
      mtime: '2025-08-20T15:30:00', hash: 'demo_hash_008_c5',
      tags: ['python', 'pandas', 'matplotlib', 'AI도입'], category: 'AI',
      sub_category: 'AI 분석', author: '□□컨설팅', org: '과학기술정보통신부',
      doc_stage: '분석코드', doc_year: '2025',
      summary: 'AI 도입률 분석 코드 - pandas 기관유형별 도입률, 보건복지부 상세',
      importance: 50, view_count: 12
    },

    // === 디지털플랫폼정부 - PPT ===
    {
      chunk_id: 'demo-ppt-009-s04', file_path: '디지털플랫폼정부/03. 보고서/DPG_ISP_최종보고.pptx',
      file_type: 'pptx', project_path: '디지털플랫폼정부', doc_title: 'DPG_ISP_최종보고',
      location_type: 'slide', location_value: '4', location_detail: 'Slide 4',
      text: '디지털플랫폼정부 ISP 추진 배경. 정부 디지털 전환 가속화. 부처간 데이터 사일로 해소 필요. 국민 맞춤형 서비스 통합 제공. 클라우드 네이티브 전환 추진.',
      mtime: '2025-11-01T09:00:00', hash: 'demo_hash_009_s04',
      tags: ['디지털전환', 'ISP', '클라우드', '데이터사일로'], category: '전략',
      sub_category: 'ISP', author: '◇◇컨설팅', org: '행정안전부',
      doc_stage: '최종보고', doc_year: '2025',
      summary: '디지털플랫폼정부 ISP 배경 - 데이터사일로 해소, 클라우드 전환',
      importance: 83, view_count: 37
    },
    {
      chunk_id: 'demo-ppt-009-s14', file_path: '디지털플랫폼정부/03. 보고서/DPG_ISP_최종보고.pptx',
      file_type: 'pptx', project_path: '디지털플랫폼정부', doc_title: 'DPG_ISP_최종보고',
      location_type: 'slide', location_value: '14', location_detail: 'Slide 14',
      text: '응용시스템 현황분석. 전자정부 시스템 총 1,247개. 노후 시스템(5년 이상): 43%. 클라우드 전환율: 28%. API 표준 적용률: 35%. 보건복지부 사회보장정보시스템: 연계 기관 17개, 일 처리건수 350만건.',
      mtime: '2025-11-01T09:00:00', hash: 'demo_hash_009_s14',
      tags: ['현황분석', '전자정부', '노후시스템', '클라우드', '사회보장정보시스템'],
      category: '인프라', sub_category: '시스템 현황', author: '◇◇컨설팅', org: '행정안전부',
      doc_stage: '최종보고', doc_year: '2025',
      summary: '전자정부 시스템 현황 - 1,247개 중 43% 노후, 클라우드전환 28%',
      importance: 80, view_count: 40
    },

    // === 디지털플랫폼정부 - XLSX ===
    {
      chunk_id: 'demo-xlsx-010-s1-r4', file_path: '디지털플랫폼정부/05. 조사자료/시스템_현황조사.xlsx',
      file_type: 'xlsx', project_path: '디지털플랫폼정부', doc_title: '시스템_현황조사',
      location_type: 'sheet', location_value: '시스템목록', location_detail: 'Sheet:시스템목록 Row:4',
      text: '사회보장정보시스템 | 보건복지부 | 2010 | 온프레미스 | Oracle | 연계기관17개 | 일처리350만건 | 클라우드전환검토중',
      mtime: '2025-10-15T11:30:00', hash: 'demo_hash_010_s1_r4',
      tags: ['사회보장', '보건복지부', 'Oracle', '온프레미스'], category: '인프라',
      sub_category: '시스템 목록', author: '◇◇컨설팅', org: '행정안전부',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '사회보장정보시스템 현황 - 보건복지부, 2010년 구축, 클라우드 전환검토',
      importance: 62, view_count: 25
    },
    {
      chunk_id: 'demo-xlsx-010-s1-r8', file_path: '디지털플랫폼정부/05. 조사자료/시스템_현황조사.xlsx',
      file_type: 'xlsx', project_path: '디지털플랫폼정부', doc_title: '시스템_현황조사',
      location_type: 'sheet', location_value: '시스템목록', location_detail: 'Sheet:시스템목록 Row:8',
      text: '국가공간정보통합체계 | 국토교통부 | 2015 | 하이브리드 | PostgreSQL | 연계기관8개 | GIS데이터 | 고도화필요',
      mtime: '2025-10-15T11:30:00', hash: 'demo_hash_010_s1_r8',
      tags: ['GIS', '국토교통부', 'PostgreSQL', '하이브리드'], category: '인프라',
      sub_category: '시스템 목록', author: '◇◇컨설팅', org: '행정안전부',
      doc_stage: '조사자료', doc_year: '2025',
      summary: '국가공간정보통합체계 - 국토교통부, 하이브리드 구성, 고도화 필요',
      importance: 58, view_count: 17
    },

    // === EA 수립 사업 - PDF ===
    {
      chunk_id: 'demo-pdf-011-p22', file_path: '공공기관EA수립/02. 산출물/EA_현황분석보고서.pdf',
      file_type: 'pdf', project_path: '공공기관EA수립', doc_title: 'EA_현황분석보고서',
      location_type: 'page', location_value: '22', location_detail: 'Page 22',
      text: '데이터 아키텍처 현황. 마스터데이터 관리체계: 미흡. 데이터 표준 적용률: 42%. 메타데이터 관리: 수동. 데이터 카탈로그: 미구축. 데이터 품질관리 도구: 미도입. 개선방향: 데이터 거버넌스 체계 수립, 표준 메타데이터 관리, 마스터데이터 통합.',
      mtime: '2025-04-10T10:00:00', hash: 'demo_hash_011_p22',
      tags: ['EA', '데이터아키텍처', '메타데이터', '마스터데이터', '품질관리'],
      category: '거버넌스', sub_category: 'EA', author: '☆☆컨설팅', org: '한국정보화진흥원',
      doc_stage: '산출물', doc_year: '2025',
      summary: 'EA 데이터 아키텍처 현황 - 표준적용률 42%, 메타데이터 수동관리',
      importance: 73, view_count: 29
    },
    {
      chunk_id: 'demo-pdf-011-p35', file_path: '공공기관EA수립/02. 산출물/EA_현황분석보고서.pdf',
      file_type: 'pdf', project_path: '공공기관EA수립', doc_title: 'EA_현황분석보고서',
      location_type: 'page', location_value: '35', location_detail: 'Page 35',
      text: '인프라 아키텍처 현황. 서버 총 128대(물리 45, 가상 83). 노후서버(5년 이상): 38%. 평균 CPU 사용률: 32%. 스토리지 총 용량: 850TB, 사용률 67%. 네트워크: 10G 백본. 보안장비: 방화벽 4대, IPS 2대, WAF 1대.',
      mtime: '2025-04-10T10:00:00', hash: 'demo_hash_011_p35',
      tags: ['인프라', '서버', '보안', '방화벽', 'IPS'], category: '인프라',
      sub_category: '인프라 아키텍처', author: '☆☆컨설팅', org: '한국정보화진흥원',
      doc_stage: '산출물', doc_year: '2025',
      summary: 'EA 인프라 현황 - 서버128대(38%노후), 스토리지 850TB',
      importance: 68, view_count: 21
    },
  ]
}


// =============================================
// Phase 3: Semantic Search & AI Q&A
// =============================================

// ---------- TF-IDF Lightweight Embedding (no external API needed) ----------

// Korean + English vocabulary for demo embedding (256 terms -> 256-dim vector)
const VOCAB: string[] = [
  // Korean domain terms
  '데이터','거버넌스','인프라','보안','전략','정책','클라우드','서버','네트워크','스토리지',
  '플랫폼','시스템','아키텍처','표준','품질','관리','메타데이터','카탈로그','마스터',
  'API','운영','개발','구축','설계','분석','조사','평가','성숙도','모니터링','자동화',
  '국가','공공','민간','정부','부처','기관','지자체','중앙','행정','디지털',
  '전환','혁신','고도화','통합','연계','개방','활용','촉진','확대','강화',
  'AI','인공지능','머신러닝','딥러닝','생성형','LLM','멀티모달','RAG','챗봇','에이전트',
  'NLP','자연어','강화학습','XAI','연합학습','트랜스포머','파운데이션','모델','추론','학습',
  '빅데이터','데이터셋','오픈데이터','마이데이터','데이터레이크','파이프라인','ETL','수집','가공','정제',
  '보건','복지','의료','건강','보험','진료','비식별','프라이버시','개인정보','동의',
  '국토','교통','부동산','공간정보','GIS','위치','도시','건축','토지','측량',
  '환경','대기','수질','기후','탄소','에너지','재생','폐기물','생태','녹색',
  '교육','연구','대학','학술','논문','기술','과학','산업','제조','농업',
  'ISP','ISMP','EA','ITA','PMO','WBS','RFP','BMT','SLA','KPI',
  '로드맵','비전','목표','과제','이행','단계','추진','일정','예산','투자',
  '제안','착수','중간','최종','보고','산출','결과','검수','납품','완료',
  '프로젝트','사업','계약','발주','수행','컨설팅','용역','위탁','협력','파트너',
  // English terms
  'data','governance','infrastructure','security','strategy','policy','cloud','server','network','storage',
  'platform','system','architecture','standard','quality','management','metadata','catalog','master',
  'operation','development','deployment','design','analysis','survey','evaluation','maturity','monitoring','automation',
  'national','public','private','government','ministry','agency','local','central','administrative','digital',
  'transformation','innovation','advancement','integration','linkage','openness','utilization','promotion','expansion','strengthening',
  'artificial','intelligence','machine','learning','deep','generative','multimodal','chatbot','agent',
  'natural','language','reinforcement','explainable','federated','transformer','foundation','model','inference','training',
  'bigdata','dataset','opendata','mydata','datalake','pipeline','collection','processing','cleansing',
  'health','welfare','medical','insurance','treatment','deidentification','privacy','personal','consent',
  'land','transport','realestate','spatial','location','urban','construction',
  'environment','air','water','climate','carbon','energy','renewable','waste','ecology','green',
  'education','research','university','academic','paper','technology','science','industry','manufacturing','agriculture',
  'roadmap','vision','goal','task','implementation','phase','schedule','budget','investment',
  'proposal','kickoff','interim','final','report','deliverable','result','inspection','delivery','completion',
  'project','contract','procurement','execution','consulting','outsourcing','cooperation','partner'
];

function textToVector(text: string): number[] {
  const lower = text.toLowerCase();
  const vec = new Array(VOCAB.length).fill(0);
  let norm = 0;
  
  for (let i = 0; i < VOCAB.length; i++) {
    const term = VOCAB[i].toLowerCase();
    // Count occurrences
    let count = 0;
    let pos = 0;
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      count++;
      pos += term.length;
    }
    if (count > 0) {
      // TF with sublinear scaling: 1 + log(count)
      vec[i] = 1 + Math.log(count);
      norm += vec[i] * vec[i];
    }
  }
  
  // L2 normalize
  if (norm > 0) {
    const sqrtNorm = Math.sqrt(norm);
    for (let i = 0; i < vec.length; i++) {
      vec[i] = Math.round((vec[i] / sqrtNorm) * 10000) / 10000; // 4 decimal places
    }
  }
  
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// =============================================
// POST /api/embeddings/generate - Generate embeddings for all chunks
// =============================================
apiRoutes.post('/embeddings/generate', async (c) => {
  const db = c.env.DB;
  
  try {
    // Get all chunks without embeddings
    const chunks = await db.prepare(`
      SELECT rowid, chunk_id, text, tags, category, doc_title, project_path
      FROM chunks WHERE embedding = '' OR embedding IS NULL
    `).all();
    
    if (!chunks.results || chunks.results.length === 0) {
      return c.json({ message: 'All chunks already have embeddings', count: 0 });
    }
    
    let updated = 0;
    const batchSize = 10;
    
    for (let i = 0; i < chunks.results.length; i += batchSize) {
      const batch = chunks.results.slice(i, i + batchSize);
      const statements = batch.map(chunk => {
        // Combine text with metadata for richer embedding
        const tags = (() => { try { return JSON.parse(chunk.tags as string || '[]').join(' '); } catch { return ''; } })();
        const combined = `${chunk.doc_title || ''} ${chunk.category || ''} ${tags} ${chunk.project_path || ''} ${chunk.text || ''}`;
        const vec = textToVector(combined);
        
        return db.prepare(`
          UPDATE chunks SET embedding = ?, embed_model = 'tfidf-256' WHERE chunk_id = ?
        `).bind(JSON.stringify(vec), chunk.chunk_id as string);
      });
      
      await db.batch(statements);
      updated += batch.length;
    }
    
    return c.json({ message: `Generated embeddings for ${updated} chunks`, count: updated, model: 'tfidf-256', dimensions: VOCAB.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// =============================================
// GET /api/semantic-search - Vector similarity search
// =============================================
apiRoutes.get('/semantic-search', async (c) => {
  const db = c.env.DB;
  const q = c.req.query('q') || '';
  const type = c.req.query('type') || '';
  const project = c.req.query('project') || '';
  const category = c.req.query('category') || '';
  const limit = parseInt(c.req.query('limit') || '20');
  const threshold = parseFloat(c.req.query('threshold') || '0.1');
  
  if (!q.trim()) {
    return c.json({ results: [], total: 0, query: q, mode: 'semantic' });
  }
  
  try {
    // Generate query vector
    const queryVec = textToVector(q);
    
    // Get all chunks with embeddings + optional filters
    let sql = `SELECT chunk_id, file_path, file_type, project_path, doc_title,
      location_type, location_value, location_detail, 
      substr(text, 1, 300) as snippet, mtime, tags, category, sub_category,
      author, org, doc_stage, doc_year, importance, view_count, summary, embedding
      FROM chunks WHERE embedding != '' AND embedding IS NOT NULL`;
    const params: any[] = [];
    
    if (type) { sql += ` AND file_type = ?`; params.push(type); }
    if (project) { sql += ` AND project_path LIKE ?`; params.push(`%${project}%`); }
    if (category) { sql += ` AND category = ?`; params.push(category); }
    
    const results = await db.prepare(sql).bind(...params).all();
    
    if (!results.results || results.results.length === 0) {
      return c.json({ results: [], total: 0, query: q, mode: 'semantic', hint: 'No embeddings found. Call POST /api/embeddings/generate first.' });
    }
    
    // Calculate cosine similarity for each
    const scored = results.results.map(row => {
      let embedding: number[] = [];
      try { embedding = JSON.parse(row.embedding as string); } catch { return null; }
      
      const similarity = cosineSimilarity(queryVec, embedding);
      const { embedding: _emb, ...rest } = row;
      return { ...rest, similarity: Math.round(similarity * 10000) / 10000 };
    }).filter(r => r !== null && r.similarity >= threshold);
    
    // Sort by similarity descending
    scored.sort((a: any, b: any) => b.similarity - a.similarity);
    
    const topResults = scored.slice(0, limit);
    
    return c.json({
      results: topResults,
      total: scored.length,
      query: q,
      mode: 'semantic',
      model: 'tfidf-256',
      threshold
    });
  } catch (e: any) {
    return c.json({ results: [], total: 0, query: q, mode: 'semantic', error: e.message });
  }
});

// =============================================
// GET /api/similar/:chunk_id - Find similar documents
// =============================================
apiRoutes.get('/similar/:chunk_id', async (c) => {
  const db = c.env.DB;
  const chunkId = c.req.param('chunk_id');
  const limit = parseInt(c.req.query('limit') || '10');
  
  try {
    // Get the source chunk's embedding
    const source = await db.prepare(`SELECT embedding, text FROM chunks WHERE chunk_id = ?`).bind(chunkId).first<{ embedding: string, text: string }>();
    if (!source || !source.embedding) {
      return c.json({ error: 'Chunk not found or no embedding', results: [] }, 404);
    }
    
    const sourceVec: number[] = JSON.parse(source.embedding);
    
    // Get all other chunks with embeddings
    const others = await db.prepare(`
      SELECT chunk_id, file_path, file_type, project_path, doc_title,
        location_detail, category, tags, importance, view_count, summary, embedding,
        substr(text, 1, 200) as snippet
      FROM chunks WHERE chunk_id != ? AND embedding != '' AND embedding IS NOT NULL
    `).bind(chunkId).all();
    
    const scored = others.results.map(row => {
      let embedding: number[] = [];
      try { embedding = JSON.parse(row.embedding as string); } catch { return null; }
      const similarity = cosineSimilarity(sourceVec, embedding);
      const { embedding: _emb, ...rest } = row;
      return { ...rest, similarity: Math.round(similarity * 10000) / 10000 };
    }).filter(r => r !== null && r.similarity > 0.05);
    
    scored.sort((a: any, b: any) => b.similarity - a.similarity);
    
    return c.json({ source_id: chunkId, results: scored.slice(0, limit) });
  } catch (e: any) {
    return c.json({ error: e.message, results: [] }, 500);
  }
});

// =============================================
// POST /api/ask - AI Q&A (RAG pattern)
// =============================================
apiRoutes.post('/ask', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ question: string; mode?: string }>();
  const question = body.question || '';
  
  if (!question.trim()) {
    return c.json({ error: 'Question is required' }, 400);
  }
  
  try {
    // Step 1: Retrieve relevant chunks using BOTH FTS and semantic search
    const queryVec = textToVector(question);
    
    // FTS results
    let ftsResults: any[] = [];
    try {
      const fts = await db.prepare(`
        SELECT c.chunk_id, c.doc_title, c.file_path, c.file_type, c.location_detail,
          c.text, c.tags, c.category, c.project_path, c.summary
        FROM chunks_fts
        JOIN chunks c ON chunks_fts.rowid = c.rowid
        WHERE chunks_fts MATCH ?
        ORDER BY rank LIMIT 5
      `).bind(question).all();
      ftsResults = fts.results || [];
    } catch {}
    
    // Semantic results
    const allChunks = await db.prepare(`
      SELECT chunk_id, doc_title, file_path, file_type, location_detail,
        text, tags, category, project_path, summary, embedding
      FROM chunks WHERE embedding != '' AND embedding IS NOT NULL
    `).all();
    
    const semanticScored = allChunks.results.map(row => {
      let embedding: number[] = [];
      try { embedding = JSON.parse(row.embedding as string); } catch { return null; }
      const similarity = cosineSimilarity(queryVec, embedding);
      return { ...row, similarity };
    }).filter(r => r !== null && r.similarity > 0.1);
    
    semanticScored.sort((a: any, b: any) => b.similarity - a.similarity);
    const topSemantic = semanticScored.slice(0, 5);
    
    // Merge & deduplicate (prefer semantic order)
    const seen = new Set<string>();
    const context: any[] = [];
    
    for (const r of [...topSemantic, ...ftsResults]) {
      if (!seen.has(r.chunk_id as string)) {
        seen.add(r.chunk_id as string);
        context.push(r);
      }
      if (context.length >= 6) break;
    }
    
    // Step 2: Generate answer
    // Build context string
    const contextStr = context.map((c, i) => {
      const tags = (() => { try { return JSON.parse(c.tags as string || '[]').join(', '); } catch { return ''; } })();
      return `[출처${i + 1}] ${c.doc_title} (${c.file_type?.toUpperCase()}, ${c.location_detail})\n분류: ${c.category || '-'} | 프로젝트: ${c.project_path || '-'} | 태그: ${tags}\n내용: ${(c.text as string || '').substring(0, 500)}`;
    }).join('\n\n');
    
    // Check for OpenAI API key
    const apiKey = c.env.OPENAI_API_KEY;
    
    if (apiKey) {
      // Use OpenAI for answer generation
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `당신은 컨설팅 산출물 지식 검색 시스템의 AI 어시스턴트입니다.
주어진 문서 컨텍스트를 기반으로 질문에 답변하세요.
답변 시 반드시 출처([출처N])를 명시하세요.
한국어로 답변하세요. 간결하되 핵심 정보를 빠뜨리지 마세요.
컨텍스트에 없는 내용은 추측하지 말고 "관련 정보가 없습니다"라고 답하세요.`
            },
            {
              role: 'user',
              content: `다음 문서 컨텍스트를 기반으로 질문에 답변하세요.\n\n${contextStr}\n\n질문: ${question}`
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      });
      
      const aiResult = await response.json() as any;
      const answer = aiResult.choices?.[0]?.message?.content || '답변을 생성할 수 없습니다.';
      
      return c.json({
        question,
        answer,
        sources: context.map(c => ({
          chunk_id: c.chunk_id,
          doc_title: c.doc_title,
          file_type: c.file_type,
          file_path: c.file_path,
          location_detail: c.location_detail,
          category: c.category,
          project_path: c.project_path,
          summary: c.summary,
          similarity: c.similarity
        })),
        mode: 'ai',
        model: 'gpt-4o-mini'
      });
    } else {
      // Fallback: Rule-based answer from context
      const summaries = context.map(c => c.summary || (c.text as string || '').substring(0, 150)).filter(Boolean);
      const answer = summaries.length > 0
        ? `관련 문서 ${context.length}건을 찾았습니다.\n\n` + 
          context.map((c, i) => `${i + 1}. **${c.doc_title}** (${(c.file_type as string || '').toUpperCase()}, ${c.location_detail})\n   ${c.summary || (c.text as string || '').substring(0, 150)}`).join('\n\n') +
          '\n\n*AI 답변을 활성화하려면 OpenAI API 키를 설정하세요.*'
        : '관련 문서를 찾을 수 없습니다. 다른 키워드로 질문해 보세요.';
      
      return c.json({
        question,
        answer,
        sources: context.map(c => ({
          chunk_id: c.chunk_id,
          doc_title: c.doc_title,
          file_type: c.file_type,
          file_path: c.file_path,
          location_detail: c.location_detail,
          category: c.category,
          project_path: c.project_path,
          summary: c.summary,
          similarity: c.similarity
        })),
        mode: 'context-only',
        hint: 'Set OPENAI_API_KEY for AI-powered answers'
      });
    }
  } catch (e: any) {
    return c.json({ error: e.message, question }, 500);
  }
});

// =============================================
// GET /api/embedding-stats - Embedding coverage stats
// =============================================
apiRoutes.get('/embedding-stats', async (c) => {
  const db = c.env.DB;
  try {
    const total = await db.prepare(`SELECT COUNT(*) as count FROM chunks`).first<{ count: number }>();
    const withEmbed = await db.prepare(`SELECT COUNT(*) as count FROM chunks WHERE embedding != '' AND embedding IS NOT NULL`).first<{ count: number }>();
    const models = await db.prepare(`SELECT embed_model, COUNT(*) as count FROM chunks WHERE embed_model != '' GROUP BY embed_model`).all();
    
    return c.json({
      total_chunks: total?.count || 0,
      with_embeddings: withEmbed?.count || 0,
      coverage: total?.count ? Math.round((withEmbed?.count || 0) / total.count * 100) : 0,
      models: models.results
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
