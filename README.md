# Knowledge Wiki - KM-AI 4.0

## Project Overview
- **Name**: Knowledge Wiki (KM-AI)
- **Version**: 4.0 (Auth System + Semantic Search + AI Q&A + RAG)
- **Goal**: Google Drive 컨설팅 산출물(PPT, PDF, Excel, CSV, ipynb, DOCX)의 내부 텍스트를 슬라이드/페이지/행/셀 단위로 전문+시맨틱 검색하고, AI Q&A로 자연어 질의응답이 가능한 지식 플랫폼
- **Tech Stack**: Hono + TypeScript + Cloudflare Workers (D1 SQLite FTS5) + TF-IDF 벡터 임베딩 + Tailwind CSS + Python Indexer

## URLs
- **Sandbox**: https://3000-ix7c266jwx6te70xnjbgs-c07dda5e.sandbox.novita.ai
- **GitHub**: https://github.com/seokjae-lim/wiki
- **Production**: (Cloudflare Pages 배포 대기)

## Completed Features

### Phase 1 (MVP): Full-Text Search
- FTS5 전문 검색, 슬라이드/페이지/시트/행/셀 위치 정보
- 파일유형/프로젝트 필터, 경로 복사

### Phase 2: Auto Metadata Tagging + DBpia-style UI
- TF 기반 키워드 태그, 주제분류(7개), 기관 인식(10개), 문서단계 판별(8개)
- 4개 뷰 SPA: 홈, 검색, 브라우징, 대시보드
- 중요도 점수, 조회수, 태그 클라우드, 인기 문서

### Phase 3: Semantic Search + AI Q&A
- TF-IDF 벡터 임베딩 (300차원 한국어+영문 도메인 어휘)
- 시맨틱 검색: 코사인 유사도 기반 (FTS/시맨틱 토글)
- AI Q&A (RAG 패턴): FTS+시맨틱 하이브리드 → 컨텍스트 답변
- 벡터 유사문서 추천

### Phase 4 (NEW): Authentication System
- **4종 로그인**: 카카오, 네이버, Google, 이메일
- OAuth 2.0 Authorization Code Flow (카카오/네이버/구글)
- 이메일 회원가입/로그인 (SHA-256 비밀번호 해싱)
- 쿠키 기반 세션 관리 (30일 만료, httpOnly, secure)
- CSRF 방지: OAuth state 토큰
- 헤더 사용자 메뉴 (프로필, 로그아웃)

## Backend API

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/me` | GET | 현재 로그인 사용자 조회 |
| `/api/auth/register` | POST | 이메일 회원가입 |
| `/api/auth/login` | POST | 이메일 로그인 |
| `/api/auth/logout` | POST | 로그아웃 |
| `/api/auth/providers` | GET | 사용 가능한 OAuth 프로바이더 |
| `/api/auth/kakao` | GET | 카카오 OAuth 시작 |
| `/api/auth/naver` | GET | 네이버 OAuth 시작 |
| `/api/auth/google` | GET | Google OAuth 시작 |
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

## Quick Start

### Web Application (Sandbox)
```bash
npm install
npm run build
npm run db:migrate:local
pm2 start ecosystem.config.cjs
curl -X POST http://localhost:3000/api/seed
curl -X POST http://localhost:3000/api/embeddings/generate
```

### Local Python Indexer
```bash
cd local-indexer
pip install -r requirements.txt
# Edit config.py: set DRIVE_ROOT and WIKI_API_URL
python indexer.py          # Parse + tag + upload + embed
python indexer.py --embed  # Regenerate embeddings only
```

### OAuth 설정 (카카오/네이버/구글)
```bash
# .dev.vars (로컬 개발)
KAKAO_CLIENT_ID=your_kakao_app_key
KAKAO_CLIENT_SECRET=your_kakao_secret
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
APP_URL=http://localhost:3000

# Production (Cloudflare secrets)
npx wrangler pages secret put KAKAO_CLIENT_ID --project-name knowledge-wiki
npx wrangler pages secret put KAKAO_CLIENT_SECRET --project-name knowledge-wiki
# ... (각 프로바이더에 대해 반복)
```

### OpenAI API Key (optional, for AI Q&A)
```bash
# .dev.vars
OPENAI_API_KEY=sk-xxx

# Production
npx wrangler pages secret put OPENAI_API_KEY --project-name knowledge-wiki
```

## Data Architecture
- **Database**: Cloudflare D1 SQLite (FTS5 + Vector + Auth)
- **Tables**: chunks, chunks_fts, users, sessions, oauth_states
- **Embedding**: TF-IDF 300차원, JSON float array in D1 TEXT column
- **Auth**: Cookie-based session, SHA-256 password, OAuth 2.0

## Roadmap
- [x] Phase 1: MVP - FTS5 전문검색 + 위치정보
- [x] Phase 2: 자동 메타데이터 태깅 + DBpia 스타일 UI
- [x] Phase 3: 벡터 임베딩 + 시맨틱 검색 + AI Q&A (RAG)
- [x] Phase 4: 인증 시스템 (카카오/네이버/구글/이메일)
- [ ] Phase 5: 온톨로지/지식그래프 (GraphRAG)
- [ ] Phase 6: AI 에이전트 (요약/제안서 초안 자동작성)

## Deployment
- **Platform**: Cloudflare Pages
- **GitHub**: https://github.com/seokjae-lim/wiki
- **Status**: Sandbox 운영 중
- **Last Updated**: 2026-02-21
