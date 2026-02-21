# Knowledge Wiki - KM-AI 2.0

## Project Overview
- **Name**: Knowledge Wiki (KM-AI)
- **Version**: 2.0 (Auto Metadata Tagging + DBpia-style UI)
- **Goal**: Google Drive 컨설팅 산출물(PPT, PDF, Excel, CSV, ipynb, DOCX)의 내부 텍스트를 슬라이드/페이지/행/셀 단위로 전문 검색하고, 자동 태깅된 메타데이터로 주제별 탐색이 가능한 지식 플랫폼
- **Tech Stack**: Hono + TypeScript + Cloudflare Workers (D1 SQLite FTS5) + Tailwind CSS + Python Indexer

## URLs
- **Sandbox**: https://3000-ix7c266jwx6te70xnjbgs-c07dda5e.sandbox.novita.ai
- **Production**: (Cloudflare Pages 배포 대기)

## Completed Features (v2.0)

### Web Application
1. **전문 검색 (FTS5)**: 모든 파일 유형의 텍스트를 슬라이드/페이지/행/셀 단위로 검색
2. **자동 메타데이터 태깅**: TF 기반 키워드 태그, 주제분류, 기관 인식, 문서단계 판별, 중요도 점수
3. **4개 뷰 SPA**: 홈, 검색결과, 주제별 브라우징, 대시보드
4. **상세 필터**: 파일유형, 프로젝트, 주제분류, 문서단계, 발주기관, 연도별 필터
5. **정렬**: 관련도, 최신순, 인기순, 중요도순
6. **문서 상세 패널**: 서지정보, 요약, 태그, 관련/유사 문서 추천
7. **인기 태그 클라우드**: 태그 빈도 기반 시각화
8. **대시보드**: 파일유형별/주제별/단계별/기관별 통계, 인기 문서 Top 10

### Backend API
| Endpoint | Method | Description |
|---|---|---|
| `/api/search` | GET | 전문 검색 (FTS5 MATCH + 필터 + 페이지네이션) |
| `/api/browse` | GET | 필터 기반 브라우징 (FTS 불필요) |
| `/api/doc/:chunk_id` | GET | 문서 상세 + 조회수 증가 + 관련/유사 추천 |
| `/api/stats` | GET | 통계 (유형/분류/단계/기관/연도/인기) |
| `/api/tags` | GET | 태그 클라우드 |
| `/api/categories` | GET | 주제분류 목록 |
| `/api/projects` | GET | 프로젝트 목록 |
| `/api/filetypes` | GET | 파일 유형 목록 |
| `/api/orgs` | GET | 발주기관 목록 |
| `/api/trending` | GET | 인기/최근 인덱싱 문서 |
| `/api/chunks` | POST | 청크 일괄 업로드 |
| `/api/chunks` | DELETE | 전체 삭제 |
| `/api/seed` | POST | 데모 데이터 로드 (28 chunks) |

### Local Python Indexer (v2.0)
- Google Drive 동기화 폴더 스캔 + 증분 인덱싱
- 6개 파일 형식 파싱: PPTX, PDF, XLSX, CSV, ipynb, DOCX
- **자동 태깅**: TF 키워드 추출, 주제분류 (AI/데이터/거버넌스/인프라/보안/전략/사업관리)
- **기관 인식**: NIA, 과기정통부, 행안부 등 10개 기관 사전
- **문서단계 판별**: RFP/제안서/착수보고/.../분석코드
- **중요도 점수**: 문서단계, 텍스트 길이, 핵심 키워드 가중치 기반

## Data Architecture
- **Database**: Cloudflare D1 SQLite (FTS5 virtual table)
- **Schema**:
  - `chunks` table: chunk_id, file_path, file_type, project_path, doc_title, location_type/value/detail, text, mtime, hash, tags(JSON), category, sub_category, author, org, doc_stage, doc_year, summary, importance, view_count, indexed_at
  - `chunks_fts` FTS5 virtual table on text column
  - Sync triggers (insert/update/delete)
- **Demo Data**: 28 chunks across 5 projects, 12 files (pptx 13, xlsx 6, pdf 5, csv 2, ipynb 2)

## Quick Start

### Web Application (Sandbox)
```bash
npm install
npm run build
npm run db:migrate:local
pm2 start ecosystem.config.cjs
curl -X POST http://localhost:3000/api/seed  # Load demo data
```

### Local Python Indexer
```bash
cd local-indexer
pip install -r requirements.txt
# Edit config.py: set DRIVE_ROOT and WIKI_API_URL
python indexer.py
```

## File Structure
```
webapp/
  src/
    index.tsx        # Hono app entry
    api.ts           # All API routes + demo data
    pages.tsx        # HTML page (SPA shell)
  public/
    static/
      wiki.js        # Frontend JS (views, search, browse, dashboard)
      wiki.css       # Styles (type badges, tag chips, animations)
    favicon.svg      # Favicon
  local-indexer/
    indexer.py       # Python indexer v2.0 (auto-tagging)
    config.py        # Configuration
    requirements.txt # Python deps
  migrations/
    0001_initial_schema.sql
    0002_metadata_tags.sql
  wrangler.jsonc     # Cloudflare config
  ecosystem.config.cjs # PM2 config
```

## Roadmap
- [x] Phase 1: MVP - FTS5 전문검색 + 위치정보
- [x] Phase 2: 자동 메타데이터 태깅 + DBpia 스타일 UI
- [ ] Phase 3: 벡터 임베딩 + 시맨틱 검색 (RAG)
- [ ] Phase 4: 온톨로지/지식그래프 (GraphRAG)
- [ ] Phase 5: AI 에이전트 (요약/제안서 초안 자동작성)

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Sandbox 운영 중 (Cloudflare 배포 대기)
- **Last Updated**: 2026-02-21
