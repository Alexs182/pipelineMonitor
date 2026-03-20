// server.js — PostgreSQL Monitoring API
// Dependencies: npm install express pg dotenv cors

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { url } = require('inspector');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY || 'change-me-please';
const CONNECTIONS_FILE = path.join(__dirname, 'connections.json');

app.use(express.static(path.join(__dirname, 'static')));

// ─── DB Connection Pool ───────────────────────────────────────────────────────

let registry = {};

function loadConnections() {
  if (!fs.existsSync(CONNECTIONS_FILE)) {
    if (process.env.DATABASE_URL) {
      const seed = { default: { label: "Default", url: process.env.DATABASE_URL} };
      fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(seed, null, 2));
    } else {
      fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify({}, null, 2));
    }
  }
  
  const saved = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf8'));

  for (const [name, meta] of Object.entries(saved)) {
    registry[name] = {
      label: meta.label,
      url: meta.url,
      pool: makePool(meta.url),
    };
  }

  console.log('Loaded ${Object.keys(registry).length} connection(s)')
}

function saveConnections() {
  const toSave = {};
  for (const [name, entry] of Object.entries(registry)) {
    toSave[name] = { label: entry.label, url: entry.url };
  }
  fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(toSave, null, 2));
}

function makePool(url) {
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}


// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/index.html')));
app.get('/connections', (req, res) => res.sendFile(path.join(__dirname, 'views/connections.html')));


// Simple API key auth — checks X-API-Key header on all /api routes
app.use('/api', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorised' });
  }
  next();
});

// Resolve pool from X-DB-Name header (falls back to first registered DB)
app.use('/api/stats', resolvePool);
app.use('/api/status', resolvePool);
app.use('/api/pipeline', resolvePool);
app.use('/api/all', resolvePool);

function resolvePool(req, res, next) {
  const name = req.headers['x-db-name'];
  const keys = Object.keys(registry);

  if (!keys.length) {
    return res.status(503).json({ success: false, error: 'No databases configured. Visit /connections to add one.' });
  }

  const entry = name && registry[name] ? registry[name] : registry[keys[0]];
  req.pool = entry.pool;
  req.dbName = name || keys[0];
  next();
}

// ─── Connection Management Endpoints ─────────────────────────────────────────

// List all connections (never expose the URL in full — mask password)
app.get('/api/connections', (req, res) => {
  const list = Object.entries(registry).map(([name, entry]) => ({
    name,
    label: entry.label,
    urlPreview: maskUrl(entry.url),
  }));
  console.log(list);
  res.json({ success: true, data: list });
});

// Add or update a connection
app.post('/api/connections', async (req, res) => {
  const { name, label, url } = req.body;

  if (!name || !url) {
    console.log("name required");
    return res.status(400).json({ success: false, error: '`name` and `url` are required' });
  }
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    console.log("valid name required");
    return res.status(400).json({ success: false, error: '`name` must be alphanumeric / hyphens / underscores only' });
  }

  // Destroy old pool if replacing
  if (registry[name]) {
    await registry[name].pool.end().catch(() => {});
  }

  registry[name] = { label: label || name, url, pool: makePool(url) };
  saveConnections();

  res.json({ success: true, data: { name, label: label || name } });
});

// Test a connection without saving
app.post('/api/connections/test', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: '`url` is required' });

  const testPool = makePool(url);
  const start = Date.now();
  try {
    await testPool.query('SELECT 1');
    res.json({ success: true, latencyMs: Date.now() - start });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  } finally {
    await testPool.end().catch(() => {});
  }
});

// Delete a connection
app.delete('/api/connections/:name', async (req, res) => {
  const { name } = req.params;
  if (!registry[name]) {
    return res.status(404).json({ success: false, error: 'Connection not found' });
  }
  await registry[name].pool.end().catch(() => {});
  delete registry[name];
  saveConnections();
  res.json({ success: true });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ':****@');
  }
}

// ─── 1. DB Connection Status ─────────────────────────────────────────────────

