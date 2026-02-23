import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '.env.local') });
dotenvConfig({ path: path.join(__dirname, '.env') });

if (!process.env.ADMIN_KEY) {
  console.error('FATAL: ADMIN_KEY environment variable is not set. Exiting.');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Init SQLite
const db = new Database(path.join(__dirname, 'prices.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price_low REAL NOT NULL,
    price_high REAL,
    notes TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Seed default shop name if not set
const shopNameRow = db.prepare("SELECT value FROM settings WHERE key='shop_name'").get();
if (!shopNameRow) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('shop_name', 'Mike''s Auto Repair')").run();
}

// Seed if empty
const count = (db.prepare('SELECT COUNT(*) as cnt FROM parts').get() as { cnt: number }).cnt;
if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO parts (category, name, price_low, price_high, notes) VALUES (?, ?, ?, ?, ?)'
  );
  const seed = [
    // Tires
    ['Tires', 'Standard tire (15"–17")', 89.99, 119.99, 'per tire, installed'],
    ['Tires', 'Large tire (18"–20")', 129.99, 169.99, 'per tire, installed'],
    ['Tires', 'Truck / SUV tire', 149.99, 199.99, 'per tire, installed'],
    // Filters
    ['Filters', 'Oil filter', 12.99, null, 'included with oil change'],
    ['Filters', 'Engine air filter', 24.99, 39.99, 'parts + labor'],
    ['Filters', 'Cabin air filter', 29.99, 49.99, 'parts + labor'],
    // Wipers
    ['Wipers', 'Wiper blade (each)', 14.99, 24.99, 'per blade, installed'],
    // Brakes
    ['Brakes', 'Brake pads (front or rear)', 89.99, 149.99, 'parts only; labor extra'],
    // Battery
    ['Battery', 'Standard battery (group 35/47)', 129.99, 179.99, 'parts + installation'],
    ['Battery', 'Premium battery (AGM)', 189.99, 249.99, 'parts + installation'],
    // Services
    ['Services', 'Oil change (conventional)', 39.99, 59.99, 'includes filter + labor'],
    ['Services', 'Oil change (synthetic)', 69.99, 89.99, 'includes filter + labor'],
    ['Services', 'Brake pad replacement (axle)', 149.99, 249.99, 'parts + labor'],
    ['Services', 'Tire rotation', 19.99, null, 'labor only'],
    ['Services', 'Battery test', 0, null, 'free'],
  ] as [string, string, number, number | null, string | null][];
  for (const row of seed) {
    insert.run(...row);
  }
}

// Admin auth middleware
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// GET /api/parts
app.get('/api/parts', (_req, res) => {
  const parts = db.prepare('SELECT * FROM parts ORDER BY category, name').all();
  res.json(parts);
});

// GET /api/settings
app.get('/api/settings', (_req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='shop_name'").get() as { value: string } | undefined;
  res.json({ shop_name: row?.value ?? '' });
});

// PUT /api/settings
app.put('/api/settings', requireAdmin, (req, res) => {
  const { shop_name } = req.body;
  if (!shop_name || typeof shop_name !== 'string') {
    res.status(400).json({ error: 'shop_name is required' });
    return;
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_name', ?)").run(shop_name.trim());
  res.json({ ok: true });
});

// POST /api/parts
app.post('/api/parts', requireAdmin, (req, res) => {
  const { category, name, price_low, price_high, notes } = req.body;
  if (!category || !name || price_low == null) {
    res.status(400).json({ error: 'category, name, and price_low are required' });
    return;
  }
  const result = db
    .prepare('INSERT INTO parts (category, name, price_low, price_high, notes) VALUES (?, ?, ?, ?, ?)')
    .run(category, name, price_low, price_high ?? null, notes ?? null);
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/parts/:id
app.put('/api/parts/:id', requireAdmin, (req, res) => {
  const { category, name, price_low, price_high, notes } = req.body;
  const id = Number(req.params.id);
  if (!category || !name || price_low == null) {
    res.status(400).json({ error: 'category, name, and price_low are required' });
    return;
  }
  const result = db
    .prepare(
      'UPDATE parts SET category=?, name=?, price_low=?, price_high=?, notes=? WHERE id=?'
    )
    .run(category, name, price_low, price_high ?? null, notes ?? null, id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Part not found' });
    return;
  }
  res.json({ ok: true });
});

// DELETE /api/parts/:id
app.delete('/api/parts/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM parts WHERE id=?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Part not found' });
    return;
  }
  res.json({ ok: true });
});

// GET /api/config — runtime config for the frontend
app.get('/api/config', (_req, res) => {
  res.json({ gemini_api_key: process.env.GEMINI_API_KEY ?? '' });
});

// Serve built frontend (production)
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
