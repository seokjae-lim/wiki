# Knowledge Wiki - KM-AI 3.0

## Project Overview
- **Name**: Knowledge Wiki (KM-AI)
- **Version**: 3.0 (Semantic Search + AI Q&A + RAG)
- **Goal**: Google Drive 컨설팅 산출물(PPT, PDF, Excel, CSV, ipynb, DOCX)의 내부 텍스트를 슬라이드/페이지/행/셀 단위로 전문+시맨틱 검색하고, AI Q&A로 자연어 질의응답이 가능한 지식 플랫폼
- **Tech Stack**: Hono + TypeScript + Cloudflare Workers (D1 SQLite FTS5) + TF-IDF 벡터 임베딩 + Tailwind CSS + Python Indexer

## URLs
- **Sandbox**: https://3000-ix7c266jwx6te70xnjbgs-c07dda5e.sandbox.novita.ai
- **Production**: (Cloudflare Pages 배포 대기)

## Completed Features (v3.0)

### Phase 1 (MVP): Full-Text Search
- FTS5 전문 검색, 슬라이드/페이지/시트/행/셀 위치 정보
- 파일유형/프로젝트 필터, 경로 복사

### Phase 2: Auto Metadata Tagging + DBpia-style UI
- TF 기반 키워드 태그, 주제분류(7개), 기관 인식(10개), 문서단계 판별(8개)
- 4개 뷰 SPA: 홈, 검색, 브라우징, 대시보드
- 중요도 점수, 조회수, 태그 클라우드, 인기 문서

### Phase 3 (NEW): Semantic Search + AI Q&A
- **TF-IDF 벡터 임베딩**: 300차원 한국어+영문 도메인 어휘 기반
- **시맨틱 검색**: 코사인 유사도 기반 의미 검색 (FTS/시맨틱 토글)
- **벡터 유사문서 추천**: 문서 상세에서 벡터 기반 유사도 표시
- **AI Q&A (RAG 패턴)**: FTS+시맨틱 하이브리드 검색 → 컨텍스트 기반 답변
  - OpenAI API 키 있으면: GPT-4o-mini 자연어 답변
  - 키 없으면: 관련 문서 컨텍스트 요약 (fallback)
- **임베딩 관리**: 서버측 자동 생성, 커버리지 통계

### Backend API
| Endpoint | Method | Description |
|---|---|---|
| `/api/search` | GET | FTS 전문 검색 |
| `/api/semantic-search` | GET | 시맨틱 벡터 검색 |
| `/api/similar/:id` | GET | 벡터 유사 문서 추천 |
| `/api/ask` | POST | AI Q&A (RAG) |
| `/api/embeddings/generate` | POST | 임베딩 자동 생성 |
| `/api/embedding-stats` | GET | 임베딩 커버리지 통계 |
| `/api/browse` | GET | 필터 기반 브라우징 |
| `/api/doc/:chunk_id` | GET | 문서 상세 + 관련/유사 추천 |
| `/api/stats` | GET | 통합 통계 |
| `/api/tags` | GET | 태그 클라우드 |
| `/api/categories` | GET | 주제분류 목록 |
| `/api/projects` | GET | 프로젝트 목록 |
| `/api/orgs` | GET | 발주기관 목록 |
| `/api/trending` | GET | 인기/최근 문서 |
| `/api/chunks` | POST | 청크 일괄 업로드 |
| `/api/chunks` | DELETE | 전체 삭제 |
| `/api/seed` | POST | 데모 데이터 로드 (28 chunks) |

### Local Python Indexer (v3.0)
- Google Drive 동기화 폴더 스캔 + 증분 인덱싱
- 6개 파일 형식: PPTX, PDF, XLSX, CSV, ipynb, DOCX
- 자동 태깅: TF 키워드, 주제분류, 기관인식, 문서단계, 중요도
- **v3.0**: 인덱싱 후 서버측 임베딩 생성 자동 트리거
- `--embed` 플래그: 임베딩만 단독 생성

## Data Architecture
- **Database**: Cloudflare D1 SQLite (FTS5 + Vector)
- **Embedding**: TF-IDF 300차원, JSON float array in D1 TEXT column
- **Vector Search**: 코사인 유사도 (JS 계산, threshold 0.1)
- **RAG Pipeline**: FTS + 시맨틱 하이브리드 검색 → Top 6 컨텍스트 → OpenAI or fallback

## Quick Start

### Web Application (Sandbox)
```bash
npm install
npm run build
npm run db:migrate:local
pm2 start ecosystem.config.cjs
curl -X POST http://localhost:3000/api/seed       # Load demo data
curl -X POST http://localhost:3000/api/embeddings/generate  # Generate embeddings
```

### Local Python Indexer
```bash
cd local-indexer
pip install -r requirements.txt
# Edit config.py: set DRIVE_ROOT and WIKI_API_URL
python indexer.py          # Parse + tag + upload + embed
python indexer.py --embed  # Regenerate embeddings only
```

### OpenAI API Key (optional, for AI Q&A)
```bash
# .dev.vars (local development)
OPENAI_API_KEY=sk-xxx

# Production
npx wrangler pages secret put OPENAI_API_KEY --project-name knowledge-wiki
```

## Roadmap
- [x] Phase 1: MVP - FTS5 전문검색 + 위치정보
- [x] Phase 2: 자동 메타데이터 태깅 + DBpia 스타일 UI
- [x] Phase 3: 벡터 임베딩 + 시맨틱 검색 + AI Q&A (RAG)
- [ ] Phase 4: 온톨로지/지식그래프 (GraphRAG)
- [ ] Phase 5: AI 에이전트 (요약/제안서 초안 자동작성)

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Sandbox 운영 중
- **Last Updated**: 2026-02-21
