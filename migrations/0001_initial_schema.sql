-- Knowledge Wiki: Core tables
CREATE TABLE IF NOT EXISTS chunks (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  project_path TEXT DEFAULT '',
  doc_title TEXT DEFAULT '',
  location_type TEXT DEFAULT '',
  location_value TEXT DEFAULT '',
  location_detail TEXT DEFAULT '',
  text TEXT NOT NULL,
  mtime TEXT DEFAULT '',
  hash TEXT DEFAULT '',
  indexed_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_chunks_file_type ON chunks(file_type);
CREATE INDEX IF NOT EXISTS idx_chunks_project_path ON chunks(project_path);
CREATE INDEX IF NOT EXISTS idx_chunks_mtime ON chunks(mtime);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);

-- FTS5 Virtual Table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  content='chunks',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  INSERT INTO chunks_fts(rowid, text) VALUES (new.rowid, new.text);
END;
