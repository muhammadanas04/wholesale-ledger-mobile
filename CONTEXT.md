# Admin App — Project Context

## What This App Is

A mobile application for Android (and eventually iOS) built for a wholesale business owner / admin to manage their operations on the go. It is the mobile counterpart to the existing Wholesale Ledger desktop app. Both apps share the same Cloudflare D1 database via a Cloudflare Worker sync API.

The admin app extends the desktop app's capabilities with two new modules:
1. **Core Business** — sales, payments, customers, and bill generation
2. **Delivery Management** — driver accounts, delivery task lists, live driver tracking

---

## Relationship to Existing System

The desktop app (Electron + SQLite) already exists and handles the same D1 database. The admin app connects to the **same Cloudflare Worker** using the same `SYNC_SECRET` token. The connection is established by the user entering a base64-encoded string (`WORKER_URL|SYNC_SECRET`) in the app's Settings screen — identical to the desktop app's setup flow.

### Existing Worker Endpoints (from desktop app)
- `POST /push` — upserts records into D1, secured by `Authorization: Bearer <SYNC_SECRET>`
- `GET /pull?since=<timestamp>` — returns all records modified after the given timestamp

New endpoints will need to be added to the Worker for delivery and driver functionality (see PLAN.md).

See ~/Development/Projects/wholesale-personal for Cloudflare Workers and desktop version's codebase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK, bare or managed workflow) |
| Navigation | Expo Router (file-based, same mental model as Next.js) |
| Styling | NativeWind (Tailwind CSS for RN) |
| Local database | WatermelonDB (offline-first SQLite on device) |
| Server state | React Query (TanStack Query) |
| Global state | Zustand |
| Auth | None for admin (single-user, secret-based auth); OTP-based for drivers (separate app) |
| Backend | Cloudflare Workers (existing) |
| Database | Cloudflare D1 (existing, shared with desktop app) |
| Real-time / location | Cloudflare Durable Objects or KV for driver location updates |
| SMS / Bill sharing | React Native's `Linking` API → `sms:` URI scheme |
| PDF / Text bill | Plain text string generation on-device |
| Build & distribution | EAS Build (Expo Application Services) |

---

## Existing D1 Database Schema (from desktop app)

```sql
customers       (id, name, phone, address, balance, created_at, updated_at, synced)
products        (id, name, unit, current_stock, reorder_level, created_at, updated_at, synced)
stock_purchases (id, product_id, qty, cost_price, supplier, date, created_at, updated_at, synced)
sales           (id, customer_id, date, total_amount, notes, created_at, updated_at, synced)
sale_items      (id, sale_id, product_id, qty, unit_price, created_at, updated_at, synced)
payments        (id, customer_id, amount, date, notes, created_at, updated_at, synced)
```

New tables to be added for delivery module (see DATA_MODEL.md).

---

## Modules in Scope (Admin App — Phase 1)

### 1. Connection Setup
- Enter sync secret (base64 string) in Settings
- App decodes it, stores Worker URL + secret securely in device storage
- All API calls use this stored config

### 2. Customers
- List all customers with outstanding balance
- View individual customer detail: sales history, payment history, current balance
- Add new customer (name, phone, address)

### 3. Sales
- Record a new sale: select customer, add line items (product, qty, unit price)
- View sales list with date and amount

### 4. Payments
- Record a payment against a customer
- View payment history

### 5. Bill Generation
- Generate a plain-text bill summary for a customer:
  ```
  Customer: [Name]
  Total Sales: ₹X
  Total Paid: ₹Y
  Balance Due: ₹Z
  ```
- Copy bill text to clipboard
- Send via SMS: open native SMS app pre-filled with the customer's saved phone number and the bill text

### 6. Delivery Management
- Create driver accounts (phone number as user ID + OTP generation)
- Create delivery tasks and assign to a driver
- Each task has: delivery address, stock amount to deliver, assigned driver, status
- View live location of drivers on a map
- See delivery progress (todo / in-progress / done per task)

---

## Out of Scope (Phase 1)

- Product/inventory management (handled by desktop app)
- Stock purchases (handled by desktop app)
- Reports and PDF export (handled by desktop app)
- Driver app (separate project)
- iOS build (Android first)
- Push notifications (v2)
- Payment gateway integration

---

## Key Business Rules

- All monetary values stored as integers (paise) to avoid floating point errors
- Customer balance = sum(sales) - sum(payments), never manually edited
- Sales cannot be edited after saving; delete and re-enter to correct
- Admin app is single-user, no login screen — access is gated by possession of the sync secret
- Driver OTP is generated in the admin app and communicated manually (verbally or via SMS) to the driver
- OTP is one-time: after first login, driver app stores session locally and never asks again
- Sync is offline-first: all writes go to WatermelonDB first, then push to D1 in background

---

## Sync Strategy

Same pattern as the desktop app:
1. On app open and periodically: `GET /pull?since=<last_sync_time>` → merge into WatermelonDB
2. On any write: write to WatermelonDB immediately, queue push to `POST /push` in background
3. Mark rows `synced = true` after successful push
4. Show sync status indicator in app header

---

## Folder Structure (Planned)

```
admin-app/
├── app/                        ← Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx           ← Dashboard
│   │   ├── customers/
│   │   │   ├── index.tsx       ← Customer list
│   │   │   └── [id].tsx        ← Customer detail
│   │   ├── sales/
│   │   │   ├── index.tsx       ← Sales list
│   │   │   └── new.tsx         ← New sale form
│   │   ├── payments/
│   │   │   ├── index.tsx       ← Payments list
│   │   │   └── new.tsx         ← Record payment
│   │   └── delivery/
│   │       ├── index.tsx       ← Delivery dashboard
│   │       ├── drivers.tsx     ← Driver management
│   │       ├── new-delivery.tsx← Create delivery task
│   │       └── map.tsx         ← Live driver map
│   └── settings.tsx            ← Sync secret setup
├── components/                 ← Shared UI components
├── db/                         ← WatermelonDB models and schema
├── store/                      ← Zustand global state
├── hooks/                      ← React Query hooks + custom hooks
├── lib/
│   ├── api.ts                  ← Cloudflare Worker API client
│   ├── sync.ts                 ← Pull/push sync logic
│   ├── bill.ts                 ← Bill text generator
│   └── otp.ts                  ← OTP generation utility
└── constants/                  ← Colors, spacing, config
```
