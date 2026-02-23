import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '.env.local') });
dotenvConfig({ path: path.join(__dirname, '.env') });

if (!process.env.ADMIN_KEY) {
  console.error('FATAL: ADMIN_KEY environment variable is not set. Exiting.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '16kb' }));

// Rate limiters
const chatLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

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

// System prompt (server-side only — never sent to browser)
const BASE_SYSTEM_PROMPT =
  "You are a helpful and knowledgeable customer service representative for {SHOP_NAME}. " +
  "You can answer questions about common car issues, provide pricing for services using the price list provided, " +
  "and help customers understand when they need to bring their car in for a diagnostic. " +
  "Be polite, professional, and reassuring. " +
  "If a problem sounds dangerous (like failing brakes, severe engine knocking, or flashing check engine light), " +
  "advise them to stop driving and get it towed. " +
  "Do not make definitive diagnoses without seeing the car. " +
  "When quoting prices, always use the prices in the price list below — do not guess or use outside knowledge for pricing. " +
  "Keep your responses concise and easy to read, using markdown formatting for lists or emphasis where appropriate.";

function buildPriceList(): string {
  type Row = { category: string; name: string; price_low: number; price_high: number | null; notes: string | null };
  const parts = db.prepare('SELECT * FROM parts ORDER BY category, name').all() as Row[];
  const lines: string[] = ['OUR CURRENT PRICES:'];
  const byCategory: Record<string, Row[]> = {};
  for (const p of parts) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }
  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`\n${category}:`);
    for (const item of items) {
      const low = `CA$${item.price_low.toFixed(2)}`;
      const high = item.price_high != null ? `–CA$${item.price_high.toFixed(2)}` : '';
      const note = item.notes ? ` (${item.notes})` : '';
      lines.push(`- ${item.name}: ${low}${high}${note}`);
    }
  }
  return lines.join('\n');
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
app.put('/api/settings', adminLimiter, requireAdmin, (req, res) => {
  const { shop_name } = req.body;
  if (!shop_name || typeof shop_name !== 'string') {
    res.status(400).json({ error: 'shop_name is required' });
    return;
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_name', ?)").run(shop_name.trim());
  res.json({ ok: true });
});

// POST /api/parts
app.post('/api/parts', adminLimiter, requireAdmin, (req, res) => {
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
app.put('/api/parts/:id', adminLimiter, requireAdmin, (req, res) => {
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
app.delete('/api/parts/:id', adminLimiter, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM parts WHERE id=?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Part not found' });
    return;
  }
  res.json({ ok: true });
});

// POST /api/chat — Gemini proxy (key never leaves the server)
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  if (message.length > 1000) {
    res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI service not configured' });
    return;
  }

  try {
    const shopRow = db.prepare("SELECT value FROM settings WHERE key='shop_name'").get() as { value: string } | undefined;
    const shopName = shopRow?.value ?? 'Auto Repair Shop';
    const priceList = buildPriceList();
    const systemInstruction = (BASE_SYSTEM_PROMPT + '\n\n' + priceList).replace('{SHOP_NAME}', shopName);

    const safeHistory = Array.isArray(history)
      ? history
          .filter((m: any) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
          .map((m: any) => ({ role: m.role, parts: [{ text: m.text }] }))
      : [];

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: 'gemini-2.0-flash',
      config: { systemInstruction },
      history: safeHistory,
    });

    const response = await chat.sendMessage({ message: message.trim() });
    res.json({ text: response.text ?? '' });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'AI service error' });
  }
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
