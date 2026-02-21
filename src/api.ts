import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

export const apiRoutes = new Hono<{ Bindings: Bindings }>()

// =============================================
// GET /api/search - Full Text Search
// =============================================
apiRoutes.get('/search', async (c) => {
  const db = c.env.DB
  const q = c.req.query('q') || ''
  const path = c.req.query('path') || ''
  const type = c.req.query('type') || ''
  const project = c.req.query('project') || ''
  const sort = c.req.query('sort') || 'relevance' // relevance | mtime
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  if (!q.trim()) {
    return c.json({ results: [], total: 0, page, limit, query: q })
  }

  // Build WHERE clauses
  const conditions: string[] = []
  const params: any[] = []

  // Full-text search on text content
  conditions.push(`chunks_fts MATCH ?`)
  params.push(q)

  let filterConditions: string[] = []
  let filterParams: any[] = []

  if (path) {
    filterConditions.push(`c.file_path LIKE ?`)
    filterParams.push(`%${path}%`)
  }
  if (type) {
    filterConditions.push(`c.file_type = ?`)
    filterParams.push(type)
  }
  if (project) {
    filterConditions.push(`c.project_path LIKE ?`)
    filterParams.push(`%${project}%`)
  }

  // FTS5 query with JOIN for filters
  let sql = `
    SELECT 
      c.chunk_id,
      c.file_path,
      c.file_type,
      c.project_path,
      c.doc_title,
      c.location_type,
      c.location_value,
      c.location_detail,
      snippet(chunks_fts, 0, '<mark>', '</mark>', '...', 40) as snippet,
      c.mtime,
      rank
    FROM chunks_fts
    JOIN chunks c ON chunks_fts.rowid = c.rowid
    WHERE chunks_fts MATCH ?
  `
  const queryParams: any[] = [q]

  if (path) {
    sql += ` AND c.file_path LIKE ?`
    queryParams.push(`%${path}%`)
  }
  if (type) {
    sql += ` AND c.file_type = ?`
    queryParams.push(type)
  }
  if (project) {
    sql += ` AND c.project_path LIKE ?`
    queryParams.push(`%${project}%`)
  }

  if (sort === 'mtime') {
    sql += ` ORDER BY c.mtime DESC`
  } else {
    sql += ` ORDER BY rank`
  }

  sql += ` LIMIT ? OFFSET ?`
  queryParams.push(limit, offset)

  try {
    const results = await db.prepare(sql).bind(...queryParams).all()

    // Count query
    let countSql = `
      SELECT COUNT(*) as total
      FROM chunks_fts
      JOIN chunks c ON chunks_fts.rowid = c.rowid
      WHERE chunks_fts MATCH ?
    `
    const countParams: any[] = [q]
    if (path) {
      countSql += ` AND c.file_path LIKE ?`
      countParams.push(`%${path}%`)
    }
    if (type) {
      countSql += ` AND c.file_type = ?`
      countParams.push(type)
    }
    if (project) {
      countSql += ` AND c.project_path LIKE ?`
      countParams.push(`%${project}%`)
    }

    const countResult = await db.prepare(countSql).bind(...countParams).first<{ total: number }>()

    return c.json({
      results: results.results,
      total: countResult?.total || 0,
      page,
      limit,
      query: q
    })
  } catch (e: any) {
    // If FTS table doesn't exist yet, return empty
    return c.json({ results: [], total: 0, page, limit, query: q, error: e.message })
  }
})

// =============================================
// GET /api/doc/:chunk_id - Document Detail
// =============================================
apiRoutes.get('/doc/:chunk_id', async (c) => {
  const db = c.env.DB
  const chunkId = c.req.param('chunk_id')

  try {
    const result = await db.prepare(`
      SELECT * FROM chunks WHERE chunk_id = ?
    `).bind(chunkId).first()

    if (!result) {
      return c.json({ error: 'Chunk not found' }, 404)
    }

    return c.json(result)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// =============================================
// GET /api/stats - Index Statistics
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
    const lastIndexed = await db.prepare(`SELECT MAX(indexed_at) as last FROM chunks`).first<{ last: string }>()

    return c.json({
      total_chunks: totalChunks?.count || 0,
      total_files: totalFiles?.count || 0,
      by_type: byType.results,
      by_project: byProject.results,
      last_indexed: lastIndexed?.last || null
    })
  } catch (e: any) {
    return c.json({
      total_chunks: 0,
      total_files: 0,
      by_type: [],
      by_project: [],
      last_indexed: null,
      error: e.message
    })
  }
})

