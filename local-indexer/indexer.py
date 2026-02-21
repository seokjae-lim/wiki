"""
Knowledge Wiki - Local Indexer
==============================
Google Drive 동기화 폴더의 문서를 파싱하여 Knowledge Wiki에 업로드합니다.

지원 파일:
  - PPTX (슬라이드 단위)
  - PDF (페이지 단위)
  - XLSX (시트+행 단위)
  - CSV (행 단위)
  - ipynb (셀 단위)
  - DOCX (문단 단위)

사용법:
  1. pip install -r requirements.txt
  2. config.py에서 DRIVE_ROOT, WIKI_API_URL 설정
  3. python indexer.py

증분 인덱싱:
  - SQLite로 파일별 mtime/hash 추적
  - 변경된 파일만 재처리
"""

import os
import sys
import json
import hashlib
import sqlite3
import uuid
import time
import traceback
from pathlib import Path
from datetime import datetime

import requests

# =============================================
# Configuration
# =============================================
from config import DRIVE_ROOT, WIKI_API_URL, BATCH_SIZE, SUPPORTED_EXTENSIONS


# =============================================
# Database (tracking indexed files)
# =============================================
DB_PATH = os.path.join(os.path.dirname(__file__), 'indexer_state.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS indexed_files (
            file_path TEXT PRIMARY KEY,
            mtime REAL,
            hash TEXT,
            chunk_count INTEGER DEFAULT 0,
            last_indexed TEXT,
            status TEXT DEFAULT 'ok'
        )
    ''')
    conn.commit()
    return conn

def get_file_hash(filepath, block_size=65536):
    """Fast hash using first/last blocks + file size"""
    size = os.path.getsize(filepath)
    hasher = hashlib.sha256()
    hasher.update(str(size).encode())
    with open(filepath, 'rb') as f:
        buf = f.read(block_size)
        hasher.update(buf)
        if size > block_size * 2:
            f.seek(-block_size, 2)
            buf = f.read(block_size)
            hasher.update(buf)
    return hasher.hexdigest()[:16]

def needs_indexing(conn, filepath, mtime):
    """Check if file needs (re)indexing"""
    row = conn.execute(
        'SELECT mtime, hash FROM indexed_files WHERE file_path = ?',
        (filepath,)
    ).fetchone()
    if row is None:
        return True
    if abs(row[0] - mtime) > 1:
        return True
    return False

def mark_indexed(conn, filepath, mtime, file_hash, chunk_count, status='ok'):
    conn.execute('''
        INSERT OR REPLACE INTO indexed_files (file_path, mtime, hash, chunk_count, last_indexed, status)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (filepath, mtime, file_hash, chunk_count, datetime.now().isoformat(), status))
    conn.commit()


# =============================================
# Parsers
# =============================================

def parse_pptx(filepath):
    """PPTX: slide-level chunks"""
    from pptx import Presentation
    chunks = []
    prs = Presentation(filepath)
    for i, slide in enumerate(prs.slides, 1):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = para.text.strip()
                    if text:
                        texts.append(text)
            if shape.has_table:
                table = shape.table
                for row in table.rows:
                    row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_texts:
                        texts.append(' | '.join(row_texts))
        full_text = '\n'.join(texts)
        if full_text.strip():
            chunks.append({
                'location_type': 'slide',
                'location_value': str(i),
                'location_detail': f'Slide {i}',
                'text': full_text
            })
    return chunks


def parse_pdf(filepath):
    """PDF: page-level chunks"""
    import fitz  # PyMuPDF
    chunks = []
    doc = fitz.open(filepath)
    for i, page in enumerate(doc, 1):
        text = page.get_text().strip()
        if text:
            chunks.append({
                'location_type': 'page',
                'location_value': str(i),
                'location_detail': f'Page {i}',
                'text': text
            })
    doc.close()
    return chunks


def parse_xlsx(filepath):
    """XLSX: sheet + row level chunks"""
    from openpyxl import load_workbook
    chunks = []
    wb = load_workbook(filepath, read_only=True, data_only=True)
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        row_num = 0
        for row in ws.iter_rows(values_only=True):
            row_num += 1
            cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if cells:
                text = ' | '.join(cells)
                chunks.append({
                    'location_type': 'sheet',
                    'location_value': sheet_name,
                    'location_detail': f'Sheet:{sheet_name} Row:{row_num}',
                    'text': text
                })
    wb.close()
    return chunks


def parse_csv(filepath):
    """CSV: row-level chunks"""
    import csv
    chunks = []
    # Try different encodings
    for enc in ['utf-8', 'cp949', 'euc-kr', 'latin-1']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                reader = csv.reader(f)
                for i, row in enumerate(reader, 1):
                    cells = [c.strip() for c in row if c.strip()]
                    if cells:
                        text = ','.join(cells)
                        chunks.append({
                            'location_type': 'row',
                            'location_value': str(i),
                            'location_detail': f'Row {i}',
                            'text': text
                        })
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    return chunks


