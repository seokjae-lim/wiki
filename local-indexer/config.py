"""
Knowledge Wiki Indexer - Configuration
=======================================
이 파일을 수정하여 환경에 맞게 설정하세요.
"""

# =============================================
# Google Drive 동기화 폴더 경로
# =============================================
# Windows 예: r"C:\Users\USER\Google Drive\전략기획실"
# Mac 예:     "/Users/you/Google Drive/전략기획실"

DRIVE_ROOT = r"C:\Users\USER\Google Drive\전략기획실"

# =============================================
# Knowledge Wiki API URL
# =============================================
# 로컬 개발: http://localhost:3000
# 배포 후:   https://your-wiki.pages.dev

WIKI_API_URL = "http://localhost:3000"

# =============================================
# 인덱싱 설정
# =============================================

# API 업로드 배치 크기
BATCH_SIZE = 50

# 지원하는 파일 확장자
SUPPORTED_EXTENSIONS = [
    '.pptx',
    '.pdf',
    '.xlsx',
    '.csv',
    '.ipynb',
    '.docx',
    # '.hwp',  # HWP 지원 시 hwp5txt 또는 별도 변환 필요
]
