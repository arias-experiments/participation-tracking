import pg from 'pg';

export const pool = new pg.Pool({
  host: process.env.DB_HOST || 'database',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'participation',
  user: process.env.DB_USER || 'participation_user',
  password: process.env.DB_PASSWORD || 'participation_password',
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
});
pool.on('error', (error) => console.error('Database pool error:', error.message));