def parse_ipynb(filepath):
    """Jupyter Notebook: cell-level chunks"""
    chunks = []
    with open(filepath, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    
    cells = nb.get('cells', [])
    for i, cell in enumerate(cells, 1):
        cell_type = cell.get('cell_type', 'code')
        source = ''.join(cell.get('source', []))
        if source.strip():
            chunks.append({
                'location_type': 'cell',
                'location_value': str(i),
                'location_detail': f'Cell {i} ({cell_type})',
                'text': source
            })
    return chunks


def parse_docx(filepath):
    """DOCX: paragraph-level chunks (grouped)"""
    from docx import Document
    chunks = []
    doc = Document(filepath)
    current_text = []
    para_start = 1
    
    for i, para in enumerate(doc.paragraphs, 1):
        text = para.text.strip()
        if text:
            current_text.append(text)
        
        # Group every 5 paragraphs or at end
        if len(current_text) >= 5 or (i == len(doc.paragraphs) and current_text):
            chunks.append({
                'location_type': 'page',
                'location_value': str(para_start),
                'location_detail': f'Paragraphs {para_start}-{i}',
                'text': '\n'.join(current_text)
            })
            current_text = []
            para_start = i + 1
    
    return chunks


PARSERS = {
    '.pptx': parse_pptx,
    '.pdf': parse_pdf,
    '.xlsx': parse_xlsx,
    '.csv': parse_csv,
    '.ipynb': parse_ipynb,
    '.docx': parse_docx,
}


# =============================================
# Scanner
# =============================================

def scan_files(root_dir):
    """Scan directory for supported files"""
    files = []
    root = Path(root_dir)
    for ext in SUPPORTED_EXTENSIONS:
        for f in root.rglob(f'*{ext}'):
            if '~$' in f.name:  # Skip temp files
                continue
            if '.git' in str(f) or 'node_modules' in str(f):
                continue
            files.append(f)
    return files


def get_project_path(filepath, root_dir):
    """Extract project name from folder structure"""
    rel = os.path.relpath(filepath, root_dir)
    parts = Path(rel).parts
    if len(parts) > 1:
        return parts[0]
    return ''


# =============================================
# Upload
# =============================================

def upload_chunks(chunks, api_url):
    """Upload chunks to Knowledge Wiki API"""
    url = f'{api_url}/api/chunks'
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        try:
            resp = requests.post(url, json={'chunks': batch}, timeout=30)
            data = resp.json()
            if data.get('errors'):
                print(f"  [WARN] Upload errors: {data['errors']}")
            return data.get('inserted', 0)
        except Exception as e:
            print(f"  [ERROR] Upload failed: {e}")
            return 0
    return 0


# =============================================
# Main
# =============================================

def main():
    print("=" * 60)
    print("  Knowledge Wiki - Local Indexer")
    print("=" * 60)
    print(f"  Drive Root: {DRIVE_ROOT}")
    print(f"  Wiki API:   {WIKI_API_URL}")
    print(f"  DB Path:    {DB_PATH}")
    print()

    if not os.path.isdir(DRIVE_ROOT):
        print(f"[ERROR] Drive root not found: {DRIVE_ROOT}")
        print("  Please check config.py and set the correct path.")
        sys.exit(1)

    conn = init_db()

    # Scan files
    print("[1/4] Scanning files...")
    files = scan_files(DRIVE_ROOT)
    print(f"  Found {len(files)} supported files")

    # Check which files need indexing
    print("[2/4] Checking for changes...")
    to_index = []
    for f in files:
        mtime = os.path.getmtime(f)
        if needs_indexing(conn, str(f), mtime):
            to_index.append(f)

    print(f"  {len(to_index)} files need (re)indexing")
    
    if not to_index:
        print("\n[DONE] Everything is up to date!")
        conn.close()
        return

    # Parse and upload
    print(f"[3/4] Parsing {len(to_index)} files...")
    total_chunks = 0
    errors = 0

    for i, filepath in enumerate(to_index, 1):
        ext = filepath.suffix.lower()
        parser = PARSERS.get(ext)
        if not parser:
            continue

        rel_path = os.path.relpath(filepath, DRIVE_ROOT)
        project = get_project_path(filepath, DRIVE_ROOT)
        doc_title = filepath.stem
        mtime_raw = os.path.getmtime(filepath)
        mtime = datetime.fromtimestamp(mtime_raw).isoformat()
        file_hash = get_file_hash(str(filepath))

        print(f"  [{i}/{len(to_index)}] {rel_path}...", end=' ', flush=True)

        try:
            raw_chunks = parser(str(filepath))
            
            # Build full chunk records
            chunks = []
            for c in raw_chunks:
                chunk_id = f"{file_hash}-{c['location_type']}-{c['location_value']}"
                chunks.append({
                    'chunk_id': chunk_id,
                    'file_path': rel_path.replace('\\', '/'),
                    'file_type': ext.lstrip('.'),
                    'project_path': project,
                    'doc_title': doc_title,
                    'location_type': c['location_type'],
                    'location_value': c['location_value'],
                    'location_detail': c['location_detail'],
                    'text': c['text'],
                    'mtime': mtime,
                    'hash': file_hash,
                })
            
            if chunks:
                uploaded = upload_chunks(chunks, WIKI_API_URL)
                total_chunks += len(chunks)
                print(f"{len(chunks)} chunks")
            else:
                print("(empty)")

            mark_indexed(conn, str(filepath), mtime_raw, file_hash, len(chunks))

        except Exception as e:
            print(f"ERROR: {e}")
            mark_indexed(conn, str(filepath), mtime_raw, '', 0, status=f'error: {e}')
            errors += 1

    print(f"\n[4/4] Upload complete!")
    print(f"  Total chunks: {total_chunks}")
    print(f"  Errors: {errors}")
    
    conn.close()
    print("\n[DONE]")


if __name__ == '__main__':
    main()
