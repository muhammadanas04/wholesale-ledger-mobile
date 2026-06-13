# Admin App — Data Model

## Existing Tables (shared with desktop app, read + write)

These tables already exist in Cloudflare D1. The admin app reads and writes all of them via the Worker sync API. WatermelonDB mirrors them locally.

```sql
customers (
  id          TEXT PRIMARY KEY,   -- UUID
  name        TEXT NOT NULL,
  phone       TEXT,               -- Used for SMS bill sending
  address     TEXT,
  balance     INTEGER DEFAULT 0,  -- Stored in paise (INR smallest unit)
  created_at  TEXT NOT NULL,      -- ISO 8601
  updated_at  TEXT NOT NULL,
  synced      INTEGER DEFAULT 0   -- 0 = unsynced, 1 = synced
)

products (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL,  -- 'kg', 'box', 'piece', etc.
  current_stock   INTEGER DEFAULT 0,
  reorder_level   INTEGER DEFAULT 0,
  created_at      TEXT,
  updated_at      TEXT,
  synced          INTEGER DEFAULT 0
)

sales (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  date          TEXT NOT NULL,
  total_amount  INTEGER NOT NULL,  -- paise
  notes         TEXT,
  created_at    TEXT,
  updated_at    TEXT,
  synced        INTEGER DEFAULT 0
)

sale_items (
  id          TEXT PRIMARY KEY,
  sale_id     TEXT NOT NULL REFERENCES sales(id),
  product_id  TEXT NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL,
  unit_price  INTEGER NOT NULL,   -- paise per unit
  created_at  TEXT,
  updated_at  TEXT,
  synced      INTEGER DEFAULT 0
)

payments (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  amount        INTEGER NOT NULL,  -- paise
  date          TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT,
  updated_at    TEXT,
  synced        INTEGER DEFAULT 0
)

stock_purchases (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  cost_price  INTEGER NOT NULL,
  supplier    TEXT,
  date        TEXT,
  created_at  TEXT,
  updated_at  TEXT,
  synced      INTEGER DEFAULT 0
)
```

---

## New Tables (added for delivery module)

These must be added to both the Cloudflare D1 database (via migration) and the WatermelonDB local schema.

```sql
drivers (
  id          TEXT PRIMARY KEY,   -- UUID
  phone       TEXT NOT NULL UNIQUE, -- Acts as user ID for driver login
  name        TEXT,
  otp         TEXT,               -- Hashed or plain (one-time, short-lived)
  otp_used    INTEGER DEFAULT 0,  -- 0 = unused, 1 = consumed on first login
  active      INTEGER DEFAULT 1,  -- 0 = deactivated driver
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  synced      INTEGER DEFAULT 0
)

deliveries (
  id            TEXT PRIMARY KEY,
  driver_id     TEXT NOT NULL REFERENCES drivers(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  status        TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed'
  notes         TEXT,
  synced        INTEGER DEFAULT 0
)

delivery_items (
  id              TEXT PRIMARY KEY,
  delivery_id     TEXT NOT NULL REFERENCES deliveries(id),
  address         TEXT NOT NULL,
  stock_amount    TEXT NOT NULL,  -- Free text: e.g. "5 boxes of Rice, 2 kg Sugar"
  status          TEXT DEFAULT 'pending', -- 'pending' | 'done'
  customer_id     TEXT,           -- Optional link to existing customer
  notes           TEXT,
  created_at      TEXT,
  updated_at      TEXT,
  synced          INTEGER DEFAULT 0
)

driver_locations (
  id          TEXT PRIMARY KEY,
  driver_id   TEXT NOT NULL REFERENCES drivers(id),
  latitude    REAL NOT NULL,
  longitude   REAL NOT NULL,
  recorded_at TEXT NOT NULL,      -- ISO 8601 timestamp
  -- Note: this table is NOT synced via the standard push/pull cycle
  -- It is updated via a separate real-time endpoint on the Worker
)
```

---

## WatermelonDB Model Mapping

WatermelonDB uses its own schema definition. Each D1 table maps to a WatermelonDB `Model` class and a `tableSchema` entry.

Key WatermelonDB-specific notes:
- All IDs are strings (UUIDs generated client-side via `uuid` or `crypto.randomUUID()`)
- `synced` column maps to WatermelonDB's built-in dirty/sync tracking — use `@readonly @date` for timestamps
- Relationships use `@relation` decorators

```
models/
├── Customer.ts
├── Product.ts
├── Sale.ts
├── SaleItem.ts
├── Payment.ts
├── Driver.ts
├── Delivery.ts
└── DeliveryItem.ts
```

---

## D1 Migration SQL (add to existing Worker)

```sql
-- Run once to add new tables to existing D1 database

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  otp TEXT,
  otp_used INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  address TEXT NOT NULL,
  stock_amount TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  customer_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS driver_locations (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
```

---

## Key Derived Values (computed, not stored)

| Value | Formula |
|---|---|
| Customer outstanding balance | `SUM(sales.total_amount) - SUM(payments.amount)` WHERE `customer_id = X` |
| Bill text | Derived from above: name + total sales + total paid + balance |
| Delivery progress % | `COUNT(items WHERE status='done') / COUNT(all items) * 100` |
