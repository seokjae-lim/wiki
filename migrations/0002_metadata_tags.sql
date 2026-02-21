-- Step 2: Auto Metadata Tagging
-- Add rich metadata columns for DBpia-style browsing & filtering

-- Tags (JSON array of keywords)
ALTER TABLE chunks ADD COLUMN tags TEXT DEFAULT '[]';

-- Category (주제분류: 데이터, AI, 거버넌스, 인프라, 보안, 정책, 등)
ALTER TABLE chunks ADD COLUMN category TEXT DEFAULT '';

-- Sub-category
ALTER TABLE chunks ADD COLUMN sub_category TEXT DEFAULT '';

-- Author (작성자/수행기관)
ALTER TABLE chunks ADD COLUMN author TEXT DEFAULT '';

-- Organization (발주기관)
ALTER TABLE chunks ADD COLUMN org TEXT DEFAULT '';

-- Document stage (문서 단계: RFP, 제안서, 착수보고, 중간보고, 최종보고, 산출물, 조사자료, 분석코드)
ALTER TABLE chunks ADD COLUMN doc_stage TEXT DEFAULT '';

-- Year (사업연도)
ALTER TABLE chunks ADD COLUMN doc_year TEXT DEFAULT '';

-- Summary (AI 요약 - 추후 활용)
ALTER TABLE chunks ADD COLUMN summary TEXT DEFAULT '';

-- Importance score (0-100, 문서 중요도)
ALTER TABLE chunks ADD COLUMN importance INTEGER DEFAULT 50;

-- View count (조회수)
ALTER TABLE chunks ADD COLUMN view_count INTEGER DEFAULT 0;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_chunks_category ON chunks(category);
CREATE INDEX IF NOT EXISTS idx_chunks_sub_category ON chunks(sub_category);
CREATE INDEX IF NOT EXISTS idx_chunks_author ON chunks(author);
CREATE INDEX IF NOT EXISTS idx_chunks_org ON chunks(org);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_stage ON chunks(doc_stage);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_year ON chunks(doc_year);
CREATE INDEX IF NOT EXISTS idx_chunks_importance ON chunks(importance);
CREATE INDEX IF NOT EXISTS idx_chunks_view_count ON chunks(view_count);
