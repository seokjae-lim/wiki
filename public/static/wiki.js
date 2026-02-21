// =============================================
// Knowledge Wiki - Frontend Logic
// =============================================

(function() {
  'use strict';

  // State
  var state = {
    query: '',
    type: '',
    project: '',
    sort: 'relevance',
    page: 1,
    limit: 20,
    total: 0,
    results: []
  };

  // DOM
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  var searchInput = $('#searchInput');
  var searchBtn = $('#searchBtn');
  var welcomeScreen = $('#welcomeScreen');
  var resultsContainer = $('#resultsContainer');
  var resultsList = $('#resultsList');
  var resultsHeader = $('#resultsHeader');
  var loadingScreen = $('#loadingScreen');
  var emptyState = $('#emptyState');
  var statsModal = $('#statsModal');
  var detailPanel = $('#detailPanel');
  var detailContent = $('#detailContent');

  // API
  var API_BASE = '';

  function searchAPI(q, opts) {
    opts = opts || {};
    var params = new URLSearchParams({
      q: q,
      type: opts.type || '',
      project: opts.project || '',
      sort: opts.sort || 'relevance',
      page: String(opts.page || 1),
      limit: String(opts.limit || 20)
    });
    return fetch(API_BASE + '/api/search?' + params).then(function(r) { return r.json(); });
  }

  function getDoc(chunkId) {
    return fetch(API_BASE + '/api/doc/' + chunkId).then(function(r) { return r.json(); });
  }

  function getStats() {
    return fetch(API_BASE + '/api/stats').then(function(r) { return r.json(); });
  }

  function getProjects() {
    return fetch(API_BASE + '/api/projects').then(function(r) { return r.json(); });
  }

  function seedData() {
    return fetch(API_BASE + '/api/seed', { method: 'POST' }).then(function(r) { return r.json(); });
  }

  // Search
  function doSearch() {
    var q = searchInput.value.trim();
    if (!q) return;
    state.query = q;
    showLoading();

    searchAPI(q, {
      type: state.type,
      project: state.project,
      sort: state.sort,
      page: state.page,
      limit: state.limit
    }).then(function(data) {
      state.results = data.results || [];
      state.total = data.total || 0;
      if (state.results.length > 0) {
        renderResults();
      } else {
        showEmpty(q);
      }
    }).catch(function(e) {
      console.error('Search error:', e);
      showEmpty(q, 'Search error. Please load demo data first (click "현황" button).');
    });
  }

  // Render Results
  function renderResults() {
    welcomeScreen.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    emptyState.classList.add('hidden');
    resultsContainer.classList.remove('hidden');

    var fromIdx = (state.page - 1) * state.limit + 1;
    var toIdx = Math.min(state.page * state.limit, state.total);
    resultsHeader.innerHTML =
      '<span class="font-semibold text-gray-800">"' + escHTML(state.query) + '"</span> ' +
      'results <span class="font-semibold text-blue-600">' + state.total + '</span>' +
      (state.total > state.limit ? ' (' + fromIdx + '-' + toIdx + ')' : '');

    var html = '';
    for (var i = 0; i < state.results.length; i++) {
      var r = state.results[i];
      var typeClass = 'type-' + (r.file_type || 'pdf');
      var icon = getFileIcon(r.file_type);
      var locIcon = getLocationIcon(r.location_type);

      html += '<div class="result-card fade-in bg-white rounded-lg border border-gray-200 p-3 cursor-pointer" ' +
        'data-chunk-id="' + escHTML(r.chunk_id) + '" style="animation-delay:' + (i * 30) + 'ms">' +
        '<div class="flex items-start gap-3">' +
          '<div class="shrink-0 mt-0.5">' + icon + '</div>' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
              '<span class="type-badge ' + typeClass + '">' + (r.file_type || '').toUpperCase() + '</span>' +
              '<span class="loc-badge">' + locIcon + ' ' + escHTML(r.location_detail || '') + '</span>' +
              '<span class="text-[10px] text-gray-400">' + escHTML(r.project_path || '') + '</span>' +
            '</div>' +
            '<h4 class="text-sm font-medium text-gray-800 truncate mb-0.5">' + escHTML(r.doc_title || r.file_path) + '</h4>' +
            '<p class="text-[11px] text-gray-400 truncate mb-1.5 mono">' + escHTML(r.file_path) + '</p>' +
            '<div class="text-xs text-gray-600 leading-relaxed line-clamp-3">' + (r.snippet || escHTML((r.text || '').substring(0, 200))) + '</div>' +
          '</div>' +
          '<button class="copy-path shrink-0 p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition" ' +
            'data-path="' + escHTML(r.file_path) + '" title="경로 복사">' +
            '<i class="fas fa-copy text-xs"></i>' +
          '</button>' +
        '</div>' +
      '</div>';
    }
    resultsList.innerHTML = html;

    renderPagination();

    // Click handlers
    resultsList.querySelectorAll('.result-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.copy-path')) return;
        showDetail(card.dataset.chunkId);
      });
    });

    resultsList.querySelectorAll('.copy-path').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.path).then(function() {
          showToast('경로가 복사되었습니다', 'success');
        });
      });
    });
  }

  function renderPagination() {
    var totalPages = Math.ceil(state.total / state.limit);
    var pagEl = $('#pagination');
    if (totalPages <= 1) { pagEl.innerHTML = ''; return; }

    var html = '';
    if (state.page > 1) {
      html += '<button class="page-btn px-3 py-1 text-xs border rounded hover:bg-gray-100" data-page="' + (state.page - 1) + '"><i class="fas fa-chevron-left"></i></button>';
    }
    var start = Math.max(1, state.page - 2);
    var end = Math.min(totalPages, state.page + 2);
    for (var p = start; p <= end; p++) {
      var active = p === state.page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100';
      html += '<button class="page-btn px-3 py-1 text-xs border rounded ' + active + '" data-page="' + p + '">' + p + '</button>';
    }
    if (state.page < totalPages) {
      html += '<button class="page-btn px-3 py-1 text-xs border rounded hover:bg-gray-100" data-page="' + (state.page + 1) + '"><i class="fas fa-chevron-right"></i></button>';
    }
    pagEl.innerHTML = html;

    $$('.page-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.page = parseInt(btn.dataset.page);
        doSearch();
      });
    });
  }

  // Detail Panel
  function showDetail(chunkId) {
    detailPanel.classList.remove('hidden', 'closed');
    detailPanel.classList.add('open');
    detailContent.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-gray-400"></i></div>';

    getDoc(chunkId).then(function(doc) {
      if (doc.error) {
        detailContent.innerHTML = '<p class="text-xs text-red-400">' + doc.error + '</p>';
        return;
      }
      var typeClass = 'type-' + (doc.file_type || 'pdf');
      detailContent.innerHTML =
        '<div class="space-y-3">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="type-badge ' + typeClass + '">' + (doc.file_type || '').toUpperCase() + '</span>' +
            '<span class="loc-badge">' + escHTML(doc.location_detail || '') + '</span>' +
          '</div>' +
          '<h3 class="text-sm font-bold text-gray-800">' + escHTML(doc.doc_title || '') + '</h3>' +
          '<div class="flex items-center gap-2">' +
            '<p class="text-[11px] text-gray-400 mono truncate flex-1">' + escHTML(doc.file_path) + '</p>' +
            '<button class="detail-copy-btn text-gray-300 hover:text-blue-500 text-xs" data-path="' + escHTML(doc.file_path) + '"><i class="fas fa-copy"></i></button>' +
          '</div>' +
          '<div class="text-xs text-gray-500"><i class="fas fa-folder mr-1 text-gray-400"></i>' + escHTML(doc.project_path || '-') + '</div>' +
          '<div class="text-xs text-gray-500"><i class="fas fa-clock mr-1 text-gray-400"></i>' + escHTML(doc.mtime || '-') + '</div>' +
          '<hr class="border-gray-100">' +
          '<div>' +
            '<h4 class="text-xs font-semibold text-gray-500 mb-2">전체 텍스트</h4>' +
            '<div class="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg whitespace-pre-wrap mono">' +
              highlightText(doc.text || '', state.query) +
            '</div>' +
          '</div>' +
        '</div>';

      var copyBtn = detailContent.querySelector('.detail-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          navigator.clipboard.writeText(copyBtn.dataset.path).then(function() {
            showToast('경로 복사 완료', 'success');
          });
        });
      }
    }).catch(function() {
      detailContent.innerHTML = '<p class="text-xs text-red-400">상세 정보를 불러올 수 없습니다.</p>';
    });
  }

  // Stats Modal
  function showStatsModal() {
    statsModal.classList.remove('hidden');
    var content = $('#statsContent');
    content.innerHTML = '<p class="text-sm text-gray-400 text-center py-4"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</p>';

    getStats().then(function(stats) {
      var html = '';
      html += '<div class="grid grid-cols-2 gap-3">';
      html += statCard('총 청크', stats.total_chunks || 0, 'fas fa-database', 'blue');
      html += statCard('총 파일', stats.total_files || 0, 'fas fa-file', 'green');
      html += '</div>';

      if (stats.by_type && stats.by_type.length > 0) {
        html += '<div><h4 class="text-xs font-semibold text-gray-500 mb-2">파일 유형별</h4><div class="space-y-1">';
        stats.by_type.forEach(function(t) {
          var pct = stats.total_chunks > 0 ? Math.round(t.count / stats.total_chunks * 100) : 0;
          html += '<div class="flex items-center gap-2 text-xs">' +
            '<span class="type-badge type-' + t.file_type + ' w-12 text-center">' + (t.file_type || '').toUpperCase() + '</span>' +
            '<div class="flex-1 bg-gray-100 rounded-full h-2"><div class="bg-blue-400 h-2 rounded-full" style="width:' + pct + '%"></div></div>' +
            '<span class="text-gray-500 w-16 text-right">' + t.count + ' (' + pct + '%)</span>' +
          '</div>';
        });
        html += '</div></div>';
      }

      if (stats.by_project && stats.by_project.length > 0) {
        html += '<div><h4 class="text-xs font-semibold text-gray-500 mb-2">프로젝트별</h4><div class="space-y-1">';
        stats.by_project.forEach(function(p) {
          html += '<div class="flex items-center justify-between text-xs px-2 py-1 bg-gray-50 rounded">' +
            '<span class="text-gray-700 truncate">' + escHTML(p.project_path || '-') + '</span>' +
            '<span class="text-gray-400 shrink-0 ml-2">' + p.file_count + ' files / ' + p.chunk_count + ' chunks</span>' +
          '</div>';
        });
        html += '</div></div>';
      }

      html += '<div class="text-xs text-gray-400 text-center"><i class="fas fa-clock mr-1"></i>Last indexed: ' + (stats.last_indexed || 'N/A') + '</div>';
      content.innerHTML = html;
    }).catch(function() {
      content.innerHTML = '<p class="text-sm text-red-400 text-center py-4">Load demo data first.</p>';
    });
  }

  function statCard(label, value, icon, color) {
    return '<div class="bg-' + color + '-50 rounded-lg p-3 text-center">' +
      '<i class="' + icon + ' text-' + color + '-400 text-lg mb-1"></i>' +
      '<div class="text-xl font-bold text-' + color + '-700">' + Number(value).toLocaleString() + '</div>' +
      '<div class="text-[10px] text-' + color + '-500">' + label + '</div>' +
    '</div>';
  }

  // Filters
  function loadProjectFilters() {
    getProjects().then(function(data) {
      var container = $('#projectFilters');
      var html = '<button data-project="" class="filter-chip active w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">전체 사업</button>';
      if (data.projects) {
        data.projects.forEach(function(p) {
          html += '<button data-project="' + escHTML(p.project_path) + '" class="filter-chip w-full text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 truncate">' +
            '<i class="fas fa-folder text-gray-400 mr-1"></i>' + escHTML(p.project_path) +
            ' <span class="text-gray-400">(' + p.file_count + ')</span>' +
          '</button>';
        });
      }
      container.innerHTML = html;
      bindProjectFilters();
    }).catch(function() {});
  }

  function bindProjectFilters() {
    $$('#projectFilters .filter-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        $$('#projectFilters .filter-chip').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.project = btn.dataset.project;
        state.page = 1;
        if (state.query) doSearch();
      });
    });
  }

  function loadOverviewStats() {
    getStats().then(function(stats) {
      var el = $('#statsOverview');
      if (stats.total_chunks > 0) {
        el.innerHTML = '<i class="fas fa-database mr-1"></i>' + stats.total_files + ' files | ' + stats.total_chunks + ' chunks indexed';
      } else {
        el.innerHTML = '<span class="text-amber-500"><i class="fas fa-exclamation-triangle mr-1"></i>No data. Click "현황" button to load demo data.</span>';
      }
    }).catch(function() {});
  }

  // Helpers
  function escHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlightText(text, query) {
    if (!query || !text) return escHTML(text);
    var escaped = escHTML(text);
    var words = query.split(/\s+/).filter(function(w) { return w.length > 0; });
    var result = escaped;
    words.forEach(function(word) {
      var safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var regex = new RegExp('(' + safeWord + ')', 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    });
    return result;
  }

  function getFileIcon(type) {
    var icons = {
      pptx: '<i class="fas fa-file-powerpoint text-orange-500 text-lg"></i>',
      pdf: '<i class="fas fa-file-pdf text-red-500 text-lg"></i>',
      xlsx: '<i class="fas fa-file-excel text-green-600 text-lg"></i>',
      csv: '<i class="fas fa-file-csv text-indigo-500 text-lg"></i>',
      ipynb: '<i class="fas fa-code text-pink-500 text-lg"></i>',
      hwp: '<i class="fas fa-file-alt text-blue-600 text-lg"></i>',
      docx: '<i class="fas fa-file-word text-blue-500 text-lg"></i>'
    };
    return icons[type] || '<i class="fas fa-file text-gray-400 text-lg"></i>';
  }

  function getLocationIcon(type) {
    var icons = {
      slide: '<i class="fas fa-tv text-orange-400"></i>',
      page: '<i class="fas fa-file-alt text-red-400"></i>',
      sheet: '<i class="fas fa-table text-green-500"></i>',
      row: '<i class="fas fa-list text-indigo-400"></i>',
      cell: '<i class="fas fa-code text-pink-400"></i>'
    };
    return icons[type] || '<i class="fas fa-map-pin text-gray-400"></i>';
  }

  function showLoading() {
    welcomeScreen.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    emptyState.classList.add('hidden');
    loadingScreen.classList.remove('hidden');
  }

  function showEmpty(query, msg) {
    loadingScreen.classList.add('hidden');
    welcomeScreen.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    $('#emptyMsg').textContent = msg || '"' + query + '" - no results found.';
  }

  function showToast(msg, type) {
    var toast = $('#toast');
    toast.className = 'fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all';
    toast.classList.add(type === 'success' ? 'bg-green-500' : 'bg-red-500', 'text-white');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(function() { toast.classList.add('hidden'); }, 2000);
  }

  // Event Listeners
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { state.page = 1; doSearch(); }
  });
  searchBtn.addEventListener('click', function() { state.page = 1; doSearch(); });

  $$('.quick-search').forEach(function(btn) {
    btn.addEventListener('click', function() {
      searchInput.value = btn.textContent.trim();
      state.page = 1;
      doSearch();
    });
  });

  $$('#typeFilters .filter-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      $$('#typeFilters .filter-chip').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.type = btn.dataset.type;
      state.page = 1;
      if (state.query) doSearch();
    });
  });

  $('#sortSelect').addEventListener('change', function(e) {
    state.sort = e.target.value;
    state.page = 1;
    if (state.query) doSearch();
  });

  $('#statsBtn').addEventListener('click', showStatsModal);
  $('#closeStats').addEventListener('click', function() { statsModal.classList.add('hidden'); });
  statsModal.addEventListener('click', function(e) { if (e.target === statsModal) statsModal.classList.add('hidden'); });

  $('#seedBtn').addEventListener('click', function() {
    var btn = $('#seedBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Loading...';
    seedData().then(function(result) {
      showToast(result.message || 'Demo data loaded', 'success');
      showStatsModal();
      loadProjectFilters();
      loadOverviewStats();
    }).catch(function() {
      showToast('Failed to load data', 'error');
    }).finally(function() {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-database mr-1"></i> 데모 데이터 로드';
    });
  });

  $('#closeDetail').addEventListener('click', function() {
    detailPanel.classList.add('hidden', 'closed');
    detailPanel.classList.remove('open');
  });

  // Init
  loadProjectFilters();
  loadOverviewStats();
  searchInput.focus();
})();
