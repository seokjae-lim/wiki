// =============================================
// Knowledge Wiki v3.0 - Frontend Logic
// Semantic Search + AI Q&A + DBpia-style UI
// =============================================
(function() {
  'use strict';

  // State
  var state = { query: '', type: '', project: '', category: '', tag: '', doc_stage: '', org: '', year: '', sort: 'relevance', page: 1, limit: 20, total: 0, results: [], currentView: 'home', browseProject: '', searchMode: 'fts' };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }
  var API = '';

  // ============ API Helpers ============
  function api(path) { return fetch(API + path).then(function(r) { return r.json(); }); }
  function apiPost(path) { return fetch(API + path, { method: 'POST' }).then(function(r) { return r.json(); }); }

  // ============ VIEW MANAGEMENT ============
  window.showView = function(view) {
    state.currentView = view;
    ['homeView', 'searchView', 'browseView', 'dashboardView', 'askView'].forEach(function(id) {
      var el = $('#' + id);
      if (el) el.classList.add('hidden');
    });
    $$('.nav-btn').forEach(function(b) { b.classList.remove('active'); });

    if (view === 'home') {
      $('#homeView').classList.remove('hidden');
      $('[data-view="home"]').classList.add('active');
      loadHome();
    } else if (view === 'search') {
      $('#searchView').classList.remove('hidden');
    } else if (view === 'browse') {
      $('#browseView').classList.remove('hidden');
      $('[data-view="browse"]').classList.add('active');
      loadBrowse();
    } else if (view === 'dashboard') {
      $('#dashboardView').classList.remove('hidden');
      $('[data-view="dashboard"]').classList.add('active');
      loadDashboard();
    } else if (view === 'ask') {
      $('#askView').classList.remove('hidden');
      $('[data-view="ask"]').classList.add('active');
      loadAskView();
    }
  };

  // ============ HOME ============
  function loadHome() {
    // Stats
    api('/api/stats').then(function(s) {
      var h = '';
      h += statCard('문서 청크', s.total_chunks, 'fas fa-layer-group', 'primary');
      h += statCard('파일 수', s.total_files, 'fas fa-file-alt', 'green');
      h += statCard('주제분류', (s.by_category || []).length, 'fas fa-tags', 'purple');
      h += statCard('프로젝트', (s.by_project || []).length, 'fas fa-briefcase', 'orange');
      $('#homeStats').innerHTML = h;
    }).catch(function() { $('#homeStats').innerHTML = '<div class="col-span-4 text-center text-xs text-amber-500 py-4"><i class="fas fa-exclamation-triangle mr-1"></i>데이터가 없습니다. "데모 로드" 버튼을 클릭하세요.</div>'; });

    // Tag cloud
    api('/api/tags').then(function(d) {
      if (!d.tags || d.tags.length === 0) { $('#tagCloud').innerHTML = '<span class="text-xs text-gray-400">태그 없음</span>'; return; }
      var max = d.tags[0].count;
      var h = '';
      d.tags.slice(0, 25).forEach(function(t) {
        var sz = t.count >= max * 0.7 ? 'tag-cloud-lg' : t.count >= max * 0.3 ? 'tag-cloud-md' : 'tag-cloud-sm';
        h += '<button class="tag-chip ' + sz + '" onclick="searchByTag(\'' + esc(t.tag) + '\')">' + esc(t.tag) + ' <span class="opacity-50">' + t.count + '</span></button>';
      });
      $('#tagCloud').innerHTML = h;
    }).catch(function() {});

    // Categories
    api('/api/categories').then(function(d) {
      if (!d.categories || d.categories.length === 0) { $('#categoryList').innerHTML = '<span class="text-xs text-gray-400">분류 없음</span>'; return; }
      var cats = {};
      d.categories.forEach(function(c) { cats[c.category] = (cats[c.category] || 0) + c.count; });
      var h = '';
      Object.entries(cats).sort(function(a,b) { return b[1]-a[1]; }).forEach(function(e) {
        h += '<button onclick="browseByCategory(\'' + esc(e[0]) + '\')" class="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-50 transition text-xs">' +
          '<span class="flex items-center gap-2"><span class="cat-badge cat-' + esc(e[0]) + '">' + esc(e[0]) + '</span></span>' +
          '<span class="text-gray-400">' + e[1] + '건</span></button>';
      });
      $('#categoryList').innerHTML = h;

      // Also populate filter dropdowns
      var opt = '<option value="">주제분류 전체</option>';
      Object.keys(cats).forEach(function(k) { opt += '<option value="' + esc(k) + '">' + esc(k) + ' (' + cats[k] + ')</option>'; });
      if ($('#filterCategory')) $('#filterCategory').innerHTML = opt;
      if ($('#browseCategory')) { $('#browseCategory').innerHTML = opt; }
      populateCategoryFilters(cats);
    }).catch(function() {});

    // Trending
    api('/api/trending').then(function(d) {
      if (!d.popular || d.popular.length === 0) { $('#trendingList').innerHTML = '<span class="text-xs text-gray-400">데이터 없음</span>'; return; }
      var h = '';
      d.popular.slice(0, 6).forEach(function(p, i) {
        h += '<div class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 transition" onclick="showDocDetail(\'' + esc(p.chunk_id) + '\')">' +
          '<span class="text-xs font-bold w-5 text-center ' + (i < 3 ? 'text-primary-600' : 'text-gray-400') + '">' + (i + 1) + '</span>' +
          '<div class="flex-1 min-w-0">' +
          '<p class="text-xs font-medium text-gray-800 truncate">' + esc(p.doc_title) + '</p>' +
          '<div class="flex items-center gap-1.5">' +
          '<span class="type-badge type-' + esc(p.file_type) + '">' + (p.file_type || '').toUpperCase() + '</span>' +
          '<span class="text-[10px] text-gray-400">' + esc(p.project_path) + '</span>' +
          '</div></div>' +
          '<span class="text-[10px] text-gray-400 shrink-0"><i class="fas fa-eye mr-0.5"></i>' + (p.view_count || 0) + '</span></div>';
      });
      $('#trendingList').innerHTML = h;
    }).catch(function() {});

    // Projects
    api('/api/projects').then(function(d) {
      if (!d.projects || d.projects.length === 0) { $('#projectGrid').innerHTML = '<span class="text-xs text-gray-400 col-span-3">데이터 없음</span>'; return; }
      var colors = ['from-blue-500 to-blue-700', 'from-emerald-500 to-emerald-700', 'from-purple-500 to-purple-700', 'from-orange-500 to-orange-700', 'from-pink-500 to-pink-700'];
      var h = '';
      d.projects.forEach(function(p, i) {
        var c = colors[i % colors.length];
        h += '<div class="browse-card bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer" onclick="browseByProject(\'' + esc(p.project_path) + '\')">' +
          '<div class="h-2 bg-gradient-to-r ' + c + '"></div>' +
          '<div class="p-4"><h4 class="text-sm font-bold text-gray-800 mb-1">' + esc(p.project_path) + '</h4>' +
          '<div class="flex items-center gap-3 text-[10px] text-gray-400">' +
          '<span><i class="fas fa-file mr-0.5"></i>' + p.file_count + ' files</span>' +
          '<span><i class="fas fa-layer-group mr-0.5"></i>' + p.chunk_count + ' chunks</span>' +
          (p.start_year ? '<span><i class="fas fa-calendar mr-0.5"></i>' + p.start_year + '</span>' : '') +
          '</div></div></div>';
      });
      $('#projectGrid').innerHTML = h;
      loadProjectFilters(d.projects);
    }).catch(function() {});

    // Orgs for filter
    api('/api/orgs').then(function(d) {
      if (d.orgs && d.orgs.length > 0) {
        var opt = '<option value="">발주기관 전체</option>';
        d.orgs.forEach(function(o) { opt += '<option value="' + esc(o.org) + '">' + esc(o.org) + ' (' + o.count + ')</option>'; });
        if ($('#filterOrg')) $('#filterOrg').innerHTML = opt;
      }
    }).catch(function() {});
  }

  function statCard(label, value, icon, color) {
    var colorMap = { primary: ['bg-blue-50', 'text-blue-600', 'text-blue-800'], green: ['bg-emerald-50', 'text-emerald-600', 'text-emerald-800'], purple: ['bg-purple-50', 'text-purple-600', 'text-purple-800'], orange: ['bg-orange-50', 'text-orange-600', 'text-orange-800'] };
    var c = colorMap[color] || colorMap.primary;
    return '<div class="stat-card ' + c[0] + ' rounded-xl p-4 border border-gray-100">' +
      '<div class="flex items-center justify-between mb-2"><i class="' + icon + ' ' + c[1] + ' text-lg"></i></div>' +
      '<div class="text-2xl font-bold ' + c[2] + '">' + Number(value || 0).toLocaleString() + '</div>' +
      '<div class="text-[10px] text-gray-500 mt-0.5">' + label + '</div></div>';
  }

  // ============ SEARCH ============
  function doSearch() {
    var q = $('#searchInput').value.trim();
    if (!q) return;
    state.query = q;
    state.category = $('#filterCategory') ? $('#filterCategory').value : '';
    state.doc_stage = $('#filterStage') ? $('#filterStage').value : '';
    state.org = $('#filterOrg') ? $('#filterOrg').value : '';
    state.year = $('#filterYear') ? $('#filterYear').value : '';

    showView('search');
    showLoading();

    if (state.searchMode === 'semantic') {
      // Semantic search
      var params = new URLSearchParams({ q: q, type: state.type, project: state.project, category: state.category, limit: String(state.limit) });
      api('/api/semantic-search?' + params).then(function(data) {
        state.results = data.results || [];
        state.total = data.total || 0;
        if (state.results.length > 0) renderResults(true);
        else showEmpty(q, data.hint || '시맨틱 검색 결과 없음. 임베딩이 생성되었는지 확인하세요.');
      }).catch(function() { showEmpty(q, '시맨틱 검색 오류. 먼저 "데모 로드"를 클릭하세요.'); });
    } else {
      // FTS search (original)
      var params = new URLSearchParams({ q: q, type: state.type, project: state.project, category: state.category, tag: state.tag, doc_stage: state.doc_stage, org: state.org, year: state.year, sort: state.sort, page: String(state.page), limit: String(state.limit) });
      api('/api/search?' + params).then(function(data) {
        state.results = data.results || [];
        state.total = data.total || 0;
        if (state.results.length > 0) renderResults(false);
        else showEmpty(q);
      }).catch(function() { showEmpty(q, '검색 오류. 먼저 "데모 로드"를 클릭하세요.'); });
    }
  }

  function renderResults(isSemantic) {
    $('#loadingScreen').classList.add('hidden');
    $('#emptyState').classList.add('hidden');
    $('#resultsContainer').classList.remove('hidden');

    var from = (state.page - 1) * state.limit + 1;
    var to = Math.min(state.page * state.limit, state.total);
    var modeLabel = isSemantic ? '<span class="text-purple-500 text-xs ml-2"><i class="fas fa-brain mr-0.5"></i>시맨틱</span>' : '<span class="text-blue-500 text-xs ml-2"><i class="fas fa-font mr-0.5"></i>FTS</span>';
    $('#resultsHeader').innerHTML = '<span class="font-semibold text-gray-800">"' + esc(state.query) + '"</span> 검색결과 <span class="font-bold text-primary-600">' + state.total + '건</span>' + modeLabel + (state.total > state.limit ? ' <span class="text-gray-400">(' + from + '-' + to + ')</span>' : '');

    var h = '';
    state.results.forEach(function(r, i) {
      var tags = [];
      try { tags = JSON.parse(r.tags || '[]'); } catch(e) {}

      h += '<div class="result-card fade-in bg-white rounded-xl border border-gray-200 p-4 cursor-pointer" data-chunk-id="' + esc(r.chunk_id) + '" style="animation-delay:' + (i * 30) + 'ms">' +
        '<div class="flex items-start gap-3">' +
          '<div class="shrink-0 mt-0.5">' + getFileIcon(r.file_type) + '</div>' +
          '<div class="min-w-0 flex-1">' +
            // Title row
            '<h4 class="text-sm font-semibold text-gray-800 mb-1">' + esc(r.doc_title || r.file_path) + '</h4>' +
            // Badges row
            '<div class="flex items-center gap-1.5 mb-1.5 flex-wrap">' +
              '<span class="type-badge type-' + esc(r.file_type) + '">' + (r.file_type || '').toUpperCase() + '</span>' +
              '<span class="loc-badge">' + getLocIcon(r.location_type) + ' ' + esc(r.location_detail || '') + '</span>' +
              (r.category ? '<span class="cat-badge cat-' + esc(r.category) + '">' + esc(r.category) + '</span>' : '') +
              (r.doc_stage ? '<span class="stage-badge stage-' + esc(r.doc_stage) + '">' + esc(r.doc_stage) + '</span>' : '') +
              (r.org ? '<span class="text-[10px] text-gray-400"><i class="fas fa-building mr-0.5"></i>' + esc(r.org) + '</span>' : '') +
            '</div>' +
            // Path
            '<p class="text-[10px] text-gray-400 truncate mb-1.5 mono">' + esc(r.file_path) + '</p>' +
            // Snippet
            '<div class="text-xs text-gray-600 leading-relaxed line-clamp-2">' + (r.snippet || esc((r.text || '').substring(0, 200))) + '</div>' +
            // Tags
            (tags.length > 0 ? '<div class="flex flex-wrap gap-1 mt-2">' + tags.slice(0, 5).map(function(t) { return '<span class="tag-chip" onclick="event.stopPropagation();searchByTag(\'' + esc(t) + '\')">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
            // Importance & views
            '<div class="flex items-center gap-3 mt-2 text-[10px] text-gray-400">' +
              (isSemantic && r.similarity ? '<span title="유사도" class="text-purple-500 font-medium"><i class="fas fa-brain mr-0.5"></i>' + Math.round(r.similarity * 100) + '%</span>' : '') +
              (r.importance ? '<span title="중요도"><i class="fas fa-star mr-0.5 text-yellow-400"></i>' + r.importance + '</span>' : '') +
              (r.view_count ? '<span title="조회수"><i class="fas fa-eye mr-0.5"></i>' + r.view_count + '</span>' : '') +
              (r.mtime ? '<span><i class="fas fa-clock mr-0.5"></i>' + esc(r.mtime).substring(0, 10) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<button class="copy-path shrink-0 p-1.5 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" data-path="' + esc(r.file_path) + '" title="경로 복사"><i class="fas fa-copy text-xs"></i></button>' +
        '</div></div>';
    });
    $('#resultsList').innerHTML = h;
    renderPagination();

    $$('.result-card').forEach(function(c) {
      c.addEventListener('click', function(e) {
        if (e.target.closest('.copy-path') || e.target.closest('.tag-chip')) return;
        $$('.result-card').forEach(function(r) { r.classList.remove('ring-2', 'ring-primary-300'); });
        c.classList.add('ring-2', 'ring-primary-300');
        showDetail(c.dataset.chunkId);
      });
    });

    $$('.copy-path').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(b.dataset.path).then(function() { toast('경로 복사 완료', 'success'); });
      });
    });
  }

  function renderPagination() {
    var tp = Math.ceil(state.total / state.limit);
    var el = $('#pagination');
    if (tp <= 1) { el.innerHTML = ''; return; }
    var h = '';
    if (state.page > 1) h += '<button class="page-btn px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100" data-page="' + (state.page - 1) + '"><i class="fas fa-chevron-left"></i></button>';
    var s = Math.max(1, state.page - 2), e = Math.min(tp, state.page + 2);
    for (var p = s; p <= e; p++) {
      var a = p === state.page ? 'bg-primary-600 text-white border-primary-600' : 'hover:bg-gray-100';
      h += '<button class="page-btn px-3 py-1.5 text-xs border rounded-lg ' + a + '" data-page="' + p + '">' + p + '</button>';
    }
    if (state.page < tp) h += '<button class="page-btn px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100" data-page="' + (state.page + 1) + '"><i class="fas fa-chevron-right"></i></button>';
    el.innerHTML = h;
    $$('.page-btn').forEach(function(b) { b.addEventListener('click', function() { state.page = parseInt(b.dataset.page); doSearch(); }); });
  }

  // ============ DETAIL PANEL ============
  function showDetail(chunkId) {
    var dp = $('#detailPanel');
    dp.classList.remove('hidden');
    $('#detailContent').innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-gray-400 text-lg"></i></div>';

    api('/api/doc/' + chunkId).then(function(doc) {
      if (doc.error) { $('#detailContent').innerHTML = '<p class="text-xs text-red-400">' + doc.error + '</p>'; return; }
      var tags = [];
      try { tags = JSON.parse(doc.tags || '[]'); } catch(e) {}

      var h = '<div class="space-y-4">';
      
      // Title & badges
      h += '<div><h3 class="text-base font-bold text-gray-800 mb-2">' + esc(doc.doc_title || '') + '</h3>' +
        '<div class="flex items-center gap-1.5 flex-wrap">' +
        '<span class="type-badge type-' + esc(doc.file_type) + '">' + (doc.file_type || '').toUpperCase() + '</span>' +
        '<span class="loc-badge">' + esc(doc.location_detail || '') + '</span>' +
        (doc.category ? '<span class="cat-badge cat-' + esc(doc.category) + '">' + esc(doc.category) + '</span>' : '') +
        (doc.doc_stage ? '<span class="stage-badge stage-' + esc(doc.doc_stage) + '">' + esc(doc.doc_stage) + '</span>' : '') +
        '</div></div>';

      // Summary
      if (doc.summary) {
        h += '<div class="bg-blue-50 rounded-lg p-3 border border-blue-100">' +
          '<h4 class="text-[10px] font-semibold text-blue-600 mb-1"><i class="fas fa-lightbulb mr-1"></i>요약</h4>' +
          '<p class="text-xs text-blue-800 leading-relaxed">' + esc(doc.summary) + '</p></div>';
      }

      // Metadata grid
      h += '<div class="bg-gray-50 rounded-lg p-3"><h4 class="text-[10px] font-semibold text-gray-500 mb-2"><i class="fas fa-info-circle mr-1"></i>서지정보</h4><div class="meta-grid">';
      h += metaRow('경로', doc.file_path);
      h += metaRow('프로젝트', doc.project_path);
      if (doc.author) h += metaRow('작성자', doc.author);
      if (doc.org) h += metaRow('발주기관', doc.org);
      if (doc.doc_year) h += metaRow('사업연도', doc.doc_year);
      if (doc.mtime) h += metaRow('수정일', doc.mtime);
      if (doc.importance) h += metaRow('중요도', doc.importance + '/100');
      h += metaRow('조회수', doc.view_count || 0);
      h += '</div></div>';

      // Importance bar
      if (doc.importance) {
        var impColor = doc.importance >= 80 ? '#22c55e' : doc.importance >= 60 ? '#eab308' : '#94a3b8';
        h += '<div><h4 class="text-[10px] font-semibold text-gray-500 mb-1">중요도</h4>' +
          '<div class="importance-bar"><div class="importance-fill" style="width:' + doc.importance + '%;background:' + impColor + '"></div></div></div>';
      }

      // Tags
      if (tags.length > 0) {
        h += '<div><h4 class="text-[10px] font-semibold text-gray-500 mb-1.5"><i class="fas fa-tags mr-1"></i>태그</h4>' +
          '<div class="flex flex-wrap gap-1">' + tags.map(function(t) { return '<span class="tag-chip" onclick="searchByTag(\'' + esc(t) + '\')">' + esc(t) + '</span>'; }).join('') + '</div></div>';
      }

      // Full text
      h += '<div><h4 class="text-[10px] font-semibold text-gray-500 mb-1.5"><i class="fas fa-align-left mr-1"></i>전체 텍스트</h4>' +
        '<div class="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg whitespace-pre-wrap mono border border-gray-100">' +
        highlight(doc.text || '', state.query) + '</div></div>';

      // Related
      if (doc.related && doc.related.length > 0) {
        h += '<div><h4 class="text-[10px] font-semibold text-gray-500 mb-1.5"><i class="fas fa-link mr-1"></i>같은 파일의 다른 위치</h4><div class="space-y-1">';
        doc.related.forEach(function(r) {
          h += '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs" onclick="showDetail(\'' + esc(r.chunk_id) + '\')">' +
            '<span class="loc-badge text-[10px]">' + esc(r.location_detail) + '</span>' +
            '<span class="text-gray-600 truncate">' + esc(r.snippet) + '</span></div>';
        });
        h += '</div></div>';
      }

      // Similar - enhanced with vector similarity
      if (doc.similar && doc.similar.length > 0) {
        h += '<div><h4 class="text-[10px] font-semibold text-gray-500 mb-1.5"><i class="fas fa-project-diagram mr-1"></i>유사 주제 문서 (카테고리)</h4><div class="space-y-1">';
        doc.similar.forEach(function(s) {
          h += '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs" onclick="showDetail(\'' + esc(s.chunk_id) + '\')">' +
            '<span class="type-badge type-' + esc(s.file_type || 'pdf') + '" style="font-size:0.55rem">' + (s.file_type || '').toUpperCase() + '</span>' +
            '<span class="text-gray-600 truncate">' + esc(s.doc_title) + '</span></div>';
        });
        h += '</div></div>';
      }

      // Vector similar documents
      h += '<div id="vectorSimilar"><div class="text-center py-2"><i class="fas fa-spinner fa-spin text-gray-300 text-xs"></i></div></div>';

      // Load vector similar async
      api('/api/similar/' + chunkId + '?limit=5').then(function(simData) {
        if (simData.results && simData.results.length > 0) {
          var sh = '<h4 class="text-[10px] font-semibold text-gray-500 mb-1.5"><i class="fas fa-brain mr-1 text-purple-400"></i>벡터 유사 문서</h4><div class="space-y-1">';
          simData.results.forEach(function(s) {
            sh += '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs" onclick="showDetail(\'' + esc(s.chunk_id) + '\')">' +
              '<span class="text-purple-400 font-medium w-8 text-right shrink-0">' + Math.round(s.similarity * 100) + '%</span>' +
              '<span class="type-badge type-' + esc(s.file_type || 'pdf') + '" style="font-size:0.55rem">' + (s.file_type || '').toUpperCase() + '</span>' +
              '<span class="text-gray-600 truncate">' + esc(s.doc_title) + '</span></div>';
          });
          sh += '</div>';
          if ($('#vectorSimilar')) $('#vectorSimilar').innerHTML = sh;
        } else {
          if ($('#vectorSimilar')) $('#vectorSimilar').innerHTML = '';
        }
      }).catch(function() { if ($('#vectorSimilar')) $('#vectorSimilar').innerHTML = ''; });

      // Copy path
      h += '<button class="w-full py-2 text-xs text-primary-600 hover:bg-primary-50 rounded-lg border border-primary-200 transition" onclick="copyPath(\'' + esc(doc.file_path) + '\')"><i class="fas fa-copy mr-1"></i>경로 복사</button>';

      h += '</div>';
      $('#detailContent').innerHTML = h;
    }).catch(function() { $('#detailContent').innerHTML = '<p class="text-xs text-red-400 text-center py-4">상세 정보를 불러올 수 없습니다.</p>'; });
  }
  window.showDocDetail = function(id) {
    showView('search');
    showDetail(id);
  };

  function metaRow(label, value) {
    return '<span class="meta-label">' + label + '</span><span class="meta-value">' + esc(String(value || '-')) + '</span>';
  }

  // ============ BROWSE ============
  function loadBrowse() {
    var cat = $('#browseCategory') ? $('#browseCategory').value : '';
    var stage = $('#browseStage') ? $('#browseStage').value : '';
    var sort = $('#browseSort') ? $('#browseSort').value : 'mtime';
    var proj = state.browseProject || '';

    var params = new URLSearchParams({ category: cat, doc_stage: stage, sort: sort, project: proj, limit: '30' });
    api('/api/browse?' + params).then(function(d) {
      if (!d.results || d.results.length === 0) { $('#browseResults').innerHTML = '<div class="col-span-3 text-center py-8 text-gray-400"><i class="fas fa-inbox text-3xl mb-2"></i><p class="text-sm">데이터 없음</p></div>'; return; }
      var h = '';
      d.results.forEach(function(r) {
        var tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch(e) {}

        h += '<div class="browse-card bg-white rounded-xl border border-gray-200 p-4 cursor-pointer" onclick="showDocDetail(\'' + esc(r.chunk_id) + '\')">' +
          '<div class="flex items-center gap-1.5 mb-2 flex-wrap">' +
            '<span class="type-badge type-' + esc(r.file_type) + '">' + (r.file_type || '').toUpperCase() + '</span>' +
            (r.category ? '<span class="cat-badge cat-' + esc(r.category) + '">' + esc(r.category) + '</span>' : '') +
            (r.doc_stage ? '<span class="stage-badge stage-' + esc(r.doc_stage) + '">' + esc(r.doc_stage) + '</span>' : '') +
          '</div>' +
          '<h4 class="text-sm font-semibold text-gray-800 mb-1 line-clamp-2">' + esc(r.doc_title || r.file_path) + '</h4>' +
          '<p class="text-[10px] text-gray-400 truncate mb-2 mono">' + esc(r.file_path) + '</p>' +
          '<p class="text-xs text-gray-500 line-clamp-2 mb-2">' + esc(r.snippet || '') + '</p>' +
          (tags.length > 0 ? '<div class="flex flex-wrap gap-1 mb-2">' + tags.slice(0, 3).map(function(t) { return '<span class="tag-chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
          '<div class="flex items-center justify-between text-[10px] text-gray-400">' +
            '<span>' + esc(r.project_path || '') + '</span>' +
            '<div class="flex items-center gap-2">' +
              (r.importance ? '<span><i class="fas fa-star text-yellow-400 mr-0.5"></i>' + r.importance + '</span>' : '') +
              (r.view_count ? '<span><i class="fas fa-eye mr-0.5"></i>' + r.view_count + '</span>' : '') +
            '</div>' +
          '</div></div>';
      });
      $('#browseResults').innerHTML = h;
    }).catch(function() { $('#browseResults').innerHTML = '<div class="col-span-3 text-center py-8 text-gray-400">로드 실패</div>'; });
  }

  // ============ DASHBOARD ============
  function loadDashboard() {
    api('/api/stats').then(function(s) {
      var h = '';
      
      // Top stats
      h += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">';
      h += statCard('총 청크', s.total_chunks, 'fas fa-layer-group', 'primary');
      h += statCard('총 파일', s.total_files, 'fas fa-file-alt', 'green');
      h += statCard('주제분류', (s.by_category || []).length, 'fas fa-tags', 'purple');
      h += statCard('프로젝트', (s.by_project || []).length, 'fas fa-briefcase', 'orange');
      h += '</div>';

      // Charts row
      h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';

      // By Type
      h += '<div class="bg-white rounded-xl border border-gray-200 p-5"><h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-file-alt mr-1.5 text-primary-500"></i>파일 유형별</h3><div class="space-y-2">';
      (s.by_type || []).forEach(function(t) {
        var pct = s.total_chunks > 0 ? Math.round(t.count / s.total_chunks * 100) : 0;
        h += '<div class="flex items-center gap-2"><span class="type-badge type-' + t.file_type + ' w-14 text-center">' + (t.file_type || '').toUpperCase() + '</span>' +
          '<div class="flex-1 bg-gray-100 rounded-full h-3"><div class="bg-primary-400 h-3 rounded-full transition-all" style="width:' + pct + '%"></div></div>' +
          '<span class="text-xs text-gray-500 w-20 text-right">' + t.count + ' (' + pct + '%)</span></div>';
      });
      h += '</div></div>';

      // By Category
      h += '<div class="bg-white rounded-xl border border-gray-200 p-5"><h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-tags mr-1.5 text-purple-500"></i>주제분류별</h3><div class="space-y-2">';
      (s.by_category || []).forEach(function(c) {
        var pct = s.total_chunks > 0 ? Math.round(c.count / s.total_chunks * 100) : 0;
        h += '<div class="flex items-center gap-2"><span class="cat-badge cat-' + esc(c.category) + ' w-16 text-center">' + esc(c.category) + '</span>' +
          '<div class="flex-1 bg-gray-100 rounded-full h-3"><div class="bg-purple-400 h-3 rounded-full" style="width:' + pct + '%"></div></div>' +
          '<span class="text-xs text-gray-500 w-20 text-right">' + c.count + ' (' + pct + '%)</span></div>';
      });
      h += '</div></div>';

      // By Stage
      h += '<div class="bg-white rounded-xl border border-gray-200 p-5"><h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-stream mr-1.5 text-emerald-500"></i>문서단계별</h3><div class="space-y-2">';
      (s.by_stage || []).forEach(function(st) {
        h += '<div class="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded-lg">' +
          '<span class="stage-badge stage-' + esc(st.doc_stage) + '">' + esc(st.doc_stage) + '</span>' +
          '<span class="text-xs text-gray-500">' + st.count + '건</span></div>';
      });
      h += '</div></div>';

      // By Org
      h += '<div class="bg-white rounded-xl border border-gray-200 p-5"><h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-building mr-1.5 text-orange-500"></i>발주기관별</h3><div class="space-y-2">';
      (s.by_org || []).forEach(function(o) {
        h += '<div class="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded-lg">' +
          '<span class="text-xs text-gray-700">' + esc(o.org) + '</span>' +
          '<span class="text-xs text-gray-500">' + o.count + '건</span></div>';
      });
      h += '</div></div>';

      h += '</div>';

      // Projects detail
      h += '<div class="bg-white rounded-xl border border-gray-200 p-5"><h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-briefcase mr-1.5 text-primary-600"></i>프로젝트별 상세</h3><div class="space-y-2">';
      (s.by_project || []).forEach(function(p) {
        h += '<div class="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer" onclick="browseByProject(\'' + esc(p.project_path) + '\')">' +
          '<span class="text-xs font-medium text-gray-700">' + esc(p.project_path) + '</span>' +
          '<span class="text-[10px] text-gray-400">' + p.file_count + ' files / ' + p.chunk_count + ' chunks</span></div>';
      });
      h += '</div></div>';

      // Top Viewed
      if (s.top_viewed && s.top_viewed.length > 0) {
        h += '<div class="bg-white rounded-xl border border-gray-200 p-5"><h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-fire mr-1.5 text-orange-500"></i>인기 문서 Top 10</h3><div class="space-y-1">';
        s.top_viewed.forEach(function(t, i) {
          h += '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="showDocDetail(\'' + esc(t.chunk_id) + '\')">' +
            '<span class="text-xs font-bold w-5 text-center ' + (i < 3 ? 'text-primary-600' : 'text-gray-400') + '">' + (i + 1) + '</span>' +
            '<span class="type-badge type-' + esc(t.file_type) + '" style="font-size:0.55rem">' + (t.file_type || '').toUpperCase() + '</span>' +
            '<span class="text-xs text-gray-700 truncate flex-1">' + esc(t.doc_title) + '</span>' +
            '<span class="text-[10px] text-gray-400"><i class="fas fa-eye mr-0.5"></i>' + (t.view_count || 0) + '</span></div>';
        });
        h += '</div></div>';
      }

      h += '<div class="text-xs text-gray-400 text-center py-2"><i class="fas fa-clock mr-1"></i>최종 인덱싱: ' + (s.last_indexed || 'N/A') + '</div>';

      $('#dashboardContent').innerHTML = h;
    }).catch(function() {
      $('#dashboardContent').innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-exclamation-triangle text-2xl mb-2"></i><p class="text-sm">데이터를 먼저 로드하세요.</p></div>';
    });
  }

  // ============ FILTER MANAGEMENT ============
  function loadProjectFilters(projects) {
    var container = $('#projectFilters');
    if (!container || !projects) return;
    var h = '<button data-project="" class="filter-chip active w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">전체 사업</button>';
    projects.forEach(function(p) {
      h += '<button data-project="' + esc(p.project_path) + '" class="filter-chip w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate"><i class="fas fa-folder text-gray-400 mr-1"></i>' + esc(p.project_path) + ' <span class="text-gray-400">(' + p.file_count + ')</span></button>';
    });
    container.innerHTML = h;
    $$('#projectFilters .filter-chip').forEach(function(b) {
      b.addEventListener('click', function() {
        $$('#projectFilters .filter-chip').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        state.project = b.dataset.project;
        state.page = 1;
        if (state.query) doSearch();
      });
    });
  }

  function populateCategoryFilters(cats) {
    var container = $('#categoryFilters');
    if (!container) return;
    var h = '<button data-category="" class="filter-chip active w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">전체</button>';
    Object.entries(cats).sort(function(a,b) { return b[1]-a[1]; }).forEach(function(e) {
      h += '<button data-category="' + esc(e[0]) + '" class="filter-chip w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate"><span class="cat-badge cat-' + esc(e[0]) + ' mr-1">' + esc(e[0]) + '</span> <span class="text-gray-400">(' + e[1] + ')</span></button>';
    });
    container.innerHTML = h;
    $$('#categoryFilters .filter-chip').forEach(function(b) {
      b.addEventListener('click', function() {
        $$('#categoryFilters .filter-chip').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        state.category = b.dataset.category;
        state.page = 1;
        if (state.query) doSearch();
      });
    });
  }

  // ============ GLOBAL ACTIONS ============
  window.searchByTag = function(tag) {
    $('#searchInput').value = tag;
    state.tag = '';
    state.type = '';
    state.project = '';
    state.category = '';
    state.page = 1;
    doSearch();
  };

  window.browseByCategory = function(cat) {
    if ($('#browseCategory')) $('#browseCategory').value = cat;
    showView('browse');
    loadBrowse();
  };

  window.browseByProject = function(proj) {
    state.browseProject = proj;
    if ($('#browseCategory')) $('#browseCategory').value = '';
    if ($('#browseStage')) $('#browseStage').value = '';
    showView('browse');
    // Show active project label
    if (proj && $('#browseActiveProject') && $('#browseProjectLabel')) {
      $('#browseActiveProject').classList.remove('hidden');
      $('#browseProjectLabel').textContent = proj;
    }
    loadBrowse();
  };

  window.clearBrowseProject = function() {
    state.browseProject = '';
    if ($('#browseActiveProject')) $('#browseActiveProject').classList.add('hidden');
    loadBrowse();
  };

  window.copyPath = function(path) {
    navigator.clipboard.writeText(path).then(function() { toast('경로 복사 완료', 'success'); });
  };

  // ============ HELPERS ============
  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; }

  function highlight(text, query) {
    if (!query || !text) return esc(text);
    var e = esc(text);
    query.split(/\s+/).filter(function(w) { return w.length > 0; }).forEach(function(w) {
      var safe = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      e = e.replace(new RegExp('(' + safe + ')', 'gi'), '<mark>$1</mark>');
    });
    return e;
  }

  function getFileIcon(type) {
    var map = { pptx:'fa-file-powerpoint text-orange-500', pdf:'fa-file-pdf text-red-500', xlsx:'fa-file-excel text-green-600', csv:'fa-file-csv text-indigo-500', ipynb:'fa-code text-pink-500' };
    return '<i class="fas ' + (map[type] || 'fa-file text-gray-400') + ' text-lg"></i>';
  }

  function getLocIcon(type) {
    var map = { slide:'fa-tv text-orange-400', page:'fa-file-alt text-red-400', sheet:'fa-table text-green-500', row:'fa-list text-indigo-400', cell:'fa-code text-pink-400' };
    return '<i class="fas ' + (map[type] || 'fa-map-pin text-gray-400') + '"></i>';
  }

  function showLoading() {
    $('#resultsContainer').classList.add('hidden');
    $('#emptyState').classList.add('hidden');
    $('#loadingScreen').classList.remove('hidden');
  }

  function showEmpty(q, msg) {
    $('#loadingScreen').classList.add('hidden');
    $('#resultsContainer').classList.add('hidden');
    $('#emptyState').classList.remove('hidden');
    $('#emptyMsg').textContent = msg || '"' + q + '" 검색 결과 없음';
  }

  function toast(msg, type) {
    var t = $('#toast');
    t.className = 'fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all';
    t.classList.add(type === 'success' ? 'bg-emerald-500' : 'bg-red-500', 'text-white');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(function() { t.classList.add('hidden'); }, 2500);
  }

  // ============ EVENT LISTENERS ============
  $('#searchInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') { state.page = 1; doSearch(); } });
  $('#searchBtn').addEventListener('click', function() { state.page = 1; doSearch(); });

  $$('.quick-search').forEach(function(b) {
    b.addEventListener('click', function() {
      $('#searchInput').value = b.textContent.trim();
      state.page = 1;
      doSearch();
    });
  });

  $('#advancedToggle').addEventListener('click', function() {
    $('#advancedSearch').classList.toggle('hidden');
  });

  $$('#typeFilters .filter-chip').forEach(function(b) {
    b.addEventListener('click', function() {
      $$('#typeFilters .filter-chip').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      state.type = b.dataset.type;
      state.page = 1;
      if (state.query) doSearch();
    });
  });

  $('#sortSelect').addEventListener('change', function(e) { state.sort = e.target.value; state.page = 1; if (state.query) doSearch(); });

  $('#closeDetail').addEventListener('click', function() { $('#detailPanel').classList.add('hidden'); });

  // Browse filters
  if ($('#browseCategory')) $('#browseCategory').addEventListener('change', function() { loadBrowse(); });
  if ($('#browseStage')) $('#browseStage').addEventListener('change', function() { loadBrowse(); });
  if ($('#browseSort')) $('#browseSort').addEventListener('change', function() { loadBrowse(); });

  // Seed button
  function doSeed() {
    toast('데모 데이터 로드 중...', 'success');
    apiPost('/api/seed').then(function(r) {
      toast(r.message || '데모 데이터 로드 완료', 'success');
      // Auto-generate embeddings after seeding
      toast('임베딩 생성 중...', 'success');
      apiPost('/api/embeddings/generate').then(function(e) {
        toast('임베딩 생성 완료: ' + (e.count || 0) + '개', 'success');
        loadHome();
      }).catch(function() { loadHome(); });
    }).catch(function() { toast('데이터 로드 실패', 'error'); });
  }
  if ($('#seedBtnTop')) $('#seedBtnTop').addEventListener('click', doSeed);

  // ============ SEARCH MODE TOGGLE ============
  function updateSearchModeBtn() {
    var btn = $('#searchModeToggle');
    if (!btn) return;
    if (state.searchMode === 'semantic') {
      btn.className = 'px-2 py-1 text-[11px] rounded transition bg-purple-100 text-purple-700 font-medium';
      btn.innerHTML = '<i class="fas fa-brain mr-0.5"></i>시맨틱';
    } else {
      btn.className = 'px-2 py-1 text-[11px] rounded transition text-gray-500 hover:text-primary-600 hover:bg-primary-50';
      btn.innerHTML = '<i class="fas fa-font mr-0.5"></i>FTS';
    }
  }

  if ($('#searchModeToggle')) {
    $('#searchModeToggle').addEventListener('click', function() {
      state.searchMode = state.searchMode === 'fts' ? 'semantic' : 'fts';
      updateSearchModeBtn();
      if (state.query) { state.page = 1; doSearch(); }
    });
    updateSearchModeBtn();
  }

  // ============ AI Q&A ============
  function loadAskView() {
    api('/api/embedding-stats').then(function(s) {
      var el = $('#embeddingStatus');
      if (!el) return;
      if (s.with_embeddings > 0) {
        el.innerHTML = '<i class="fas fa-check-circle mr-1 text-green-300"></i>임베딩: ' + s.with_embeddings + '/' + s.total_chunks + ' chunks (' + s.coverage + '% 커버리지)' +
          (s.models && s.models.length ? ' | 모델: ' + s.models.map(function(m) { return m.embed_model + '(' + m.count + ')'; }).join(', ') : '');
      } else {
        el.innerHTML = '<i class="fas fa-exclamation-triangle mr-1 text-yellow-300"></i>임베딩 없음. "데모 로드" 버튼을 먼저 클릭하세요.';
      }
    }).catch(function() {
      var el = $('#embeddingStatus');
      if (el) el.innerHTML = '<i class="fas fa-times-circle mr-1 text-red-300"></i>임베딩 상태를 확인할 수 없습니다.';
    });
  }

  function askQuestion(question) {
    if (!question || !question.trim()) return;
    
    var chatEl = $('#chatHistory');
    if (!chatEl) return;

    // Clear welcome if present
    if (chatEl.querySelector('.text-center')) chatEl.innerHTML = '';

    // Add user message
    chatEl.innerHTML += '<div class="flex justify-end"><div class="bg-purple-600 text-white rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%] text-sm">' + esc(question) + '</div></div>';

    // Add loading
    var loadId = 'load-' + Date.now();
    chatEl.innerHTML += '<div id="' + loadId + '" class="flex justify-start"><div class="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[85%] text-sm"><i class="fas fa-spinner fa-spin text-purple-400 mr-2"></i><span class="text-gray-400">문서를 검색하고 답변을 생성하는 중...</span></div></div>';
    chatEl.scrollTop = chatEl.scrollHeight;

    fetch(API + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question })
    }).then(function(r) { return r.json(); }).then(function(data) {
      var loadEl = document.getElementById(loadId);
      if (loadEl) loadEl.remove();

      var answer = data.answer || '답변을 생성할 수 없습니다.';
      var sources = data.sources || [];
      var mode = data.mode || 'unknown';

      // Format answer with markdown-like styling
      var formatted = esc(answer)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      var h = '<div class="flex justify-start"><div class="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%]">';
      h += '<div class="text-sm text-gray-800 leading-relaxed">' + formatted + '</div>';

      // Sources
      if (sources.length > 0) {
        h += '<div class="mt-3 pt-2 border-t border-gray-100">';
        h += '<p class="text-[10px] font-semibold text-gray-400 mb-1.5"><i class="fas fa-quote-left mr-1"></i>참조 문서 (' + sources.length + '건)</p>';
        h += '<div class="space-y-1">';
        sources.forEach(function(s) {
          var sim = s.similarity ? ' <span class="text-purple-400">' + Math.round(s.similarity * 100) + '%</span>' : '';
          h += '<div class="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-gray-50 rounded px-1.5 py-0.5" onclick="showDocDetail(\'' + esc(s.chunk_id) + '\')">' +
            '<span class="type-badge type-' + esc(s.file_type || '') + '" style="font-size:0.5rem">' + (s.file_type || '').toUpperCase() + '</span>' +
            '<span class="text-gray-600 truncate">' + esc(s.doc_title || '') + '</span>' +
            '<span class="text-gray-400 shrink-0">' + esc(s.location_detail || '') + '</span>' + sim +
            '</div>';
        });
        h += '</div></div>';
      }

      // Mode indicator
      h += '<div class="mt-2 text-[9px] text-gray-300">' +
        (mode === 'ai' ? '<i class="fas fa-robot mr-0.5"></i>AI 생성 답변' : '<i class="fas fa-list mr-0.5"></i>컨텍스트 기반 답변') +
        (data.model ? ' (' + data.model + ')' : '') + '</div>';
      h += '</div></div>';

      chatEl.innerHTML += h;
      chatEl.scrollTop = chatEl.scrollHeight;
    }).catch(function(err) {
      var loadEl = document.getElementById(loadId);
      if (loadEl) loadEl.remove();
      chatEl.innerHTML += '<div class="flex justify-start"><div class="bg-red-50 border border-red-200 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[80%] text-sm text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>오류: ' + esc(err.message || '요청 실패') + '</div></div>';
      chatEl.scrollTop = chatEl.scrollHeight;
    });
  }

  // Ask event listeners
  if ($('#askBtn')) {
    $('#askBtn').addEventListener('click', function() {
      var q = $('#askInput').value.trim();
      if (q) { askQuestion(q); $('#askInput').value = ''; }
    });
  }
  if ($('#askInput')) {
    $('#askInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { var q = e.target.value.trim(); if (q) { askQuestion(q); e.target.value = ''; } }
    });
  }
  $$('.ask-suggestion').forEach(function(b) {
    b.addEventListener('click', function() {
      var q = b.textContent.trim();
      if ($('#askInput')) $('#askInput').value = q;
      askQuestion(q);
    });
  });

  // ============ INIT ============
  loadHome();
  $('#searchInput').focus();
})();
