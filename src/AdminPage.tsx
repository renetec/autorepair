import { useState, useEffect } from 'react';
import { Wrench, Plus, Pencil, Trash2, Check, X, LogIn } from 'lucide-react';

type Part = {
  id: number;
  category: string;
  name: string;
  price_low: number;
  price_high: number | null;
  notes: string | null;
};

type PartForm = {
  category: string;
  name: string;
  price_low: string;
  price_high: string;
  notes: string;
};

const emptyForm: PartForm = { category: '', name: '', price_low: '', price_high: '', notes: '' };

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

function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const isCustom = value !== '' && !(COMMON_CATEGORIES as readonly string[]).slice(0, -1).includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);
  const selectValue = (showCustom || isCustom) ? 'Other…' : value;

  return (
    <div className="flex flex-col gap-1">
      <select
        required
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === 'Other…') {
            setShowCustom(true);
            onChange('');
          } else {
            setShowCustom(false);
            onChange(e.target.value);
          }
        }}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
      >
        <option value="">Select category…</option>
        {COMMON_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {(showCustom || isCustom) && (
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

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('admin_key') ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [error, setError] = useState('');
  const [addForm, setAddForm] = useState<PartForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PartForm>(emptyForm);
  const [shopName, setShopName] = useState('');
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopNameSaved, setShopNameSaved] = useState(false);

  function headers() {
    return { 'Content-Type': 'application/json', 'x-admin-key': adminKey };
  }

  async function loadParts() {
    const res = await fetch('/api/parts');
    if (res.ok) setParts(await res.json());
  }

  async function loadSettings() {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const s = await res.json();
      setShopName(s.shop_name ?? '');
      setShopNameInput(s.shop_name ?? '');
    }
  }

  async function saveShopName() {
    try {
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
    } catch {
      setError('Network error — could not save shop name');
    }
  }

  async function tryAuth() {
    // Verify key by attempting a no-op: fetch parts (public) then check admin with a HEAD-like probe
    // We just store and try; a 401 on any mutation will surface the error
    localStorage.setItem('admin_key', keyInput);
    setAdminKey(keyInput);
    setAuthed(true);
    setError('');
  }

  useEffect(() => {
    if (authed || adminKey) {
      setAuthed(true);
      loadParts();
      loadSettings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          category: addForm.category,
          name: addForm.name,
          price_low: parseFloat(addForm.price_low),
          price_high: addForm.price_high ? parseFloat(addForm.price_high) : null,
          notes: addForm.notes || null,
        }),
      });
      if (res.ok) {
        setAddForm(emptyForm);
        setError('');
        loadParts();
      } else {
        const body = await res.json();
        setError(body.error ?? 'Failed to add part');
      }
    } catch {
      setError('Network error — could not add part');
    }
  }

  function startEdit(part: Part) {
    setEditId(part.id);
    setEditForm({
      category: part.category,
      name: part.name,
      price_low: String(part.price_low),
      price_high: part.price_high != null ? String(part.price_high) : '',
      notes: part.notes ?? '',
    });
  }

  async function handleSaveEdit(id: number) {
    try {
      const res = await fetch(`/api/parts/${id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          category: editForm.category,
          name: editForm.name,
          price_low: parseFloat(editForm.price_low),
          price_high: editForm.price_high ? parseFloat(editForm.price_high) : null,
          notes: editForm.notes || null,
        }),
      });
      if (res.ok) {
        setEditId(null);
        setError('');
        loadParts();
      } else {
        const body = await res.json();
        setError(body.error ?? 'Failed to update part');
      }
    } catch {
      setError('Network error — could not update part');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this part?')) return;
    const res = await fetch(`/api/parts/${id}`, { method: 'DELETE', headers: headers() });
    if (res.ok) {
      setError('');
      loadParts();
    } else {
      const body = await res.json();
      setError(body.error ?? 'Failed to delete part');
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-500 p-2 rounded-xl">
              <Wrench className="w-5 h-5 text-slate-900" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Admin Login</h1>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); tryAuth(); }} className="space-y-4">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter admin key"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="w-full bg-slate-900 text-white rounded-xl py-3 font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn size={16} />
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  const categories = Array.from(new Set(parts.map((p) => p.category)));

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-xl">
            <Wrench className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Parts & Prices Admin</h1>
            {shopName && <p className="text-slate-500 text-sm">{shopName}</p>}
          </div>
          <button
            onClick={() => { localStorage.removeItem('admin_key'); setAdminKey(''); setAuthed(false); setKeyInput(''); }}
            className="ml-auto text-slate-400 hover:text-slate-600 text-sm"
          >
            Sign out
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

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

        {/* Add Part Form */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Plus size={18} className="text-amber-500" /> Add New Part / Service
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CategorySelect
              value={addForm.category}
              onChange={(val) => setAddForm({ ...addForm, category: val })}
            />
            <input
              required
              placeholder="Name (e.g. Standard tire 15-17 inch)"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder="Price low (CA$)"
              value={addForm.price_low}
              onChange={(e) => setAddForm({ ...addForm, price_low: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Price high (CA$) — optional"
              value={addForm.price_high}
              onChange={(e) => setAddForm({ ...addForm, price_high: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              placeholder="Notes — optional (e.g. per tire, installed)"
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="sm:col-span-2 bg-amber-500 text-slate-900 font-semibold rounded-lg py-2.5 hover:bg-amber-400 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={16} /> Add Part
            </button>
          </form>
        </div>

        {/* Parts Table by Category */}
        {categories.map((cat) => (
          <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-800 text-white px-6 py-3 text-sm font-semibold tracking-wide">
              {cat}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3">Name</th>
                  <th className="text-left px-4 py-3">Low</th>
                  <th className="text-left px-4 py-3">High</th>
                  <th className="text-left px-4 py-3">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {parts.filter((p) => p.category === cat).map((part) =>
                  editId === part.id ? (
                    <tr key={part.id} className="border-b border-slate-100 bg-amber-50">
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <CategorySelect
                            value={editForm.category}
                            onChange={(val) => setEditForm({ ...editForm, category: val })}
                          />
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="border border-slate-200 rounded px-2 py-1 w-full text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.price_low}
                          onChange={(e) => setEditForm({ ...editForm, price_low: e.target.value })}
                          className="border border-slate-200 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.price_high}
                          onChange={(e) => setEditForm({ ...editForm, price_high: e.target.value })}
                          className="border border-slate-200 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className="border border-slate-200 rounded px-2 py-1 w-full text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-2 flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleSaveEdit(part.id)}
                          className="text-emerald-600 hover:text-emerald-700"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-slate-400 hover:text-slate-600"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={part.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-3 text-slate-800">{part.name}</td>
                      <td className="px-4 py-3 text-slate-700">CA${part.price_low.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {part.price_high != null ? `CA$${part.price_high.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{part.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button
                            onClick={() => startEdit(part)}
                            className="text-slate-400 hover:text-amber-500 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(part.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
