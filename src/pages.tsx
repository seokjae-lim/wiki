import { Hono } from 'hono'
import { html } from 'hono/html'

type Bindings = {
  DB: D1Database
}

export const pageRoutes = new Hono<{ Bindings: Bindings }>()

pageRoutes.get('/', (c) => {
  return c.html(html`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Wiki - KM-AI 1.0</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/wiki.css" rel="stylesheet">
</head>
<body class="bg-gray-50 min-h-screen">

  <!-- Header -->
  <header class="bg-white border-b border-gray-200 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 py-3">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 shrink-0">
          <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <i class="fas fa-brain text-white text-sm"></i>
          </div>
          <div>
            <h1 class="text-base font-bold text-gray-900 leading-none">Knowledge Wiki</h1>
            <p class="text-[10px] text-gray-400 leading-none mt-0.5">KM-AI 1.0 | Consulting Knowledge Search</p>
          </div>
        </div>

        <div class="flex-1 max-w-3xl relative">
          <div class="relative">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input 
              id="searchInput"
              type="text" 
              placeholder="검색어 입력 (예: 보건복지부, 데이터 거버넌스, AI 도입...)"
              class="search-input w-full pl-10 pr-24 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              autocomplete="off"
            >
            <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200">Enter</kbd>
              <button id="searchBtn" class="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition">검색</button>
            </div>
          </div>
        </div>

        <button id="statsBtn" class="shrink-0 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm" title="인덱싱 현황">
          <i class="fas fa-chart-bar mr-1"></i><span class="hidden sm:inline">현황</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Main -->
  <div class="max-w-7xl mx-auto px-4 py-4 flex gap-4">
    
    <!-- Left: Filters -->
    <aside id="filterPanel" class="w-56 shrink-0 hidden lg:block">
      <div class="bg-white rounded-lg border border-gray-200 p-4 sticky top-20">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"><i class="fas fa-filter mr-1"></i> 필터</h3>
        <div class="mb-4">
          <h4 class="text-xs font-medium text-gray-700 mb-2">파일 유형</h4>
          <div id="typeFilters" class="flex flex-wrap gap-1.5">
            <button data-type="" class="filter-chip active text-xs px-2.5 py-1 rounded-full border border-gray-200">전체</button>
            <button data-type="pptx" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-powerpoint mr-0.5 text-orange-500"></i>PPT</button>
            <button data-type="pdf" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-pdf mr-0.5 text-red-500"></i>PDF</button>
            <button data-type="xlsx" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-excel mr-0.5 text-green-600"></i>Excel</button>
            <button data-type="csv" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-csv mr-0.5 text-indigo-500"></i>CSV</button>
            <button data-type="ipynb" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-code mr-0.5 text-pink-500"></i>Notebook</button>
          </div>
        </div>
        <div class="mb-4">
          <h4 class="text-xs font-medium text-gray-700 mb-2">프로젝트(사업)</h4>
          <div id="projectFilters" class="space-y-1 max-h-48 overflow-y-auto">
            <button data-project="" class="filter-chip active w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">전체 사업</button>
          </div>
        </div>
        <div>
          <h4 class="text-xs font-medium text-gray-700 mb-2">정렬</h4>
          <select id="sortSelect" class="w-full text-xs border border-gray-200 rounded px-2.5 py-1.5">
            <option value="relevance">관련도순</option>
            <option value="mtime">최근 수정순</option>
          </select>
        </div>
      </div>
    </aside>

    <!-- Center: Results -->
    <main class="flex-1 min-w-0">
      <div id="welcomeScreen" class="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div class="w-16 h-16 mx-auto mb-4 bg-blue-50 rounded-full flex items-center justify-center">
          <i class="fas fa-search text-blue-500 text-2xl"></i>
        </div>
        <h2 class="text-xl font-bold text-gray-800 mb-2">컨설팅 산출물 지식 검색</h2>
        <p class="text-sm text-gray-500 mb-6 max-w-lg mx-auto">
          Google Drive의 PPT, PDF, 엑셀, 노트북 등 산출물의 <strong>내부 텍스트</strong>까지 검색합니다.<br>
          파일명이 아니라 <strong>내용</strong>으로 찾아서, 정확한 <strong>위치</strong>(슬라이드/페이지/시트/행)를 알려드립니다.
        </p>
        <div class="flex flex-wrap justify-center gap-2 mb-6">
          <button class="quick-search px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition"><i class="fas fa-search mr-1 text-gray-400"></i>보건복지부</button>
          <button class="quick-search px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition"><i class="fas fa-search mr-1 text-gray-400"></i>데이터 거버넌스</button>
          <button class="quick-search px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition"><i class="fas fa-search mr-1 text-gray-400"></i>국토교통부</button>
          <button class="quick-search px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition"><i class="fas fa-search mr-1 text-gray-400"></i>AI 도입</button>
          <button class="quick-search px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition"><i class="fas fa-search mr-1 text-gray-400"></i>클라우드</button>
          <button class="quick-search px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition"><i class="fas fa-search mr-1 text-gray-400"></i>인프라 현황</button>
        </div>
        <div id="statsOverview" class="inline-flex items-center gap-4 text-xs text-gray-400"></div>
      </div>

      <div id="resultsContainer" class="hidden">
        <div class="flex items-center justify-between mb-3">
          <div id="resultsHeader" class="text-sm text-gray-600"></div>
        </div>
        <div id="resultsList" class="space-y-2"></div>
        <div id="pagination" class="mt-4 flex items-center justify-center gap-2"></div>
      </div>

      <div id="loadingScreen" class="hidden space-y-2">
        <div class="bg-white rounded-lg border border-gray-200 p-4"><div class="skeleton h-4 w-3/4 rounded mb-2"></div><div class="skeleton h-3 w-1/2 rounded"></div></div>
        <div class="bg-white rounded-lg border border-gray-200 p-4"><div class="skeleton h-4 w-2/3 rounded mb-2"></div><div class="skeleton h-3 w-1/3 rounded"></div></div>
        <div class="bg-white rounded-lg border border-gray-200 p-4"><div class="skeleton h-4 w-4/5 rounded mb-2"></div><div class="skeleton h-3 w-2/5 rounded"></div></div>
      </div>

      <div id="emptyState" class="hidden bg-white rounded-lg border border-gray-200 p-8 text-center">
        <i class="fas fa-folder-open text-4xl text-gray-300 mb-3"></i>
        <h3 class="text-lg font-semibold text-gray-600 mb-1">검색 결과 없음</h3>
        <p class="text-sm text-gray-400" id="emptyMsg">검색어를 변경하거나 필터를 조정해보세요.</p>
      </div>
    </main>

    <!-- Right: Detail Panel -->
    <aside id="detailPanel" class="detail-panel closed w-96 shrink-0 hidden xl:block">
      <div class="bg-white rounded-lg border border-gray-200 p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-file-alt mr-1"></i> 상세 내용</h3>
          <button id="closeDetail" class="text-gray-400 hover:text-gray-600 text-xs"><i class="fas fa-times"></i></button>
        </div>
        <div id="detailContent">
          <p class="text-xs text-gray-400 text-center py-8">결과를 클릭하면 상세 내용이 표시됩니다.</p>
        </div>
      </div>
    </aside>
  </div>

  <!-- Stats Modal -->
  <div id="statsModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-chart-bar mr-2 text-blue-500"></i>인덱싱 현황</h2>
        <button id="closeStats" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      <div id="statsContent" class="space-y-4"><p class="text-sm text-gray-400 text-center py-4">로딩 중...</p></div>
      <div class="mt-4 pt-4 border-t flex gap-2">
        <button id="seedBtn" class="px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition flex-1">
          <i class="fas fa-database mr-1"></i> 데모 데이터 로드
        </button>
      </div>
    </div>
  </div>

  <div id="toast" class="hidden fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all"></div>

  <script src="/static/wiki.js"></script>
</body>
</html>
  `)
})
