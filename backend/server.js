import express from 'express';
import { readFile } from 'node:fs/promises';
import { courses, apiError } from './courses.js';
import { pool } from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'participation-backend' });
});

app.get('/api/health/database', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

app.use('/api/courses', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, courses);
app.use(apiError);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
// Apply additive schema on every startup, including existing Docker volumes.
await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));

const server = app.listen(port, host, () => {
  console.log(`Participation backend listening on ${host}:${port}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timeout);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
