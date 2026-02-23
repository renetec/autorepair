# Design: Admin — Shop Name, CAD Prices, Category Dropdown

Date: 2026-02-23

## Summary

Three improvements to the admin page:
1. Shop name editable from admin (stored in SQLite, used by chatbot)
2. All prices display as CA$ (Canadian dollars)
3. Category field replaced with dropdown of common categories + "Other…" custom entry

## 1. Shop Name

**Storage:** New `settings` table in SQLite (key TEXT, value TEXT).
Seeded with `shop_name = "Mike's Auto Repair"`.

**API:**
- `GET /api/settings` — public, returns `{ shop_name: string }`
- `PUT /api/settings` — admin-protected, accepts `{ shop_name: string }`

**Admin page:** New "Shop Settings" card above the price tables.
Editable text field + Save button. Shows current name on load.

**Chatbot (App.tsx):** Fetches `/api/settings` alongside `/api/parts` on init.
- Uses `shop_name` in the chat header (replacing hardcoded "Mike's Auto Repair")
- Injects shop name into the AI system prompt

## 2. Canadian Dollars

- All price display formatting changes `$` → `CA$` in AdminPage.tsx and App.tsx (formatPriceList)
- Input placeholders updated to say `CA$`
- No database changes

## 3. Category Dropdown

Predefined list:
Tires, Brakes, Battery, Filters, Wipers, Oil & Fluids, Belts & Hoses,
Cooling System, Electrical, Exhaust, Engine, Transmission,
Suspension & Steering, HVAC / A/C, Services, Diagnostics, Other…

Selecting "Other…" reveals a text input for a custom category.
Applied to both the Add form and the inline Edit row in AdminPage.tsx.

## Files Changed

- `server.ts` — settings table + seed + GET/PUT /api/settings
- `src/AdminPage.tsx` — shop settings card, CAD display, category dropdown
- `src/App.tsx` — fetch settings, use shop_name in header + system prompt, CA$ in formatPriceList

## Future Ideas (noted from user)

VIN lookup research for a future feature:
- NHTSA vPIC API (free) — decodes VIN, returns year/make/model/trim/engine
- Open Vehicle DB (GitHub) — free make/model/year database
- TheDataPlanet Auto Parts DB (~$200-300 one-time) — 13.8GB MySQL, 521k parts, 59 makes 1985-2021
- Auto Care VCDB (subscription) — industry standard vehicle config database
- TecDoc-style API on RapidAPI — has free tier
Architecture idea: customer enters VIN → NHTSA decode → match to local parts DB → return estimate
