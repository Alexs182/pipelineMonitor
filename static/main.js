
const DEFAULT_URL = 'http://localhost:8080';
let apiBase = localStorage.getItem('dbmon_url') || DEFAULT_URL;
let apiKey  = localStorage.getItem('dbmon_key') || '';
 
const $ = id => document.getElementById(id);
 
function updateHostLabel() {
  try {
    const u = new URL(apiBase);
    $('db-host').textContent = u.host;
  } catch { $('db-host').textContent = apiBase; }
}
updateHostLabel();
 
  // Config sheet
  $('config-btn').addEventListener('click', () => {
    $('cfg-url').value = apiBase;
    $('cfg-key').value = apiKey;
    $('config-overlay').classList.add('open');
  });
  $('cfg-cancel').addEventListener('click', () => $('config-overlay').classList.remove('open'));
  $('config-overlay').addEventListener('click', e => {
    if (e.target === $('config-overlay')) $('config-overlay').classList.remove('open');
  });
  $('cfg-save').addEventListener('click', () => {
    apiBase = $('cfg-url').value.trim().replace(/\/$/, '') || DEFAULT_URL;
    apiKey  = $('cfg-key').value.trim();
    localStorage.setItem('dbmon_url', apiBase);
    localStorage.setItem('dbmon_key', apiKey);
    updateHostLabel();
    $('config-overlay').classList.remove('open');
    fetchAll();
  });
 
  async function apiFetch(path) {
    const res = await fetch(apiBase + path, {
      headers: { 'X-API-Key': apiKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
 
  function fmtNumber(n) {
    if (n == null) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return n.toString();
  }
 
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
 
  function renderStatus(data) {
    const dot  = $('status-dot');
    const text = $('status-text');
    const meta = $('status-meta');
 
    if (data && data.connected) {
      dot.className = 'dot green';
      text.textContent = 'Connected';
      meta.textContent = data.latencyMs + 'ms';
      $('m-latency').textContent = data.latencyMs + 'ms';
      $('m-pool-total').textContent = data.poolTotal ?? '—';
      $('m-pool-idle').textContent  = data.poolIdle  ?? '—';
    } else {
      dot.className = 'dot red';
      text.textContent = 'Disconnected';
      meta.textContent = 'check server';
    }
  }
 
  function renderDbSize(data) {
    $('m-db-size').textContent = data?.pretty_size ?? '—';
  }
 
function renderTables(rows) {
    const list = $('table-list');
    $('table-count-badge').textContent = rows.length;
    if (!rows.length) { list.innerHTML = '<li class="empty">No tables found</li>'; return; }
    list.innerHTML = rows.map(r => `
        <tr>
        <td>${r.dataset_name}</td>
        <td>${r.table_name}</td>
        <td>${fmtNumber(r.estimated_rows)} rows</td>
        <td>${r.total_size}</td>
        </tr>
    `).join('');
}


function filterRowCount() {
  const filter = $('rowCount').value.toUpperCase();
  const tbody = $('table-list');
  const rows = tbody.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const td = rows[i].getElementsByTagName("td")[0];
    if (td) {
      const txtValue = td.textContent || td.innerText;
      rows[i].style.display = txtValue.toUpperCase().includes(filter) ? "" : "none";
    }
  }
}
 
  function renderSlowQueries(data) {
    const container = $('slow-query-list');
    if (!data) {
      container.innerHTML = '<div class="empty" style="color:var(--muted)">pg_stat_statements not available</div>';
      return;
    }
    if (data.error) {
      container.innerHTML = `<div class="error-msg">${data.error}</div>`;
      return;
    }
    if (!data.length) { container.innerHTML = '<div class="empty">No queries recorded yet</div>'; return; }
    container.innerHTML = data.map(q => `
      <div class="query-row">
        <div class="query-preview">${q.query_preview}</div>
        <div class="query-stats">
          <span class="qstat"><span class="qstat-label">avg</span>&nbsp;<span class="qstat-value ${q.avg_ms > 100 ? 'amber' : ''} ${q.avg_ms > 500 ? 'red' : ''}">${q.avg_ms}ms</span></span>
          <span class="qstat"><span class="qstat-label">calls</span>&nbsp;<span class="qstat-value">${fmtNumber(q.calls)}</span></span>
          <span class="qstat"><span class="qstat-label">total</span>&nbsp;<span class="qstat-value">${(q.total_ms / 1000).toFixed(1)}s</span></span>
        </div>
      </div>
    `).join('');
  }
 
  function renderPipeline(data) {
    if (!data) return;
    if (data.error) {
      $('failed-jobs').innerHTML = `<div class="error-msg" style="margin:0.75rem 1.25rem;">${data.error}</div>`;
      return;
    }
 
    const summary = data.summary || [];
    const statusMap = {};
    summary.forEach(s => { statusMap[s.status] = parseInt(s.count); });
 
    const running   = statusMap['running']   || 0;
    const completed = statusMap['completed'] || 0;
    const failed24  = (data.recentFailed || []).length;
 
    $('p-running').textContent   = running;
    $('p-running').className     = 'p-stat-value ' + (running   > 0 ? 'accent' : 'muted');
    $('p-completed').textContent = completed;
    $('p-completed').className   = 'p-stat-value ' + (completed > 0 ? 'green'  : 'muted');
    $('p-failed').textContent    = failed24;
    $('p-failed').className      = 'p-stat-value ' + (failed24  > 0 ? 'red'    : 'muted');
 
    const failedJobs = data.recentFailed || [];
    $('failed-jobs').innerHTML = failedJobs.length ? failedJobs.map(j => `
      <div class="failed-row">
        <div class="failed-job">
          <span class="failed-job-name">${j.name || j.id}</span>
          <span class="failed-job-time">${fmtTime(j.failed_at)}</span>
        </div>
        <div class="failed-job-err">${j.error_message || 'unknown error'}</div>
      </div>
    `).join('') : '';
  }
 
  async function fetchAll() {
    const btn = $('refresh-btn');
    btn.classList.add('loading');
 
    try {
      const [statusRes, dbSizeRes, tableRes, sqRes, pipelineRes] = await Promise.allSettled([
        apiFetch('/api/status'),
        apiFetch('/api/stats/db-size'),
        apiFetch('/api/stats/row-counts'),
        apiFetch('/api/stats/slow-queries?limit=10'),
        apiFetch('/api/pipeline'),
      ]);
 
      if (statusRes.status === 'fulfilled' && statusRes.value.success)
        renderStatus(statusRes.value.data);
      else
        renderStatus(null);
 
      if (dbSizeRes.status === 'fulfilled' && dbSizeRes.value.success)
        renderDbSize(dbSizeRes.value.data);
 
      if (tableRes.status === 'fulfilled' && tableRes.value.success)
        renderTables(tableRes.value.data);
      else
        $('table-list').innerHTML = '<li class="empty" style="color:var(--red)">Failed to load tables</li>';
 
      renderSlowQueries(
        sqRes.status === 'fulfilled' && sqRes.value.success
          ? sqRes.value.data
          : sqRes.status === 'fulfilled' ? { error: sqRes.value.error } : null
      );
 
      renderPipeline(
        pipelineRes.status === 'fulfilled' && pipelineRes.value.success
          ? pipelineRes.value.data
          : pipelineRes.status === 'fulfilled' ? { error: pipelineRes.value.error } : null
      );
 
      const now = new Date();
      $('fetched-at').style.display = 'block';
      $('fetched-at').textContent = 'Last refreshed ' + now.toLocaleTimeString();
 
    } catch (err) {
      console.error(err);
    } finally {
      btn.classList.remove('loading');
    }
  }
 
  $('refresh-btn').addEventListener('click', fetchAll);
 
  // Auto-fetch on load if key is set
  if (apiKey) fetchAll();