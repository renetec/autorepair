# Admin: Shop Name, CAD Prices, Category Dropdown — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add editable shop name (stored in SQLite), display all prices as CA$, and replace the free-text category input with a dropdown of common categories.

**Architecture:** New `settings` key/value table in the existing SQLite DB holds `shop_name`. Two new Express endpoints expose it. AdminPage gains a Shop Settings card. App.tsx fetches the name and uses it in the header and AI system prompt. Price formatting switches from `$` to `CA$` in both files. Category inputs in AdminPage become a `<select>` with an "Other…" escape hatch.

**Tech Stack:** Express + better-sqlite3, React + TypeScript, Tailwind CSS, Vite

---

### Task 1: Add `settings` table + seed + GET/PUT endpoints in `server.ts`

**Files:**
- Modify: `server.ts`

**Step 1: Add the settings table creation and seed after the `parts` table block**

In `server.ts`, after the `parts` table `db.exec(...)` block (around line 24), add:

```ts
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
```

**Step 2: Add GET /api/settings endpoint**

After the `GET /api/parts` route (around line 65), add:

```ts
// GET /api/settings
app.get('/api/settings', (_req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='shop_name'").get() as { value: string } | undefined;
  res.json({ shop_name: row?.value ?? '' });
});
```

**Step 3: Add PUT /api/settings endpoint**

After the GET endpoint, add:

```ts
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
```

**Step 4: Verify — restart server and test endpoints**

```bash
curl http://localhost:3001/api/settings
# Expected: {"shop_name":"Mike's Auto Repair"}

curl -X PUT http://localhost:3001/api/settings \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{"shop_name":"Test Shop"}'
# Expected: {"ok":true}

curl http://localhost:3001/api/settings
# Expected: {"shop_name":"Test Shop"}

# Reset it back
curl -X PUT http://localhost:3001/api/settings \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{"shop_name":"Mike'\''s Auto Repair"}'
```

---

### Task 2: Shop Settings card in `AdminPage.tsx`

**Files:**
- Modify: `src/AdminPage.tsx`

**Step 1: Add `shopName` + `shopNameInput` state at the top of the component**

After the existing `useState` declarations (around line 27), add:

```ts
const [shopName, setShopName] = useState('');
const [shopNameInput, setShopNameInput] = useState('');
const [shopNameSaved, setShopNameSaved] = useState(false);
```

**Step 2: Load shop name alongside parts**

Replace the `loadParts` function with:

```ts
async function loadParts() {
  const [partsRes, settingsRes] = await Promise.all([
    fetch('/api/parts'),
    fetch('/api/settings'),
  ]);
  if (partsRes.ok) setParts(await partsRes.json());
  if (settingsRes.ok) {
    const s = await settingsRes.json();
    setShopName(s.shop_name ?? '');
    setShopNameInput(s.shop_name ?? '');
  }
}
```

**Step 3: Add saveShopName handler**

After `loadParts`, add:

```ts
async function saveShopName() {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ shop_name: shopNameInput }),
  });
  if (res.ok) {
    setShopName(shopNameInput);
    setShopNameSaved(true);
    setTimeout(() => setShopNameSaved(false), 2000);
  } else {
    const body = await res.json();
    setError(body.error ?? 'Failed to save shop name');
  }
}
```

**Step 4: Add the Shop Settings card to the JSX**

In the return block, after the `{error && ...}` block and before the "Add Part Form" card (around line 186), insert:

```tsx
{/* Shop Settings */}
<div className="bg-white rounded-2xl shadow-sm p-6">
  <h2 className="text-lg font-semibold text-slate-900 mb-4">Shop Settings</h2>
  <div className="flex gap-3 items-center">
    <input
      value={shopNameInput}
      onChange={(e) => setShopNameInput(e.target.value)}
      placeholder="Shop name"
      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
    />
    <button
      onClick={saveShopName}
      disabled={shopNameInput === shopName}
      className="bg-amber-500 text-slate-900 font-semibold rounded-lg px-4 py-2 text-sm hover:bg-amber-400 disabled:opacity-40 transition-colors"
    >
      {shopNameSaved ? 'Saved!' : 'Save'}
    </button>
  </div>
</div>
```

**Step 5: Replace the hardcoded "Mike's Auto Repair" subtitle in the header**

Find (around line 170):
```tsx
<p className="text-slate-500 text-sm">Mike's Auto Repair</p>
```
Replace with:
```tsx
<p className="text-slate-500 text-sm">{shopName}</p>
```

**Step 6: Verify in browser**

Open http://localhost:3000/admin → "Shop Settings" card appears with current name → change it → Save → subtitle updates.

---

### Task 3: Use shop name in `App.tsx` (chatbot header + AI system prompt)

**Files:**
- Modify: `src/App.tsx`

**Step 1: Change `BASE_SYSTEM_PROMPT` to use a placeholder**

Replace the hardcoded name in the constant:
```ts
const BASE_SYSTEM_PROMPT =
  "You are a helpful and knowledgeable customer service representative for {SHOP_NAME}. " +
  ...
```
Change `"Mike's Auto Repair"` to `"{SHOP_NAME}"` — this placeholder gets replaced at runtime.

**Step 2: Fetch `/api/settings` alongside `/api/parts` in `initChat`**

Replace:
```ts
const partsRes = await fetch('/api/parts');
const parts: Part[] = partsRes.ok ? await partsRes.json() : [];
priceList = formatPriceList(parts);
```
With:
```ts
const [partsRes, settingsRes] = await Promise.all([
  fetch('/api/parts'),
  fetch('/api/settings'),
]);
const parts: Part[] = partsRes.ok ? await partsRes.json() : [];
const settings = settingsRes.ok ? await settingsRes.json() : {};
const shopName: string = settings.shop_name ?? "Mike's Auto Repair";
priceList = formatPriceList(parts);
```

