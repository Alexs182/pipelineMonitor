
const { useState, useEffect, useCallback, useRef, createContext, useContext } = React;

// ── App Context ───────────────────────────────────────────────────────────────

const AppCtx = createContext(null);

function useApp() { return useContext(AppCtx); }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNumber(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── API hook ──────────────────────────────────────────────────────────────────

function useApi() {
  const { apiBase, apiKey, selectedDb } = useApp();

  return useCallback(async (path) => {
    const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
    if (selectedDb) headers['X-DB-Name'] = selectedDb;
    const res = await fetch(apiBase + path, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [apiBase, apiKey, selectedDb]);
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ title, badge, children, action, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          {badge && <span className="badge">{badge}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function Skeleton({ width = '100%', height = '0.8rem', style = {} }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}

// ── Status Card ───────────────────────────────────────────────────────────────

function StatusCard({ data, loading, error }) {
  if (loading) return (
    <Card title="Connection" style={{ gridColumn:1, gridRow:1 }}>
      <div className="card-body">
        <Skeleton height="1rem" style={{ marginBottom:'0.75rem' }} />
        <Skeleton width="60%" style={{ marginBottom:'0.4rem' }} />
        <Skeleton width="40%" style={{ marginBottom:'0.4rem' }} />
        <Skeleton width="50%" />
      </div>
    </Card>
  );

  const connected = data?.connected;
  return (
    <Card title="Connection" style={{ gridColumn:1, gridRow:1 }}>
      <div className="card-body">
        <div className="status-main">
          <div className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
          <span className="status-label">{connected ? 'Connected' : 'Disconnected'}</span>
          {connected && <span className="status-latency">{data.latencyMs}ms</span>}
        </div>
        {error && <div className="error-msg" style={{padding:0,marginBottom:'0.5rem'}}>{error}</div>}
        <div className="stat-rows">
          <div className="stat-row"><span className="stat-key">latency</span><span className="stat-val accent">{data?.latencyMs ?? '—'}ms</span></div>
          <div className="stat-row"><span className="stat-key">pool total</span><span className="stat-val">{data?.poolTotal ?? '—'}</span></div>
          <div className="stat-row"><span className="stat-key">pool idle</span><span className="stat-val">{data?.poolIdle ?? '—'}</span></div>
        </div>
      </div>
    </Card>
  );
}

// ── DB Size Card ──────────────────────────────────────────────────────────────

function DbSizeCard({ data, loading }) {
  return (
    <Card title="Database Size" style={{ gridColumn:1, gridRow:2 }}>
      <div className="card-body">
        {loading
          ? <Skeleton height="2rem" width="70%" />
          : <>
              <div className="dbsize-value">{data?.pretty_size ?? '—'}</div>
              <div className="dbsize-label">{data?.database ?? ''}</div>
            </>
        }
      </div>
    </Card>
  );
}

// ── Pipeline Card ─────────────────────────────────────────────────────────────

function PipelineCard({ data, loading, error }) {
  if (loading) return (
    <Card title="Pipeline" style={{ gridColumn:1, gridRow:3 }}>
      <div className="card-body">
        <Skeleton style={{ marginBottom:'0.5rem' }} />
        <Skeleton width="80%" style={{ marginBottom:'0.5rem' }} />
        <Skeleton width="60%" />
      </div>
    </Card>
  );

  const statusMap = {};
  (data?.summary || []).forEach(s => { statusMap[s.status] = parseInt(s.count); });
  const running   = statusMap['running']   || 0;
  const completed = statusMap['completed'] || 0;
  const failed24  = (data?.recentFailed || []).length;

  return (
    <Card title="Pipeline" style={{ gridColumn:1, gridRow:3 }}>
      {error
        ? <div className="error-msg">{error}</div>
        : <>
            <div className="pipeline-stats">
              <div className="p-stat">
                <div className={`p-stat-val ${running > 0 ? 'accent' : 'muted'}`}>{running}</div>
                <div className="p-stat-key">Running</div>
              </div>
              <div className="p-stat">
                <div className={`p-stat-val ${completed > 0 ? 'green' : 'muted'}`}>{completed}</div>
                <div className="p-stat-key">Done</div>
              </div>
              <div className="p-stat">
                <div className={`p-stat-val ${failed24 > 0 ? 'red' : 'muted'}`}>{failed24}</div>
                <div className="p-stat-key">Failed 24h</div>
              </div>
            </div>
            <div style={{ padding:'0 1rem 0.75rem' }}>
              {(data?.recentFailed || []).map(j => (
                <div className="failed-row" key={j.id}>
                  <div className="failed-row-top">
                    <span className="failed-name">{j.name || j.id}</span>
                    <span className="failed-time">{fmtTime(j.failed_at)}</span>
                  </div>
                  <div className="failed-err">{j.error_message || 'unknown error'}</div>
                </div>
              ))}
            </div>
          </>
      }
    </Card>
  );
}

// ── Tables Card ───────────────────────────────────────────────────────────────

function TablesCard({ data, loading, error }) {
  const [filter, setFilter] = useState('');
  const rows = (data || []).filter(r =>
    !filter || r.dataset_name?.toLowerCase().includes(filter.toLowerCase()) ||
               r.table_name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Card
      title="Tables"
      badge={data ? `${rows.length} / ${data.length}` : null}
      style={{ gridColumn:2, gridRow:'1 / 3' }}
    >
      <div className="tables-toolbar">
        <input
          className="search-input"
          placeholder="Filter by schema or table…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        {loading ? (
          <div className="card-body">
            {[...Array(6)].map((_, i) => <Skeleton key={i} style={{ marginBottom:'0.5rem' }} />)}
          </div>
        ) : error ? (
          <div className="error-msg">{error}</div>
        ) : !rows.length ? (
          <div className="empty">No tables found</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Schema</th>
                <th>Table</th>
                <th>Rows</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.dataset_name}.${r.table_name}`}>
                  <td className="schema">{r.dataset_name}</td>
                  <td>{r.table_name}</td>
                  <td className="rows">{fmtNumber(r.estimated_rows)}</td>
                  <td className="size">{r.total_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

// ── Slow Queries Card ─────────────────────────────────────────────────────────

function SlowQueriesCard({ data, loading, error }) {
  return (
    <Card title="Slow Queries" style={{ gridColumn:2, gridRow:3 }}>
      {loading ? (
        <div className="card-body">
          {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ marginBottom:'0.5rem' }} />)}
        </div>
      ) : error ? (
        <div className="error-msg">{error}</div>
      ) : !data?.length ? (
        <div className="empty">No queries recorded</div>
      ) : (
        data.map((q, i) => (
          <div className="query-row" key={i}>
            <div className="query-preview">{q.query_preview}</div>
            <div className="query-stats">
              <span className="qstat">
                <span className="qstat-label">avg </span>
                <span className={`qstat-value ${q.avg_ms > 500 ? 'red' : q.avg_ms > 100 ? 'amber' : ''}`}>{q.avg_ms}ms</span>
              </span>
              <span className="qstat">
                <span className="qstat-label">calls </span>
                <span className="qstat-value">{fmtNumber(q.calls)}</span>
              </span>
              <span className="qstat">
                <span className="qstat-label">total </span>
                <span className="qstat-value">{(q.total_ms / 1000).toFixed(1)}s</span>
              </span>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

// ── Config Overlay ────────────────────────────────────────────────────────────

function ConfigOverlay({ onClose }) {
  const { apiBase, apiKey, setApiBase, setApiKey } = useApp();
  const [url, setUrl] = useState(apiBase);
  const [key, setKey] = useState(apiKey);

  function save() {
    const base = url.trim().replace(/\/$/, '') || 'http://localhost:8080';
    setApiBase(base);
    setApiKey(key.trim());
    localStorage.setItem('dbmon_url', base);
    localStorage.setItem('dbmon_key', key.trim());
    onClose();
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="overlay-panel">
        <div className="overlay-title">Configuration</div>
        <div className="field">
          <label>API Base URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:8080" />
        </div>
        <div className="field">
          <label>API Key</label>
          <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="your-api-key" />
        </div>
        <div className="overlay-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

function DashboardPage() {
  const apiFetch = useApi();
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);

  const [status,    setStatus]    = useState({ data: null, loading: true, error: null });
  const [dbSize,    setDbSize]    = useState({ data: null, loading: true, error: null });
  const [tables,    setTables]    = useState({ data: null, loading: true, error: null });
  const [slowQ,     setSlowQ]     = useState({ data: null, loading: true, error: null });
  const [pipeline,  setPipeline]  = useState({ data: null, loading: true, error: null });

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    const setters = [setStatus, setDbSize, setTables, setSlowQ, setPipeline];
    setters.forEach(s => s(p => ({ ...p, loading: true, error: null })));

    const [statusR, dbSizeR, tablesR, slowQR, pipelineR] = await Promise.allSettled([
      apiFetch('/api/status'),
      apiFetch('/api/stats/db-size'),
      apiFetch('/api/stats/row-counts'),
      apiFetch('/api/stats/slow-queries?limit=10'),
      apiFetch('/api/pipeline'),
    ]);

    const resolve = (result, setter) => {
      if (result.status === 'fulfilled' && result.value.success) {
        setter({ data: result.value.data, loading: false, error: null });
      } else {
        const msg = result.status === 'fulfilled' ? result.value.error : result.reason?.message;
        setter({ data: null, loading: false, error: msg || 'Failed' });
      }
    };

    resolve(statusR,   setStatus);
    resolve(dbSizeR,   setDbSize);
    resolve(tablesR,   setTables);
    resolve(slowQR,    setSlowQ);
    resolve(pipelineR, setPipeline);

    setFetchedAt(new Date().toLocaleTimeString());
    setRefreshing(false);
  }, [apiFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <>
      <div style={{ display:'flex', justifyContent:'flex-end', padding:'0 1.5rem', paddingTop:'1rem' }}>
        <button className="btn btn-ghost" onClick={fetchAll} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>
      <div className="page">
        <div className="dashboard-grid">
          <StatusCard   {...status} />
          <DbSizeCard   {...dbSize} />
          <PipelineCard {...pipeline} />
          <TablesCard   {...tables} />
          <SlowQueriesCard {...slowQ} />
        </div>
      </div>
      {fetchedAt && <div className="fetched-at">Last refreshed {fetchedAt}</div>}
    </>
  );
}

// ── Connections Page ──────────────────────────────────────────────────────────

function ConnectionsPage() {
  const { apiBase, apiKey } = useApp();
  const apiFetch = useApi();

  const [conns,     setConns]     = useState([]);
  const [statuses,  setStatuses]  = useState({});
  const [formName,  setFormName]  = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formUrl,   setFormUrl]   = useState('');
  const [formMsg,   setFormMsg]   = useState({ text: '', cls: '' });
  const [editing,   setEditing]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  async function load() {
    try {
      const json = await apiFetch('/api/connections');
      setConns(json.data || []);
      (json.data || []).forEach(c => checkStatus(c.name));
    } catch { setConns([]); }
  }

  async function checkStatus(name) {
    setStatuses(s => ({ ...s, [name]: { state: 'testing', latency: null } }));
    try {
      const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-DB-Name': name };
      const res = await fetch(apiBase + '/api/status', { headers });
      const json = await res.json();
      if (json.success && json.data.connected) {
        setStatuses(s => ({ ...s, [name]: { state: 'ok', latency: json.data.latencyMs } }));
      } else {
        setStatuses(s => ({ ...s, [name]: { state: 'err', latency: null } }));
      }
    } catch {
      setStatuses(s => ({ ...s, [name]: { state: 'err', latency: null } }));
    }
  }

  async function handleTest() {
    if (!formUrl) { setFormMsg({ text: 'Enter a URL first', cls: 'err' }); return; }
    setFormMsg({ text: 'Testing…', cls: '' });
    try {
      const res  = await fetch(apiBase + '/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ url: formUrl }),
      });
      const json = await res.json();
      if (json.success) setFormMsg({ text: `✓ Connected in ${json.latencyMs}ms`, cls: 'ok' });
      else setFormMsg({ text: `✗ ${json.error}`, cls: 'err' });
    } catch (e) {
      setFormMsg({ text: `✗ ${e.message}`, cls: 'err' });
    }
  }

  async function handleSave() {
    if (!formName || !formUrl) { setFormMsg({ text: 'Name and URL required', cls: 'err' }); return; }
    setSaving(true);
    setFormMsg({ text: 'Saving…', cls: '' });
    try {
      const res  = await fetch(apiBase + '/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ name: formName, label: formLabel, url: formUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setFormMsg({ text: '✓ Saved', cls: 'ok' });
        resetForm();
        await load();
      } else {
        setFormMsg({ text: `✗ ${json.error}`, cls: 'err' });
      }
    } catch (e) {
      setFormMsg({ text: `✗ ${e.message}`, cls: 'err' });
    }
    setSaving(false);
  }

  async function handleDelete(name) {
    if (!confirm(`Delete connection "${name}"?`)) return;
    try {
      await fetch(apiBase + `/api/connections/${name}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      });
      await load();
    } catch (e) { alert(e.message); }
  }

  function startEdit(c) {
    setEditing(c.name);
    setFormName(c.name);
    setFormLabel(c.label);
    setFormUrl('');
    setFormMsg({ text: '', cls: '' });
  }

  function resetForm() {
    setEditing(null);
    setFormName(''); setFormLabel(''); setFormUrl('');
    setFormMsg({ text: '', cls: '' });
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="conn-page">
      <div className="conn-page-title">Manage Connections</div>
      <div className="conn-page-sub">
        Add, test, and remove PostgreSQL connections. Credentials are stored server-side in <code>connections.json</code>. Passwords are masked in the UI.
      </div>

      <div className="conn-list">
        {conns.length === 0
          ? <div className="empty" style={{ border:'1px dashed var(--border2)', borderRadius:'var(--radius)' }}>
              No connections yet — add one below.
            </div>
          : conns.map(c => {
              const st = statuses[c.name] || { state: 'testing', latency: null };
              return (
                <div className="conn-card" key={c.name}>
                  <div className={`conn-dot ${st.state}`} />
                  <div className="conn-info">
                    <div className="conn-name">{c.label} <span style={{ color:'var(--muted)', fontWeight:400 }}>· {c.name}</span></div>
                    <div className="conn-url">{c.urlPreview}</div>
                  </div>
                  <div className="conn-latency">{st.latency != null ? `${st.latency}ms` : '—'}</div>
                  <div className="conn-actions">
                    <button className="icon-btn" onClick={() => startEdit(c)} title="Edit">✎</button>
                    <button className="icon-btn danger" onClick={() => handleDelete(c.name)} title="Delete">✕</button>
                  </div>
                </div>
              );
            })
        }
      </div>

      <div className="form-card">
        <div className="form-card-title">{editing ? `Edit: ${editing}` : 'Add Connection'}</div>
        <div className="form-grid">
          <div className="field">
            <label>Identifier</label>
            <input value={formName} onChange={e => setFormName(e.target.value)}
              placeholder="prod_db" disabled={!!editing} style={{ opacity: editing ? 0.5 : 1 }} />
          </div>
          <div className="field">
            <label>Display Name</label>
            <input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="Production" />
          </div>
          <div className="field full">
            <label>Connection URL</label>
            <input value={formUrl} onChange={e => setFormUrl(e.target.value)}
              placeholder="postgresql://user:password@host:5432/dbname" />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={handleTest}>Test</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {editing && <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>}
          {formMsg.text && <span className={`form-status ${formMsg.cls}`}>{formMsg.text}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav({ page, setPage, onConfig, connections, selectedDb, setSelectedDb }) {
  return (
    <nav className="nav">
      <span className="nav-brand">▣ DB Monitor</span>
      {selectedDb && <span className="nav-host">{selectedDb}</span>}
      <div className="nav-links">
        <button className={`nav-link ${page === 'dashboard' ? 'active' : ''}`}
          onClick={() => setPage('dashboard')}>Dashboard</button>
        <button className={`nav-link ${page === 'connections' ? 'active' : ''}`}
          onClick={() => setPage('connections')}>Connections</button>
      </div>
      <div className="nav-right">
        {connections.length > 0 && (
          <div className="db-select-wrap">
            <span className="db-select-label">DB</span>
            <select className="db-select" value={selectedDb}
              onChange={e => setSelectedDb(e.target.value)}>
              {connections.map(c => (
                <option key={c.name} value={c.name}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-ghost" onClick={onConfig}>Config</button>
      </div>
    </nav>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────


function App() {
  const [apiBase,     setApiBase]     = useState(() => localStorage.getItem('dbmon_url') || 'http://localhost:8080');
  const [apiKey,      setApiKey]      = useState(() => localStorage.getItem('dbmon_key') || '');
  const [selectedDb,  setSelectedDb]  = useState(() => sessionStorage.getItem('selectedDb') || '');
  const [connections, setConnections] = useState([]);
  const [page,        setPage]        = useState('dashboard');
  const [showConfig,  setShowConfig]  = useState(false);

  // Load connection list on mount and when apiBase/apiKey change
  useEffect(() => {
    if (!apiKey) { setShowConfig(true); return; }
    fetch(apiBase + '/api/connections', {
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    })
      .then(r => r.json())
      .then(json => {
        const conns = json.data || [];
        setConnections(conns);
        if (!selectedDb && conns.length) setSelectedDb(conns[0].name);
      })
      .catch(() => {});
  }, [apiBase, apiKey]);

  // Persist selectedDb
  useEffect(() => {
    sessionStorage.setItem('selectedDb', selectedDb);
  }, [selectedDb]);

  return (
    <AppCtx.Provider value={{ apiBase, apiKey, setApiBase, setApiKey, selectedDb }}>
      <Nav
        page={page} setPage={setPage}
        onConfig={() => setShowConfig(true)}
        connections={connections}
        selectedDb={selectedDb}
        setSelectedDb={setSelectedDb}
      />
      {page === 'dashboard'   && <DashboardPage key={selectedDb} />}
      {page === 'connections' && <ConnectionsPage />}
      {showConfig && <ConfigOverlay onClose={() => setShowConfig(false)} />}
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

