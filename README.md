# Knowledge Wiki - KM-AI 1.0

## Project Overview
- **Name**: Knowledge Wiki (Consulting Knowledge Search System)
- **Goal**: Google Drive에 쌓인 컨설팅 산출물(PPT/PDF/엑셀/CSV/노트북)의 **내부 텍스트**까지 검색하여, 정확한 **위치**(슬라이드/페이지/시트/행)를 즉시 찾아주는 내부 지식 검색 위키
- **Stage**: MVP (1단계: 문자열 기반 Full Text Search)

## What It Does
- VSCode처럼 모든 문서의 **내용**까지 읽어서 검색
- 파일명이 아니라 **텍스트 기반** 검색 결과 제공
- 검색 결과에 **정확한 위치** 표시:
  - PPTX: 슬라이드 번호
  - PDF: 페이지 번호
  - XLSX: 시트명 + 행 번호
  - CSV: 행 번호
  - ipynb: 셀 번호 (코드/마크다운 구분)
- 프로젝트(사업)별 필터링
- 파일 유형별 필터링
- 검색어 하이라이트
- 경로 복사

## Architecture
```
[Google Drive Desktop 동기화 폴더]
        |
        v
[Local Python Indexer]     <-- 로컬 PC에서 실행
  - 파일 스캔 (증분)
  - 텍스트 추출 (PPTX/PDF/XLSX/CSV/ipynb)
  - API로 업로드
        |
        v
[Knowledge Wiki (Cloudflare Pages)]
  - Hono Backend + D1 Database
  - FTS5 Full-Text Search
  - Web UI (검색/필터/상세보기)
```

## Tech Stack
- **Backend**: Hono (TypeScript) + Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite + FTS5)
- **Frontend**: Tailwind CSS + Vanilla JS
- **Local Indexer**: Python (python-pptx, PyMuPDF, openpyxl)
- **Deployment**: Cloudflare Pages

## URLs
- **Demo**: (배포 후 추가)
- **API**: `/api/search`, `/api/doc/:id`, `/api/stats`

## Quick Start

### 1. Web UI (검색 서비스)
```bash
npm install
npm run build
npm run db:migrate:local
npm run dev:sandbox
# http://localhost:3000 접속
# "현황" 버튼 > "데모 데이터 로드" 클릭
```

### 2. Local Indexer (문서 인덱싱)
```bash
cd local-indexer
pip install -r requirements.txt
# config.py에서 DRIVE_ROOT 경로 설정
python indexer.py
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search?q=&type=&project=&sort=&page=&limit=` | 전체 텍스트 검색 |
| GET | `/api/doc/:chunk_id` | 청크 상세 조회 |
| GET | `/api/stats` | 인덱싱 통계 |
| GET | `/api/projects` | 프로젝트 목록 |
| GET | `/api/filetypes` | 파일 유형 목록 |
| POST | `/api/chunks` | 청크 벌크 업로드 (인덱서용) |
| POST | `/api/seed` | 데모 데이터 시드 |
| DELETE | `/api/chunks` | 전체 청크 삭제 |

## Data Schema (Standard Record)
```json
{
  "chunk_id": "unique-id",
  "file_path": "국가중점데이터/03. 제안서/최종보고.pptx",
  "file_type": "pptx",
  "project_path": "국가중점데이터",
  "doc_title": "최종보고",
  "location_type": "slide",
  "location_value": "12",
  "location_detail": "Slide 12",
  "text": "기관별 데이터 인프라 현황 분석...",
  "mtime": "2025-12-15T10:30:00",
  "hash": "abc123..."
}
```

## Roadmap
- [x] 1단계: Full Text Search MVP
- [ ] 2단계: 의미검색(RAG) - 벡터 임베딩 추가
- [ ] 3단계: 온톨로지 설계 + 그래프 시각화
- [ ] 4단계: 에이전틱 AI (제안서 초안 자동 생성)

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: MVP (개발 중)
- **Last Updated**: 2026-02-21
