const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(express.json());
const client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 3000 });
let products;

const SEED = [
  { name: 'Mechanical Keyboard', price: 89.9, stock: 40, category: 'hardware', emoji: '⌨️' },
  { name: 'Ergonomic Mouse', price: 45.0, stock: 60, category: 'hardware', emoji: '🖱️' },
  { name: 'USB-C Hub', price: 32.5, stock: 100, category: 'hardware', emoji: '🔌' },
  { name: 'Kubernetes in Action', price: 49.0, stock: 25, category: 'books', emoji: '📘' },
  { name: 'Docker Deep Dive', price: 39.0, stock: 30, category: 'books', emoji: '📗' },
  { name: 'Noise-Cancelling Headset', price: 129.0, stock: 15, category: 'audio', emoji: '🎧' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function init() {
  for (let i = 0; i < 30; i++) {
    try {
      await client.connect();
      products = client.db('catalog').collection('products');
      await products.createIndex({ name: 1 }, { unique: true });
      await products.bulkWrite(SEED.map((p) => ({
        updateOne: { filter: { name: p.name }, update: { $setOnInsert: p }, upsert: true },
      })));
      return;
    } catch (e) { console.log('waiting for mongo...'); await sleep(2000); }
  }
  throw new Error('mongo unreachable');
}

app.get('/healthz', (_, res) => res.send('ok'));
app.get('/readyz', async (_, res) => {
  try { await client.db('admin').command({ ping: 1 }); res.send('ready'); } catch { res.status(503).send('db down'); }
});

app.get('/api/products', async (req, res) => {
  const q = req.query.category ? { category: req.query.category } : {};
  res.json(await products.find(q).toArray());
});

app.get('/api/products/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const p = await products.findOne({ _id: new ObjectId(req.params.id) });
  p ? res.json(p) : res.status(404).json({ error: 'not found' });
});

init().then(() => {
  const server = app.listen(3002, () => console.log('catalog-service on 3002'));
  process.on('SIGTERM', () => server.close(() => client.close().then(() => process.exit(0))));
}).catch((e) => { console.error(e); process.exit(1); });
