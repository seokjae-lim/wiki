-- Phase 3: Vector Embeddings & Semantic Search
-- 임베딩 벡터 저장 및 시맨틱 검색 지원

-- Embedding vector (JSON float array, 256 dimensions)
ALTER TABLE chunks ADD COLUMN embedding TEXT DEFAULT '';

-- Embedding model used
ALTER TABLE chunks ADD COLUMN embed_model TEXT DEFAULT '';

-- Index for embed_model
CREATE INDEX IF NOT EXISTS idx_chunks_embed_model ON chunks(embed_model);
