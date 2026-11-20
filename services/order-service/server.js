const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
const SECRET = process.env.JWT_SECRET;
const CATALOG_URL = process.env.CATALOG_URL; // e.g. http://catalog-service:3002
const pool = new Pool({
  host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function init() {
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS orders(
        id SERIAL PRIMARY KEY, user_id INT NOT NULL, items JSONB NOT NULL,
        total NUMERIC(10,2) NOT NULL, status TEXT NOT NULL DEFAULT 'CONFIRMED',
        created_at TIMESTAMPTZ DEFAULT now())`);
      return;
    } catch (e) { console.log('waiting for postgres...'); await sleep(2000); }
  }
  throw new Error('postgres unreachable');
}

function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'unauthorized' }); }
}

app.get('/healthz', (_, res) => res.send('ok'));
app.get('/readyz', async (_, res) => {
  try { await pool.query('SELECT 1'); res.send('ready'); } catch { res.status(503).send('db down'); }
});

app.post('/api/orders', auth, async (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items required' });
  try {
    let total = 0; const lines = [];
    for (const it of items) {
      const qty = parseInt(it.qty, 10);
      if (!it.productId || !(qty > 0)) return res.status(400).json({ error: 'invalid item' });
      const r = await fetch(`${CATALOG_URL}/api/products/${it.productId}`);
      if (!r.ok) return res.status(400).json({ error: `unknown product ${it.productId}` });
      const p = await r.json();
      total += p.price * qty;
      lines.push({ productId: it.productId, name: p.name, price: p.price, qty });
    }
    const { rows } = await pool.query(
      'INSERT INTO orders(user_id, items, total) VALUES($1,$2,$3) RETURNING *',
      [req.user.sub, JSON.stringify(lines), total.toFixed(2)]);
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(502).json({ error: 'could not create order' }); }
});

app.get('/api/orders', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [req.user.sub]);
  res.json(rows);
});

init().then(() => {
  const server = app.listen(3003, () => console.log('order-service on 3003'));
  process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
}).catch((e) => { console.error(e); process.exit(1); });