**Step 3: Use `shopName` in the system prompt and store it in state**

Add `const [shopName, setShopName] = useState("Mike's Auto Repair");` to the component state.

After resolving `shopName` in `initChat`, call `setShopName(shopName)`.

Pass `shopName` to the system instruction:
```ts
systemInstruction: (priceList
  ? BASE_SYSTEM_PROMPT + '\n\n' + priceList
  : BASE_SYSTEM_PROMPT).replace('{SHOP_NAME}', shopName),
```

**Step 4: Use `shopName` in the chat header JSX**

Find the hardcoded `"Mike's Auto Repair"` in the header h1 and replace with `{shopName}`.

**Step 5: Verify**

Open admin → change shop name to "Rene's Auto" → open chatbot in new tab → ask "what shop is this?" → AI should respond with "Rene's Auto".

---

### Task 4: Change `$` to `CA$` everywhere prices are displayed

**Files:**
- Modify: `src/App.tsx` (formatPriceList)
- Modify: `src/AdminPage.tsx` (table display + input placeholders)

**Step 1: Update `formatPriceList` in `App.tsx`**

Find:
```ts
const low = `$${item.price_low.toFixed(2)}`;
const high = item.price_high != null ? `–$${item.price_high.toFixed(2)}` : '';
```
Replace with:
```ts
const low = `CA$${item.price_low.toFixed(2)}`;
const high = item.price_high != null ? `–CA$${item.price_high.toFixed(2)}` : '';
```

**Step 2: Update price display in `AdminPage.tsx` table rows**

Find (two occurrences in the non-edit table row):
```tsx
<td className="px-4 py-3 text-slate-700">${part.price_low.toFixed(2)}</td>
...
{part.price_high != null ? `$${part.price_high.toFixed(2)}` : '—'}
```
Replace `$` with `CA$` in both.

**Step 3: Update input placeholders in the Add form**

Find:
```tsx
placeholder="Price low ($)"
placeholder="Price high ($) — optional"
```
Replace `$` with `CA$` in both placeholders.

**Step 4: Verify**

- `curl http://localhost:3001/api/parts` → prices unchanged in DB (numbers only)
- Open http://localhost:3000/admin → prices show as `CA$89.99`
- Open chatbot → ask "how much are tires?" → AI responds with `CA$` prices

---

### Task 5: Category dropdown in `AdminPage.tsx`

**Files:**
- Modify: `src/AdminPage.tsx`

**Step 1: Add the predefined categories constant**

Near the top of the file (before the component), add:

```ts
const COMMON_CATEGORIES = [
  'Battery',
  'Belts & Hoses',
  'Brakes',
  'Cooling System',
  'Diagnostics',
  'Electrical',
  'Engine',
  'Exhaust',
  'Filters',
  'HVAC / A/C',
  'Oil & Fluids',
  'Services',
  'Suspension & Steering',
  'Tires',
  'Transmission',
  'Wipers',
  'Other…',
] as const;
```

**Step 2: Add a `CategorySelect` helper component**

After the `COMMON_CATEGORIES` constant, add:

```tsx
function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const isCustom = value !== '' && !COMMON_CATEGORIES.slice(0, -1).includes(value as any);
  const selectValue = isCustom ? 'Other…' : value;

  return (
    <div className="flex flex-col gap-1">
      <select
        required
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === 'Other…') onChange('');
          else onChange(e.target.value);
        }}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
      >
        <option value="">Select category…</option>
        {COMMON_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {(selectValue === 'Other…' || isCustom) && (
        <input
          required
          autoFocus
          placeholder="Type custom category"
          value={isCustom ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      )}
    </div>
  );
}
```

**Step 3: Replace the category text input in the Add form**

Find:
```tsx
<input
  required
  placeholder="Category (e.g. Tires)"
  value={addForm.category}
  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
/>
```
Replace with:
```tsx
<CategorySelect
  value={addForm.category}
  onChange={(val) => setAddForm({ ...addForm, category: val })}
/>
```

**Step 4: Replace the category text input in the Edit row**

In the edit row (inside the `editId === part.id` branch), find the `editForm.category` input:
```tsx
<input
  value={editForm.category}
  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
  ...
/>
```
Replace with:
```tsx
<CategorySelect
  value={editForm.category}
  onChange={(val) => setEditForm({ ...editForm, category: val })}
/>
```
Note: the edit row renders this inside a `<td>`, so wrap `CategorySelect` in a `<td className="px-4 py-2">` replacing the existing category `<td>`.

You'll also need to add the category `<td>` to the non-edit row so the columns stay aligned:

In the non-edit `<tr>`, add a category cell before the name cell:
```tsx
<td className="px-4 py-3 text-slate-500 text-xs">{part.category}</td>
```
And add a matching header column:
```tsx
<th className="text-left px-4 py-3">Category</th>
```

Wait — currently the category is used as the section header (each table is one category). So the edit row doesn't need a separate category column in the visible table. **Skip adding a category column to the display rows.** Only the edit row needs a category cell — add it as the first cell in the edit `<tr>`:
```tsx
<td className="px-4 py-2 align-top">
  <CategorySelect
    value={editForm.category}
    onChange={(val) => setEditForm({ ...editForm, category: val })}
  />
</td>
```

**Step 5: Verify**

- Open http://localhost:3000/admin → Add form shows dropdown
- Select "Other…" → custom text input appears
- Type "Suspension" → add a part → new category section appears
- Edit an existing part → dropdown shows current category pre-selected