app.get('/api/status', resolvePool, async (req, res) => {
  const start = Date.now();
  try {
    await req.pool.query('SELECT 1');
    res.json({
      success: true,
      data: {
        connected: true,
        dbName: req.dbName,
        latencyMs: Date.now() - start,
        poolTotal: req.pool.totalCount,
        poolIdle: req.pool.idleCount,
        poolWaiting: req.pool.waitingCount,
      },
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({
      success: false,
      data: { connected: false },
      error: err.message,
    });
  }
});

// ─── 2. Database Size ─────────────────────────────────────────────────────────

app.get('/api/stats/db-size', resolvePool, async (req, res) => {
  try {
    const result = await req.pool.query(`
      SELECT
        pg_database.datname                            AS database,
        pg_size_pretty(pg_database_size(pg_database.datname)) AS pretty_size,
        pg_database_size(pg_database.datname)          AS size_bytes
      FROM pg_database
      WHERE datname = current_database()
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. Table Row Counts ──────────────────────────────────────────────────────

app.get('/api/stats/row-counts', resolvePool, async (req, res) => {
  // Use pg_class estimates for speed; accurate enough for monitoring.
  // Switch to COUNT(*) per table if you need exact numbers (slower).
  try {
    const result = await req.pool.query(`
      SELECT
        pn.nspname                    AS dataset_name,
        pc.relname                    AS table_name,
        pc.reltuples::bigint          AS estimated_rows,
        pg_size_pretty(pg_total_relation_size(pc.oid)) AS total_size
      FROM pg_class pc
      LEFT OUTER JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      WHERE relkind = 'r'
        AND pn.nspname in ('staging', 'bronze', 'silver', 'gold', 'elementary')
      ORDER BY reltuples DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. Slow Queries ──────────────────────────────────────────────────────────
// Requires pg_stat_statements extension:
//   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

app.get('/api/stats/slow-queries', resolvePool, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    // Check extension is available first
    const extCheck = await req.pool.query(`
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    `);
    if (extCheck.rowCount === 0) {
      return res.status(503).json({
        success: false,
        error: 'pg_stat_statements extension is not installed. Run: CREATE EXTENSION pg_stat_statements;',
      });
    }

    const result = await req.pool.query(`
      SELECT
        LEFT(query, 120)              AS query_preview,
        calls,
        round(mean_exec_time::numeric, 2)  AS avg_ms,
        round(total_exec_time::numeric, 2) AS total_ms,
        round(stddev_exec_time::numeric, 2) AS stddev_ms,
        rows
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC
      LIMIT $1
    `, [limit]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 5. Pipeline / Custom Metrics ────────────────────────────────────────────
// Adapt the queries below to match your pipeline's actual tables/columns.

app.get('/api/pipeline', resolvePool, async (req, res) => {
  try {
    const [jobsResult, recentResult, failedResult] = await Promise.all([

      // Total jobs by status — adjust table/column names to match yours
      req.pool.query(`
        SELECT status, COUNT(*) AS count
        FROM pipeline_jobs
        GROUP BY status
      `),

      // Last 5 completed jobs
      req.pool.query(`
        SELECT id, name, status, completed_at,
               extract(epoch FROM (completed_at - started_at))::int AS duration_sec
        FROM pipeline_jobs
        WHERE status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 5
      `),

      // Any jobs that failed in the last 24 hours
      req.pool.query(`
        SELECT id, name, error_message, failed_at
        FROM pipeline_jobs
        WHERE status = 'failed'
          AND failed_at > NOW() - INTERVAL '24 hours'
        ORDER BY failed_at DESC
      `),
    ]);

    res.json({
      success: true,
      data: {
        summary: jobsResult.rows,         // e.g. [{status:'running', count:3}, ...]
        recentCompleted: recentResult.rows,
        recentFailed: failedResult.rows,
      },
    });
  } catch (err) {
    console.log(err);
    // Return a partial failure so the dashboard still renders other cards
    res.status(500).json({
      success: false,
      error: `Pipeline query failed: ${err.message} — check your table names in server.js`,
    });
  }
});

// ─── 6. All Stats in One Shot ─────────────────────────────────────────────────
// Handy for the dashboard's single "Refresh" button

app.get('/api/all', resolvePool, async (req, res) => {
  const results = await Promise.allSettled([
    req.pool.query('SELECT 1'),                        // connection ping
    req.pool.query(`                                   
      SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty_size,
             pg_database_size(current_database()) AS size_bytes
    `),
    req.pool.query(`
      SELECT relname AS table_name, reltuples::bigint AS estimated_rows,
             pg_size_pretty(pg_total_relation_size(oid)) AS total_size
      FROM pg_class
      WHERE relkind = 'r'
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY reltuples DESC
    `),
  ]);

  const [ping, dbSize, rowCounts] = results;

  res.json({
    success: true,
    data: {
      connected:  ping.status === 'fulfilled',
      dbSize:     dbSize.status === 'fulfilled'    ? dbSize.value.rows[0]    : null,
      rowCounts:  rowCounts.status === 'fulfilled' ? rowCounts.value.rows    : [],
      fetchedAt:  new Date().toISOString(),
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

loadConnections();
app.listen(PORT, () => console.log(`🚀  API running on http://localhost:${PORT}`));
