const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
const SECRET = process.env.JWT_SECRET;
const pool = new Pool({
  host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function init() {
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
      return;
    } catch (e) { console.log('waiting for postgres...'); await sleep(2000); }
  }
  throw new Error('postgres unreachable');
}

const sign = (u) => jwt.sign({ sub: u.id, email: u.email, name: u.name }, SECRET, { expiresIn: '2h' });

app.get('/healthz', (_, res) => res.send('ok'));
app.get('/readyz', async (_, res) => {
  try { await pool.query('SELECT 1'); res.send('ready'); } catch { res.status(503).send('db down'); }
});

app.post('/api/users/register', async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password || password.length < 6) return res.status(400).json({ error: 'email, name and password (min 6) required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id,email,name', [email, name, hash]);
    res.status(201).json({ user: rows[0], token: sign(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email already registered' });
    console.error(e); res.status(500).json({ error: 'internal error' });
  }
});

app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  if (!rows[0] || !(await bcrypt.compare(password || '', rows[0].password_hash))) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ user: { id: rows[0].id, email: rows[0].email, name: rows[0].name }, token: sign(rows[0]) });
});

app.get('/api/users/me', (req, res) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    res.json({ id: p.sub, email: p.email, name: p.name });
  } catch { res.status(401).json({ error: 'unauthorized' }); }
});

init().then(() => {
  const server = app.listen(3001, () => console.log('user-service on 3001'));
  process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
}).catch((e) => { console.error(e); process.exit(1); });