// =============================================
// GET /api/projects - Project List (for filters)
// =============================================
apiRoutes.get('/projects', async (c) => {
  const db = c.env.DB

  try {
    const result = await db.prepare(`
      SELECT DISTINCT project_path, COUNT(*) as chunk_count, COUNT(DISTINCT file_path) as file_count
      FROM chunks
      GROUP BY project_path
      ORDER BY project_path
    `).all()

    return c.json({ projects: result.results })
  } catch (e: any) {
    return c.json({ projects: [] })
  }
})

// =============================================
// GET /api/filetypes - File Type List (for filters)
// =============================================
apiRoutes.get('/filetypes', async (c) => {
  const db = c.env.DB

  try {
    const result = await db.prepare(`
      SELECT DISTINCT file_type, COUNT(*) as count
      FROM chunks
      GROUP BY file_type
      ORDER BY count DESC
    `).all()

    return c.json({ filetypes: result.results })
  } catch (e: any) {
    return c.json({ filetypes: [] })
  }
})

// =============================================
// POST /api/chunks - Bulk Upload Chunks (from local indexer)
// =============================================
apiRoutes.post('/chunks', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{ chunks: any[] }>()

  if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return c.json({ error: 'No chunks provided' }, 400)
  }

  let inserted = 0
  let errors: string[] = []

  // Process in batches
  const batchSize = 50
  for (let i = 0; i < body.chunks.length; i += batchSize) {
    const batch = body.chunks.slice(i, i + batchSize)
    const statements = batch.map(chunk => {
      return db.prepare(`
        INSERT OR REPLACE INTO chunks 
        (chunk_id, file_path, file_type, project_path, doc_title, 
         location_type, location_value, location_detail, text, mtime, hash, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
        chunk.hash || ''
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
// DELETE /api/chunks - Clear all chunks
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
// POST /api/seed - Seed Demo Data
// =============================================
apiRoutes.post('/seed', async (c) => {
  const db = c.env.DB

  const demoChunks = getDemoData()

  const statements = demoChunks.map(chunk => {
    return db.prepare(`
      INSERT OR REPLACE INTO chunks 
      (chunk_id, file_path, file_type, project_path, doc_title, 
       location_type, location_value, location_detail, text, mtime, hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      chunk.chunk_id,
      chunk.file_path,
      chunk.file_type,
      chunk.project_path,
      chunk.doc_title,
      chunk.location_type,
      chunk.location_value,
      chunk.location_detail,
      chunk.text,
      chunk.mtime,
      chunk.hash
    )
  })

  try {
    await db.batch(statements)
    return c.json({ message: `Seeded ${demoChunks.length} demo chunks` })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// =============================================
// Demo Data
// =============================================
function getDemoData() {
  return [
    // === 국가중점데이터 사업 - PPT ===
    {
      chunk_id: 'demo-ppt-001-s01',
      file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx',
      project_path: '국가중점데이터',
      doc_title: '최종보고서_v3.2',
      location_type: 'slide',
      location_value: '1',
      location_detail: 'Slide 1',
      text: '제5차 국가중점데이터 개방 확대 및 활용 촉진 전략 수립 최종보고서. 수행기관: ○○컨설팅. 발주처: 한국지능정보사회진흥원(NIA). 2025년 12월.',
      mtime: '2025-12-15T10:30:00',
      hash: 'demo_hash_001_s01'
    },
    {
      chunk_id: 'demo-ppt-001-s05',
      file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx',
      project_path: '국가중점데이터',
      doc_title: '최종보고서_v3.2',
      location_type: 'slide',
      location_value: '5',
      location_detail: 'Slide 5',
      text: '현황분석 프레임워크. As-Is 분석 대상: 공공데이터포털, 데이터스토어, 공공데이터 활용지원센터. 분석 관점: 데이터 거버넌스, 품질관리체계, 유통플랫폼 현황, 기관별 데이터 관리 성숙도.',
      mtime: '2025-12-15T10:30:00',
      hash: 'demo_hash_001_s05'
    },
    {
      chunk_id: 'demo-ppt-001-s12',
      file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx',
      project_path: '국가중점데이터',
      doc_title: '최종보고서_v3.2',
      location_type: 'slide',
      location_value: '12',
      location_detail: 'Slide 12',
      text: '기관별 데이터 인프라 현황 분석. 국토교통부: 국가공간정보포털 운영, 부동산 실거래가 데이터 개방. 보건복지부: 건강보험공단 빅데이터 연계, 의료데이터 표준화 추진. 환경부: 대기오염 실시간 데이터, 수질측정 네트워크 현황.',
      mtime: '2025-12-15T10:30:00',
      hash: 'demo_hash_001_s12'
    },
    {
      chunk_id: 'demo-ppt-001-s18',
      file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx',
      project_path: '국가중점데이터',
      doc_title: '최종보고서_v3.2',
      location_type: 'slide',
      location_value: '18',
      location_detail: 'Slide 18',
      text: 'To-Be 목표모델 개념도. 통합 데이터 거버넌스 체계 구축. 단계: 1단계 데이터 표준화(2026), 2단계 플랫폼 고도화(2027), 3단계 AI 기반 자동화(2028). 핵심 KPI: 데이터 개방률 85% 달성, 활용건수 전년 대비 30% 증가.',
      mtime: '2025-12-15T10:30:00',
      hash: 'demo_hash_001_s18'
    },
    {
      chunk_id: 'demo-ppt-001-s25',
      file_path: '국가중점데이터/03. 제안서/최종보고서_v3.2.pptx',
      file_type: 'pptx',
      project_path: '국가중점데이터',
      doc_title: '최종보고서_v3.2',
      location_type: 'slide',
      location_value: '25',
      location_detail: 'Slide 25',
      text: '이행과제 추진 로드맵. 1차년도(2026): 데이터 품질관리 체계 고도화, 메타데이터 표준 적용. 2차년도(2027): 데이터 유통 플랫폼 통합, API 게이트웨이 구축. 3차년도(2028): AI 기반 데이터 자동분류, 실시간 품질 모니터링.',
      mtime: '2025-12-15T10:30:00',
      hash: 'demo_hash_001_s25'
    },

    // === 국가중점데이터 - PDF ===
    {
      chunk_id: 'demo-pdf-002-p03',
      file_path: '국가중점데이터/01. 제안요청서/RFP_국가중점데이터_2025.pdf',
      file_type: 'pdf',
      project_path: '국가중점데이터',
      doc_title: 'RFP_국가중점데이터_2025',
      location_type: 'page',
      location_value: '3',
      location_detail: 'Page 3',
      text: '사업 개요. 사업명: 제5차 국가중점데이터 개방 확대 및 활용 촉진. 사업기간: 2025.06 ~ 2025.12 (7개월). 사업예산: 5억원(부가세 포함). 발주기관: 한국지능정보사회진흥원(NIA). 수행범위: 현황분석, 중점데이터 선정, 개방전략 수립, 이행계획.',
      mtime: '2025-05-20T09:00:00',
      hash: 'demo_hash_002_p03'
    },
    {
      chunk_id: 'demo-pdf-002-p15',
      file_path: '국가중점데이터/01. 제안요청서/RFP_국가중점데이터_2025.pdf',
      file_type: 'pdf',
      project_path: '국가중점데이터',
      doc_title: 'RFP_국가중점데이터_2025',
      location_type: 'page',
      location_value: '15',
      location_detail: 'Page 15',
      text: '평가기준. 기술평가(80점): 사업이해도(15), 수행방법론(25), 기술역량(20), 프로젝트관리(10), 유사수행실적(10). 가격평가(20점). 총 100점 만점. 협상적격자: 기술평가 75점 이상.',
      mtime: '2025-05-20T09:00:00',
      hash: 'demo_hash_002_p15'
    },

    // === 국가중점데이터 - XLSX (기관목록) ===
    {
      chunk_id: 'demo-xlsx-003-s1-r5',
      file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx',
      project_path: '국가중점데이터',
      doc_title: '기관별_데이터현황',
      location_type: 'sheet',
      location_value: '기관목록',
      location_detail: 'Sheet:기관목록 Row:5',
      text: '국토교통부 | 국가공간정보포털 | 부동산 실거래가 | 개방완료 | 월1회 갱신 | API+파일 | 연간 2,500만건 활용',
      mtime: '2025-09-10T14:20:00',
      hash: 'demo_hash_003_s1_r5'
    },
    {
      chunk_id: 'demo-xlsx-003-s1-r6',
      file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx',
      project_path: '국가중점데이터',
      doc_title: '기관별_데이터현황',
      location_type: 'sheet',
      location_value: '기관목록',
      location_detail: 'Sheet:기관목록 Row:6',
      text: '보건복지부 | 건강보험공단 | 진료비 청구자료 | 부분개방 | 분기갱신 | 분석용파일 | 비식별처리 필요',
      mtime: '2025-09-10T14:20:00',
      hash: 'demo_hash_003_s1_r6'
    },
    {
      chunk_id: 'demo-xlsx-003-s1-r7',
      file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx',
      project_path: '국가중점데이터',
      doc_title: '기관별_데이터현황',
      location_type: 'sheet',
      location_value: '기관목록',
      location_detail: 'Sheet:기관목록 Row:7',
      text: '환경부 | 대기오염측정망 | 실시간 대기질 | 개방완료 | 실시간 | API | 연간 8,000만건 활용',
      mtime: '2025-09-10T14:20:00',
      hash: 'demo_hash_003_s1_r7'
    },
    {
      chunk_id: 'demo-xlsx-003-s2-r3',
      file_path: '국가중점데이터/05. 조사자료/기관별_데이터현황.xlsx',
      file_type: 'xlsx',
      project_path: '국가중점데이터',
      doc_title: '기관별_데이터현황',
      location_type: 'sheet',
      location_value: '인프라현황',
      location_detail: 'Sheet:인프라현황 Row:3',
      text: '공공데이터포털 | 서버 24대 | 스토리지 500TB | CDN 적용 | 일평균 트래픽 2.3TB | AWS 클라우드 하이브리드',
      mtime: '2025-09-10T14:20:00',
      hash: 'demo_hash_003_s2_r3'
    },

    // === 공공데이터 활용 실태조사 사업 - PPT ===
    {
      chunk_id: 'demo-ppt-004-s03',
      file_path: '공공데이터활용실태조사/03. 보고서/실태조사_최종보고.pptx',
      file_type: 'pptx',
      project_path: '공공데이터활용실태조사',
      doc_title: '실태조사_최종보고',
      location_type: 'slide',
      location_value: '3',
      location_detail: 'Slide 3',
      text: '조사 개요. 조사목적: 공공데이터 개방 및 활용 수준 진단. 조사기간: 2025.04 ~ 2025.09. 조사대상: 중앙행정기관 43개, 지자체 243개, 공공기관 350개. 조사방법: 온라인 설문 + 현장실사.',
      mtime: '2025-10-01T16:00:00',
      hash: 'demo_hash_004_s03'
    },
    {
      chunk_id: 'demo-ppt-004-s08',
      file_path: '공공데이터활용실태조사/03. 보고서/실태조사_최종보고.pptx',
      file_type: 'pptx',
      project_path: '공공데이터활용실태조사',
      doc_title: '실태조사_최종보고',
      location_type: 'slide',
      location_value: '8',
      location_detail: 'Slide 8',
      text: '데이터 거버넌스 성숙도 분석. 전담조직 보유율: 중앙부처 78%, 지자체 32%, 공공기관 45%. CDO 임명률: 중앙부처 65%, 지자체 12%. 데이터 품질관리 정책 수립률: 55%.',
      mtime: '2025-10-01T16:00:00',
      hash: 'demo_hash_004_s08'
    },
    {
      chunk_id: 'demo-ppt-004-s15',
      file_path: '공공데이터활용실태조사/03. 보고서/실태조사_최종보고.pptx',
      file_type: 'pptx',
      project_path: '공공데이터활용실태조사',
      doc_title: '실태조사_최종보고',
      location_type: 'slide',
      location_value: '15',
      location_detail: 'Slide 15',
      text: '보건복지부 사례분석. 건강보험 빅데이터 분석시스템 운영현황. 연간 분석과제 120건, 데이터 결합 45건. 비식별처리 프로세스 표준화 완료. 의료 AI 학습데이터 개방 확대 추진 중.',
      mtime: '2025-10-01T16:00:00',
      hash: 'demo_hash_004_s15'
    },

    // === 공공데이터 활용 실태조사 - CSV ===
    {
      chunk_id: 'demo-csv-005-r10',
      file_path: '공공데이터활용실태조사/05. 데이터/기관별_성숙도점수.csv',
      file_type: 'csv',
      project_path: '공공데이터활용실태조사',
      doc_title: '기관별_성숙도점수',
      location_type: 'row',
      location_value: '10',
      location_detail: 'Row 10',
      text: '보건복지부,중앙부처,78.5,82.0,75.3,거버넌스우수,데이터결합활성화',
      mtime: '2025-08-15T11:00:00',
      hash: 'demo_hash_005_r10'
    },
    {
      chunk_id: 'demo-csv-005-r11',
      file_path: '공공데이터활용실태조사/05. 데이터/기관별_성숙도점수.csv',
      file_type: 'csv',
      project_path: '공공데이터활용실태조사',
      doc_title: '기관별_성숙도점수',
      location_type: 'row',
      location_value: '11',
      location_detail: 'Row 11',
      text: '국토교통부,중앙부처,82.1,88.5,79.8,플랫폼우수,공간정보특화',
      mtime: '2025-08-15T11:00:00',
      hash: 'demo_hash_005_r11'
    },

    // === AI 중장기전략 사업 - PPT ===
    {
      chunk_id: 'demo-ppt-006-s02',
      file_path: 'AI중장기전략/03. 제안서/AI전략_제안서_최종.pptx',
      file_type: 'pptx',
      project_path: 'AI중장기전략',
      doc_title: 'AI전략_제안서_최종',
      location_type: 'slide',
      location_value: '2',
      location_detail: 'Slide 2',
      text: 'AI 중장기 발전 전략 수립 프로젝트 개요. 발주처: 과학기술정보통신부. 사업기간: 2025.03 ~ 2025.10. 목표: 국가 AI 경쟁력 강화를 위한 3개년 로드맵 수립. 주요과업: AI 생태계 분석, 핵심기술 선정, 인력양성 전략, 산업 활용 방안.',
      mtime: '2025-03-20T13:00:00',
      hash: 'demo_hash_006_s02'
    },
    {
      chunk_id: 'demo-ppt-006-s10',
      file_path: 'AI중장기전략/03. 제안서/AI전략_제안서_최종.pptx',
      file_type: 'pptx',
      project_path: 'AI중장기전략',
      doc_title: 'AI전략_제안서_최종',
      location_type: 'slide',
      location_value: '10',
      location_detail: 'Slide 10',
      text: 'AI 핵심기술 분석. 생성형 AI: LLM, 멀티모달, RAG 기술 급성장. 엣지 AI: 온디바이스 추론 확대. 강화학습: 로봇, 자율주행 적용. 설명가능 AI(XAI): 공공/의료 분야 필수. 연합학습: 의료데이터 프라이버시 보호.',
      mtime: '2025-03-20T13:00:00',
      hash: 'demo_hash_006_s10'
    },
    {
      chunk_id: 'demo-ppt-006-s22',
      file_path: 'AI중장기전략/04. 산출물/AI_현황분석_보고서.pptx',
      file_type: 'pptx',
      project_path: 'AI중장기전략',
      doc_title: 'AI_현황분석_보고서',
      location_type: 'slide',
      location_value: '22',
      location_detail: 'Slide 22',
      text: '공공부문 AI 도입 현황. 도입률: 중앙부처 45%, 지자체 18%. 주요 활용 분야: 민원 챗봇(32%), 문서분류(28%), 이상탐지(15%). 장애요인: 데이터 부족(42%), 예산(35%), 인력(23%). 보건복지부: AI 기반 복지사각지대 발굴 시스템 운영.',
      mtime: '2025-07-15T10:00:00',
      hash: 'demo_hash_006_s22'
    },

    // === AI 중장기전략 - PDF ===
    {
      chunk_id: 'demo-pdf-007-p08',
      file_path: 'AI중장기전략/01. RFP/AI전략수립_제안요청서.pdf',
      file_type: 'pdf',
      project_path: 'AI중장기전략',
      doc_title: 'AI전략수립_제안요청서',
      location_type: 'page',
      location_value: '8',
      location_detail: 'Page 8',
      text: '수행 요구사항. 국내외 AI 정책 동향 분석. 산업별 AI 도입 현황 조사. AI 핵심기술 트렌드 분석(생성형AI, 멀티모달, 에이전트 AI 포함). 공공분야 AI 적용 전략. 3개년 실행 로드맵 및 소요예산.',
      mtime: '2025-02-10T09:00:00',
      hash: 'demo_hash_007_p08'
    },

    // === AI 중장기전략 - ipynb ===
    {
      chunk_id: 'demo-ipynb-008-c3',
      file_path: 'AI중장기전략/06. 분석코드/AI_adoption_analysis.ipynb',
      file_type: 'ipynb',
      project_path: 'AI중장기전략',
      doc_title: 'AI_adoption_analysis',
      location_type: 'cell',
      location_value: '3',
      location_detail: 'Cell 3 (markdown)',
      text: '## 공공기관 AI 도입률 분석\n\n중앙부처, 지자체, 공공기관별 AI 도입률을 비교 분석한다.\n데이터 출처: 2025 공공부문 AI 활용 실태조사(NIA)',
      mtime: '2025-08-20T15:30:00',
      hash: 'demo_hash_008_c3'
    },
    {
      chunk_id: 'demo-ipynb-008-c5',
      file_path: 'AI중장기전략/06. 분석코드/AI_adoption_analysis.ipynb',
      file_type: 'ipynb',
      project_path: 'AI중장기전략',
      doc_title: 'AI_adoption_analysis',
      location_type: 'cell',
      location_value: '5',
      location_detail: 'Cell 5 (code)',
      text: "import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv('ai_adoption_survey.csv')\n\n# 기관유형별 AI 도입률\nadoption_by_type = df.groupby('기관유형')['AI도입여부'].mean()\nprint(adoption_by_type)\n\n# 보건복지부 상세 분석\nmohw = df[df['기관명'] == '보건복지부']\nprint(mohw[['시스템명', 'AI적용분야', '도입시기', '예산규모']])",
      mtime: '2025-08-20T15:30:00',
      hash: 'demo_hash_008_c5'
    },

    // === 디지털플랫폼정부 사업 - PPT ===
    {
      chunk_id: 'demo-ppt-009-s04',
      file_path: '디지털플랫폼정부/03. 보고서/DPG_ISP_최종보고.pptx',
      file_type: 'pptx',
      project_path: '디지털플랫폼정부',
      doc_title: 'DPG_ISP_최종보고',
      location_type: 'slide',
      location_value: '4',
      location_detail: 'Slide 4',
      text: '디지털플랫폼정부 ISP 추진 배경. 정부 디지털 전환 가속화. 부처간 데이터 사일로 해소 필요. 국민 맞춤형 서비스 통합 제공. 클라우드 네이티브 전환 추진.',
      mtime: '2025-11-01T09:00:00',
      hash: 'demo_hash_009_s04'
    },
    {
      chunk_id: 'demo-ppt-009-s14',
      file_path: '디지털플랫폼정부/03. 보고서/DPG_ISP_최종보고.pptx',
      file_type: 'pptx',
      project_path: '디지털플랫폼정부',
      doc_title: 'DPG_ISP_최종보고',
      location_type: 'slide',
      location_value: '14',
      location_detail: 'Slide 14',
      text: '응용시스템 현황분석. 전자정부 시스템 총 1,247개. 노후 시스템(5년 이상): 43%. 클라우드 전환율: 28%. API 표준 적용률: 35%. 보건복지부 사회보장정보시스템: 연계 기관 17개, 일 처리건수 350만건.',
      mtime: '2025-11-01T09:00:00',
      hash: 'demo_hash_009_s14'
    },

    // === 디지털플랫폼정부 - XLSX ===
    {
      chunk_id: 'demo-xlsx-010-s1-r4',
      file_path: '디지털플랫폼정부/05. 조사자료/시스템_현황조사.xlsx',
      file_type: 'xlsx',
      project_path: '디지털플랫폼정부',
      doc_title: '시스템_현황조사',
      location_type: 'sheet',
      location_value: '시스템목록',
      location_detail: 'Sheet:시스템목록 Row:4',
      text: '사회보장정보시스템 | 보건복지부 | 2010 | 온프레미스 | Oracle | 연계기관17개 | 일처리350만건 | 클라우드전환검토중',
      mtime: '2025-10-15T11:30:00',
      hash: 'demo_hash_010_s1_r4'
    },
    {
      chunk_id: 'demo-xlsx-010-s1-r8',
      file_path: '디지털플랫폼정부/05. 조사자료/시스템_현황조사.xlsx',
      file_type: 'xlsx',
      project_path: '디지털플랫폼정부',
      doc_title: '시스템_현황조사',
      location_type: 'sheet',
      location_value: '시스템목록',
      location_detail: 'Sheet:시스템목록 Row:8',
      text: '국가공간정보통합체계 | 국토교통부 | 2015 | 하이브리드 | PostgreSQL | 연계기관8개 | GIS데이터 | 고도화필요',
      mtime: '2025-10-15T11:30:00',
      hash: 'demo_hash_010_s1_r8'
    },

    // === EA 수립 사업 - PDF ===
    {
      chunk_id: 'demo-pdf-011-p22',
      file_path: '공공기관EA수립/02. 산출물/EA_현황분석보고서.pdf',
      file_type: 'pdf',
      project_path: '공공기관EA수립',
      doc_title: 'EA_현황분석보고서',
      location_type: 'page',
      location_value: '22',
      location_detail: 'Page 22',
      text: '데이터 아키텍처 현황. 마스터데이터 관리체계: 미흡. 데이터 표준 적용률: 42%. 메타데이터 관리: 수동. 데이터 카탈로그: 미구축. 데이터 품질관리 도구: 미도입. 개선방향: 데이터 거버넌스 체계 수립, 표준 메타데이터 관리, 마스터데이터 통합.',
      mtime: '2025-04-10T10:00:00',
      hash: 'demo_hash_011_p22'
    },
    {
      chunk_id: 'demo-pdf-011-p35',
      file_path: '공공기관EA수립/02. 산출물/EA_현황분석보고서.pdf',
      file_type: 'pdf',
      project_path: '공공기관EA수립',
      doc_title: 'EA_현황분석보고서',
      location_type: 'page',
      location_value: '35',
      location_detail: 'Page 35',
      text: '인프라 아키텍처 현황. 서버 총 128대(물리 45, 가상 83). 노후서버(5년 이상): 38%. 평균 CPU 사용률: 32%. 스토리지 총 용량: 850TB, 사용률 67%. 네트워크: 10G 백본. 보안장비: 방화벽 4대, IPS 2대, WAF 1대.',
      mtime: '2025-04-10T10:00:00',
      hash: 'demo_hash_011_p35'
    },
  ]
}
