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
  <title>Knowledge Wiki - KM-AI 2.0</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/wiki.css" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a5f' },
            accent: { 50:'#f0fdf4',100:'#dcfce7',500:'#22c55e',600:'#16a34a' }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-gray-50 min-h-screen">

  <!-- Header (DBpia style) -->
  <header class="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
    <div class="max-w-7xl mx-auto px-4">
      <!-- Top bar -->
      <div class="flex items-center justify-between py-2 border-b border-gray-100">
        <div class="flex items-center gap-3 cursor-pointer" onclick="showView('home')">
          <div class="w-9 h-9 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center shadow-sm">
            <i class="fas fa-brain text-white text-sm"></i>
          </div>
          <div>
            <h1 class="text-lg font-bold text-gray-900 leading-none tracking-tight">Knowledge Wiki</h1>
            <p class="text-[10px] text-gray-400 leading-none mt-0.5">KM-AI 2.0 | Consulting Knowledge Platform</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="showView('home')" class="nav-btn px-3 py-1.5 text-xs rounded-md hover:bg-gray-100 transition" data-view="home">
            <i class="fas fa-home mr-1"></i>홈
          </button>
          <button onclick="showView('browse')" class="nav-btn px-3 py-1.5 text-xs rounded-md hover:bg-gray-100 transition" data-view="browse">
            <i class="fas fa-th-large mr-1"></i>브라우징
          </button>
          <button onclick="showView('dashboard')" class="nav-btn px-3 py-1.5 text-xs rounded-md hover:bg-gray-100 transition" data-view="dashboard">
            <i class="fas fa-chart-line mr-1"></i>대시보드
          </button>
          <button onclick="showView('ask')" class="nav-btn px-3 py-1.5 text-xs rounded-md hover:bg-gray-100 transition" data-view="ask">
            <i class="fas fa-robot mr-1"></i>AI Q&A
          </button>
          <button id="seedBtnTop" class="px-3 py-1.5 text-xs text-primary-600 hover:bg-primary-50 rounded-md transition">
            <i class="fas fa-database mr-1"></i>데모 로드
          </button>
          <div class="w-px h-5 bg-gray-200 mx-1"></div>
          <!-- Auth: Not logged in -->
          <div id="authGuest" class="flex items-center gap-1">
            <button onclick="showView('login')" class="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition">
              <i class="fas fa-sign-in-alt mr-1"></i>로그인
            </button>
            <button onclick="showView('register')" class="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 transition">
              <i class="fas fa-user-plus mr-1"></i>회원가입
            </button>
          </div>
          <!-- Auth: Logged in -->
          <div id="authUser" class="hidden relative">
            <button id="userMenuBtn" class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:bg-gray-100 transition">
              <img id="userAvatar" src="" class="w-6 h-6 rounded-full object-cover border border-gray-200 hidden" alt="">
              <span id="userAvatarPlaceholder" class="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold"></span>
              <span id="userName" class="font-medium text-gray-700 max-w-[80px] truncate"></span>
              <i class="fas fa-chevron-down text-[8px] text-gray-400"></i>
            </button>
            <div id="userDropdown" class="hidden absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2">
              <div class="px-4 py-2 border-b border-gray-100">
                <p id="dropdownName" class="text-sm font-medium text-gray-800"></p>
                <p id="dropdownEmail" class="text-xs text-gray-400 truncate"></p>
                <span id="dropdownProvider" class="inline-block mt-1 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-500"></span>
              </div>
              <button onclick="handleLogout()" class="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition">
                <i class="fas fa-sign-out-alt mr-2"></i>로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- Search bar -->
      <div class="py-3 flex items-center gap-3">
        <div class="flex-1 relative">
          <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input id="searchInput" type="text" 
            placeholder="검색어를 입력하세요 (예: 보건복지부, 데이터 거버넌스, AI 도입...)"
            class="search-input w-full pl-11 pr-28 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-primary-500 bg-gray-50 focus:bg-white transition"
            autocomplete="off">
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button id="searchModeToggle" class="px-2 py-1 text-[11px] rounded transition" title="검색 모드 전환">
              <i class="fas fa-font mr-0.5"></i>FTS
            </button>
            <button id="advancedToggle" class="px-2 py-1 text-[11px] text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition">
              <i class="fas fa-sliders-h mr-0.5"></i>상세
            </button>
            <button id="searchBtn" class="px-4 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition font-medium">
              검색
            </button>
          </div>
        </div>
      </div>
      <!-- Advanced Search (hidden by default) -->
      <div id="advancedSearch" class="hidden pb-3 -mt-1">
        <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select id="filterCategory" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">주제분류 전체</option>
            </select>
            <select id="filterStage" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">문서단계 전체</option>
              <option value="RFP">RFP</option><option value="제안서">제안서</option>
              <option value="착수보고">착수보고</option><option value="중간보고">중간보고</option>
              <option value="최종보고">최종보고</option><option value="산출물">산출물</option>
              <option value="조사자료">조사자료</option><option value="분석코드">분석코드</option>
            </select>
            <select id="filterOrg" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">발주기관 전체</option>
            </select>
            <select id="filterYear" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">연도 전체</option>
              <option value="2025">2025</option><option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- ============ HOME VIEW ============ -->
  <div id="homeView" class="max-w-7xl mx-auto px-4 py-6">
    <!-- Hero -->
    <div class="bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 rounded-2xl p-8 mb-6 text-white relative overflow-hidden">
      <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3"></div>
      <div class="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4"></div>
      <div class="relative z-10">
        <div class="flex items-center gap-2 mb-2">
          <span class="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-medium">v2.0 NEW</span>
          <span class="text-xs text-white/70">자동 메타데이터 태깅 · DBpia 스타일</span>
        </div>
        <h2 class="text-2xl font-bold mb-2">컨설팅 산출물 지식 검색 플랫폼</h2>
        <p class="text-sm text-white/80 mb-5 max-w-xl leading-relaxed">
          Google Drive의 PPT, PDF, 엑셀 등 산출물의 <strong class="text-white">내부 텍스트</strong>까지 검색하고,<br>
          <strong class="text-white">자동 태깅된 메타데이터</strong>로 주제·기관·단계별 탐색이 가능합니다.
        </p>
        <div class="flex flex-wrap gap-2">
          <button class="quick-search px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs transition border border-white/20">
            <i class="fas fa-search mr-1.5 opacity-60"></i>보건복지부
          </button>
          <button class="quick-search px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs transition border border-white/20">
            <i class="fas fa-search mr-1.5 opacity-60"></i>데이터 거버넌스
          </button>
          <button class="quick-search px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs transition border border-white/20">
            <i class="fas fa-search mr-1.5 opacity-60"></i>AI 도입
          </button>
          <button class="quick-search px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs transition border border-white/20">
            <i class="fas fa-search mr-1.5 opacity-60"></i>클라우드
          </button>
          <button class="quick-search px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs transition border border-white/20">
            <i class="fas fa-search mr-1.5 opacity-60"></i>인프라 현황
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Cards -->
    <div id="homeStats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"></div>

    <!-- Two Column: Tag Cloud + Trending -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <!-- Tag Cloud -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-tags mr-1.5 text-primary-500"></i>인기 태그</h3>
        <div id="tagCloud" class="flex flex-wrap gap-1.5">
          <span class="text-xs text-gray-400">데이터 로드 필요</span>
        </div>
      </div>

      <!-- Category Browse -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-folder-tree mr-1.5 text-accent-500"></i>주제분류</h3>
        <div id="categoryList" class="space-y-1.5">
          <span class="text-xs text-gray-400">데이터 로드 필요</span>
        </div>
      </div>

      <!-- Trending -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-fire mr-1.5 text-orange-500"></i>인기 문서</h3>
        <div id="trendingList" class="space-y-2">
          <span class="text-xs text-gray-400">데이터 로드 필요</span>
        </div>
      </div>
    </div>

    <!-- Projects Grid -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-briefcase mr-1.5 text-primary-600"></i>프로젝트(사업) 목록</h3>
      <div id="projectGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <span class="text-xs text-gray-400">데이터 로드 필요</span>
      </div>
    </div>
  </div>

  <!-- ============ SEARCH RESULTS VIEW ============ -->
  <div id="searchView" class="hidden max-w-7xl mx-auto px-4 py-4">
    <div class="flex gap-4">
      <!-- Left: Filters -->
      <aside id="filterPanel" class="w-60 shrink-0 hidden lg:block">
        <div class="bg-white rounded-xl border border-gray-200 p-4 sticky top-36 space-y-4">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider"><i class="fas fa-filter mr-1"></i>필터</h3>
          
          <div>
            <h4 class="text-xs font-medium text-gray-700 mb-2">파일 유형</h4>
            <div id="typeFilters" class="flex flex-wrap gap-1.5">
              <button data-type="" class="filter-chip active text-xs px-2.5 py-1 rounded-full border border-gray-200">전체</button>
              <button data-type="pptx" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-powerpoint mr-0.5 text-orange-500"></i>PPT</button>
              <button data-type="pdf" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-pdf mr-0.5 text-red-500"></i>PDF</button>
              <button data-type="xlsx" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-excel mr-0.5 text-green-600"></i>Excel</button>
              <button data-type="csv" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-file-csv mr-0.5 text-indigo-500"></i>CSV</button>
              <button data-type="ipynb" class="filter-chip text-xs px-2.5 py-1 rounded-full border border-gray-200"><i class="fas fa-code mr-0.5 text-pink-500"></i>NB</button>
            </div>
          </div>

          <div>
            <h4 class="text-xs font-medium text-gray-700 mb-2">프로젝트</h4>
            <div id="projectFilters" class="space-y-1 max-h-40 overflow-y-auto">
              <button data-project="" class="filter-chip active w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">전체 사업</button>
            </div>
          </div>

          <div>
            <h4 class="text-xs font-medium text-gray-700 mb-2">주제분류</h4>
            <div id="categoryFilters" class="space-y-1 max-h-40 overflow-y-auto">
              <button data-category="" class="filter-chip active w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">전체</button>
            </div>
          </div>

          <div>
            <h4 class="text-xs font-medium text-gray-700 mb-2">정렬</h4>
            <select id="sortSelect" class="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2">
              <option value="relevance">관련도순</option>
              <option value="mtime">최근 수정순</option>
              <option value="views">인기순</option>
              <option value="importance">중요도순</option>
            </select>
          </div>
        </div>
      </aside>

      <!-- Center: Results -->
      <main class="flex-1 min-w-0">
        <div id="resultsContainer" class="hidden">
          <div class="flex items-center justify-between mb-3">
            <div id="resultsHeader" class="text-sm text-gray-600"></div>
            <div id="activeFilters" class="flex flex-wrap gap-1"></div>
          </div>
          <div id="resultsList" class="space-y-2"></div>
          <div id="pagination" class="mt-4 flex items-center justify-center gap-2"></div>
        </div>

        <div id="loadingScreen" class="hidden space-y-2">
          <div class="bg-white rounded-xl border border-gray-200 p-4"><div class="skeleton h-4 w-3/4 rounded mb-2"></div><div class="skeleton h-3 w-1/2 rounded"></div></div>
          <div class="bg-white rounded-xl border border-gray-200 p-4"><div class="skeleton h-4 w-2/3 rounded mb-2"></div><div class="skeleton h-3 w-1/3 rounded"></div></div>
          <div class="bg-white rounded-xl border border-gray-200 p-4"><div class="skeleton h-4 w-4/5 rounded mb-2"></div><div class="skeleton h-3 w-2/5 rounded"></div></div>
        </div>

        <div id="emptyState" class="hidden bg-white rounded-xl border border-gray-200 p-8 text-center">
          <i class="fas fa-folder-open text-4xl text-gray-300 mb-3"></i>
          <h3 class="text-lg font-semibold text-gray-600 mb-1">검색 결과 없음</h3>
          <p class="text-sm text-gray-400" id="emptyMsg">검색어를 변경하거나 필터를 조정해보세요.</p>
        </div>
      </main>

      <!-- Right: Detail Panel -->
      <aside id="detailPanel" class="w-[420px] shrink-0 hidden xl:block">
        <div class="bg-white rounded-xl border border-gray-200 sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-file-alt mr-1"></i>문서 상세</h3>
            <button id="closeDetail" class="text-gray-400 hover:text-gray-600 text-xs"><i class="fas fa-times"></i></button>
          </div>
          <div id="detailContent" class="p-4">
            <p class="text-xs text-gray-400 text-center py-8">결과를 클릭하면 상세 내용이 표시됩니다.</p>
          </div>
        </div>
      </aside>
    </div>
  </div>

  <!-- ============ BROWSE VIEW ============ -->
  <div id="browseView" class="hidden max-w-7xl mx-auto px-4 py-6">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-th-large mr-2 text-primary-600"></i>주제별 브라우징</h2>
        <div id="browseActiveProject" class="hidden mt-1 text-xs text-primary-600">
          <i class="fas fa-folder-open mr-1"></i><span id="browseProjectLabel"></span>
          <button onclick="clearBrowseProject()" class="ml-2 text-gray-400 hover:text-red-500"><i class="fas fa-times-circle"></i></button>
        </div>
      </div>
      <div class="flex gap-2">
        <select id="browseCategory" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">전체 주제</option>
        </select>
        <select id="browseStage" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">전체 단계</option>
          <option value="RFP">RFP</option><option value="제안서">제안서</option>
          <option value="최종보고">최종보고</option><option value="산출물">산출물</option>
          <option value="조사자료">조사자료</option><option value="분석코드">분석코드</option>
        </select>
        <select id="browseSort" class="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="mtime">최신순</option>
          <option value="views">인기순</option>
          <option value="importance">중요도순</option>
        </select>
      </div>
    </div>
    <div id="browseResults" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"></div>
    <div id="browsePagination" class="mt-4 flex items-center justify-center gap-2"></div>
  </div>

  <!-- ============ DASHBOARD VIEW ============ -->
  <div id="dashboardView" class="hidden max-w-7xl mx-auto px-4 py-6">
    <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-chart-line mr-2 text-primary-600"></i>대시보드</h2>
    <div id="dashboardContent" class="space-y-4"></div>
  </div>

  <!-- ============ AI Q&A VIEW ============ -->
  <div id="askView" class="hidden max-w-4xl mx-auto px-4 py-6">
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <!-- Header -->
      <div class="bg-gradient-to-r from-purple-600 to-indigo-700 p-5 text-white">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-robot text-lg"></i>
          </div>
          <div>
            <h2 class="text-lg font-bold">AI Knowledge Assistant</h2>
            <p class="text-xs text-white/70">컨설팅 산출물 기반 RAG Q&A - 문서 컨텍스트로 답변합니다</p>
          </div>
        </div>
        <div id="embeddingStatus" class="mt-3 text-xs text-white/60">
          <i class="fas fa-circle-notch fa-spin mr-1"></i>임베딩 상태 확인 중...
        </div>
      </div>
      
      <!-- Chat area -->
      <div id="chatHistory" class="p-5 space-y-4 max-h-[500px] overflow-y-auto bg-gray-50">
        <div class="text-center py-8">
          <i class="fas fa-comments text-4xl text-gray-200 mb-3"></i>
          <p class="text-sm text-gray-400">질문을 입력하면 관련 문서를 찾아 답변합니다.</p>
          <div class="flex flex-wrap justify-center gap-2 mt-4">
            <button class="ask-suggestion px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition">
              보건복지부 데이터 현황은?
            </button>
            <button class="ask-suggestion px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition">
              AI 도입률이 가장 높은 분야는?
            </button>
            <button class="ask-suggestion px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition">
              데이터 거버넌스 성숙도 분석 결과
            </button>
            <button class="ask-suggestion px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition">
              클라우드 전환율은?
            </button>
          </div>
        </div>
      </div>
      
      <!-- Input -->
      <div class="p-4 border-t border-gray-200 bg-white">
        <div class="flex gap-2">
          <input id="askInput" type="text" 
            placeholder="컨설팅 산출물에 대해 질문하세요..."
            class="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-purple-500 bg-gray-50 focus:bg-white transition"
            autocomplete="off">
          <button id="askBtn" class="px-5 py-2.5 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 transition font-medium shrink-0">
            <i class="fas fa-paper-plane mr-1"></i>질문
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ LOGIN VIEW ============ -->
  <div id="loginView" class="hidden max-w-md mx-auto px-4 py-12">
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div class="bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white text-center">
        <div class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <i class="fas fa-sign-in-alt text-2xl"></i>
        </div>
        <h2 class="text-xl font-bold">로그인</h2>
        <p class="text-xs text-white/70 mt-1">Knowledge Wiki에 로그인하세요</p>
      </div>
      <div class="p-6 space-y-4">
        <!-- Social Login Buttons -->
        <div id="socialLoginBtns" class="space-y-2">
          <button onclick="socialLogin('kakao')" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border border-gray-200 hover:shadow-md" style="background:#FEE500;color:#191919">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#191919" d="M9 1C4.58 1 1 3.87 1 7.35c0 2.17 1.4 4.08 3.53 5.2l-.9 3.32a.2.2 0 00.3.22l3.75-2.5c.43.05.87.08 1.32.08 4.42 0 8-2.87 8-6.32S13.42 1 9 1z"/></svg>
            카카오 로그인
          </button>
          <button onclick="socialLogin('naver')" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border border-gray-200 hover:shadow-md" style="background:#03C75A;color:#FFF">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#FFF" d="M12.16 9.63L5.56 0H0v18h5.84V8.37L12.44 18H18V0h-5.84z"/></svg>
            네이버 로그인
          </button>
          <button onclick="socialLogin('google')" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border border-gray-200 hover:shadow-md bg-white text-gray-700">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.25-.164-1.84H9v3.48h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.614z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Google 로그인
          </button>
        </div>

        <!-- Divider -->
        <div class="flex items-center gap-3">
          <div class="flex-1 h-px bg-gray-200"></div>
          <span class="text-xs text-gray-400">또는 이메일로</span>
          <div class="flex-1 h-px bg-gray-200"></div>
        </div>

        <!-- Email Login Form -->
        <form id="loginForm" onsubmit="handleEmailLogin(event)" class="space-y-3">
          <div>
            <input id="loginEmail" type="email" placeholder="이메일" required
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 bg-gray-50 focus:bg-white transition">
          </div>
          <div>
            <input id="loginPassword" type="password" placeholder="비밀번호" required minlength="6"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 bg-gray-50 focus:bg-white transition">
          </div>
          <div id="loginError" class="hidden text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2"></div>
          <button type="submit" class="w-full py-3 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition">
            <i class="fas fa-sign-in-alt mr-2"></i>이메일로 로그인
          </button>
        </form>

        <p class="text-center text-xs text-gray-400">
          계정이 없으신가요? <button onclick="showView('register')" class="text-primary-600 hover:underline font-medium">회원가입</button>
        </p>
      </div>
    </div>
  </div>

  <!-- ============ REGISTER VIEW ============ -->
  <div id="registerView" class="hidden max-w-md mx-auto px-4 py-12">
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div class="bg-gradient-to-r from-accent-500 to-green-600 p-6 text-white text-center">
        <div class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <i class="fas fa-user-plus text-2xl"></i>
        </div>
        <h2 class="text-xl font-bold">회원가입</h2>
        <p class="text-xs text-white/70 mt-1">Knowledge Wiki 계정을 만드세요</p>
      </div>
      <div class="p-6 space-y-4">
        <!-- Social Register -->
        <div class="space-y-2">
          <button onclick="socialLogin('kakao')" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border border-gray-200 hover:shadow-md" style="background:#FEE500;color:#191919">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#191919" d="M9 1C4.58 1 1 3.87 1 7.35c0 2.17 1.4 4.08 3.53 5.2l-.9 3.32a.2.2 0 00.3.22l3.75-2.5c.43.05.87.08 1.32.08 4.42 0 8-2.87 8-6.32S13.42 1 9 1z"/></svg>
            카카오로 시작
          </button>
          <button onclick="socialLogin('naver')" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border border-gray-200 hover:shadow-md" style="background:#03C75A;color:#FFF">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#FFF" d="M12.16 9.63L5.56 0H0v18h5.84V8.37L12.44 18H18V0h-5.84z"/></svg>
            네이버로 시작
          </button>
          <button onclick="socialLogin('google')" class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition border border-gray-200 hover:shadow-md bg-white text-gray-700">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.25-.164-1.84H9v3.48h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.614z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Google로 시작
          </button>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex-1 h-px bg-gray-200"></div>
          <span class="text-xs text-gray-400">또는 이메일로</span>
          <div class="flex-1 h-px bg-gray-200"></div>
        </div>

        <!-- Email Register Form -->
        <form id="registerForm" onsubmit="handleEmailRegister(event)" class="space-y-3">
          <div>
            <input id="regName" type="text" placeholder="이름" required
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 bg-gray-50 focus:bg-white transition">
          </div>
          <div>
            <input id="regEmail" type="email" placeholder="이메일" required
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 bg-gray-50 focus:bg-white transition">
          </div>
          <div>
            <input id="regPassword" type="password" placeholder="비밀번호 (6자 이상)" required minlength="6"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 bg-gray-50 focus:bg-white transition">
          </div>
          <div>
            <input id="regPasswordConfirm" type="password" placeholder="비밀번호 확인" required minlength="6"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 bg-gray-50 focus:bg-white transition">
          </div>
          <div id="registerError" class="hidden text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2"></div>
          <button type="submit" class="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition">
            <i class="fas fa-user-plus mr-2"></i>이메일로 가입하기
          </button>
        </form>

        <p class="text-center text-xs text-gray-400">
          이미 계정이 있으신가요? <button onclick="showView('login')" class="text-primary-600 hover:underline font-medium">로그인</button>
        </p>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" class="hidden fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all"></div>

  <script src="/static/wiki.js"></script>
</body>
</html>
  `)
})
