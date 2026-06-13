# Admin App — Build Plan

## Overview

Mobile app (Android-first) for a wholesale business admin. Connects to the existing Cloudflare Worker + D1 database used by the Wholesale Ledger desktop app. Adds delivery management and mobile bill sending on top of the existing sales/payment/customer data.

**Stack:** React Native + Expo + WatermelonDB + NativeWind + Zustand + React Query + Cloudflare Workers/D1

Read CONTEXT.md for full context. Read DATA_MODEL.md for schema. Read API_SPEC.md for all endpoints.

---

## Milestones

| # | Milestone | Deliverable |
|---|---|---|
| 1 | Project scaffold & DB setup | Working app shell, WatermelonDB configured, sync skeleton |
| 2 | Settings + sync connection | Sync secret entry, pull/push working end-to-end |
| 3 | Customers module | List, detail, add customer |
| 4 | Sales module | List, new sale with line items |
| 5 | Payments module | List, record payment |
| 6 | Bill generation | Text bill, copy, SMS redirect |
| 7 | Delivery — drivers | Create driver, generate OTP |
| 8 | Delivery — tasks | Create delivery, assign to driver, progress view |
| 9 | Delivery — live map | Driver location polling, map display |
| 10 | Polish & edge cases | Offline handling, empty states, error states |

---

## Milestone 1 — Project Scaffold & DB Setup

### Tasks
- `npx create-expo-app admin-app --template tabs` (TypeScript)
- Install dependencies:
  ```
  nativewind tailwindcss
  @nozbe/watermelondb
  @tanstack/react-query
  zustand
  expo-secure-store
  expo-clipboard
  expo-linking
  react-native-maps
  ```
- Configure NativeWind: `tailwind.config.js`, `babel.config.js`, `global.css`
- Set up WatermelonDB:
  - Create `db/schema.ts` with ALL table definitions (existing + new delivery tables)
  - Create model classes in `db/models/`: Customer, Product, Sale, SaleItem, Payment, Driver, Delivery, DeliveryItem
  - Create `db/index.ts` that instantiates the Database
- Set up Expo Router file structure (see folder structure in CONTEXT.md)
- Set up React Query provider in `app/_layout.tsx`
- Set up Zustand store in `store/app.ts` (holds: syncConfig, lastSyncTime, syncStatus)

### WatermelonDB Schema (db/schema.ts)
Define `tableSchema` for:
- `customers` — id, name, phone, address, balance, created_at, updated_at, synced
- `products` — id, name, unit, current_stock, reorder_level, created_at, updated_at, synced
- `sales` — id, customer_id, date, total_amount, notes, created_at, updated_at, synced
- `sale_items` — id, sale_id, product_id, qty, unit_price, created_at, updated_at, synced
- `payments` — id, customer_id, amount, date, notes, created_at, updated_at, synced
- `drivers` — id, phone, name, otp, otp_used, active, created_at, updated_at, synced
- `deliveries` — id, driver_id, status, notes, created_at, updated_at, synced
- `delivery_items` — id, delivery_id, address, stock_amount, status, customer_id, notes, created_at, updated_at, synced

**Important:** WatermelonDB does not use `TEXT PRIMARY KEY`. Use `string` column type for IDs. Generate UUIDs client-side with `crypto.randomUUID()`.

---

## Milestone 2 — Settings + Sync Connection

### Screens
- `app/settings.tsx` — Settings screen

### Settings Screen UI
- Text input: "Enter Sync Key"
- Helper text: "Paste the base64 key from your Cloudflare Worker settings"
- Save button → decodes base64 → extracts `WORKER_URL` and `SYNC_SECRET` → stores both in `expo-secure-store`
- Shows current connection status: green dot "Connected" or red dot "Not configured"
- "Test Connection" button → calls `GET /pull?since=1970-01-01T00:00:00Z` → if 200, show success toast; else show error

### Decode Logic (lib/api.ts)
```ts
// Input: base64 string like btoa("https://worker.url|SECRET123")
function decodeSyncKey(base64: string): { workerUrl: string; secret: string } {
  const decoded = atob(base64); // "https://worker.url|SECRET123"
  const [workerUrl, secret] = decoded.split('|');
  return { workerUrl, secret };
}
```

### Sync Logic (lib/sync.ts)

**pull():**
1. Get `last_sync_time` from Zustand store (default: `1970-01-01T00:00:00Z` for first sync)
2. Call `GET /pull?since=<last_sync_time>` with auth header
3. For each record in response: upsert into WatermelonDB using `database.write(() => collection.upsert(...))`
4. Update `last_sync_time` in Zustand + AsyncStorage
5. Also call `GET /pull/delivery?since=<last_sync_time>` → upsert drivers, deliveries, delivery_items

**push():**
1. Query WatermelonDB for all rows where `synced = 0` across all tables
2. Batch them into the push request body
3. Call `POST /push` with auth header
4. On success: mark all pushed rows `synced = 1` in a WatermelonDB write transaction
5. Repeat for `POST /push/delivery`

**Sync trigger points:**
- App comes to foreground (`AppState` change)
- After any write (debounced 2s)
- Manual pull-to-refresh in list screens

---

## Milestone 3 — Customers Module

### Screens
- `app/(tabs)/customers/index.tsx` — Customer list
- `app/(tabs)/customers/[id].tsx` — Customer detail
- `app/(tabs)/customers/new.tsx` — Add customer form

### Customer List Screen
- Shows: name, phone, balance (formatted as ₹X.XX)
- Sorted by: outstanding balance descending (highest debt first)
- Search bar: filter by name or phone
- FAB (floating action button): navigate to `new.tsx`
- Pull-to-refresh: triggers sync pull

**Balance display rule:**
- Balance > 0 (owes money): show in red
- Balance = 0: show in green
- Balance < 0 (overpaid): show in orange (edge case)

### Customer Detail Screen
Header: customer name + phone + current balance

Tabs:
1. **Sales** — list of all sales for this customer (date, total_amount)
2. **Payments** — list of all payments (date, amount)
3. **Bill** — bill generation (see Milestone 6)

Each sale row: tap → show sale items (product name, qty, unit_price, line total)

Action buttons:
- "Record Payment" → navigate to `payments/new.tsx?customerId=X`
- "New Sale" → navigate to `sales/new.tsx?customerId=X`

### Add Customer Form
Fields: Name (required), Phone (required, numeric, 10 digits), Address (optional)
On save: generate UUID, set `created_at`, `updated_at`, `synced=0`, write to WatermelonDB → trigger sync push

---

## Milestone 4 — Sales Module

### Screens
- `app/(tabs)/sales/index.tsx` — Sales list
- `app/(tabs)/sales/new.tsx` — New sale form

### Sales List Screen
- Shows: customer name, date, total_amount
- Sorted by date descending
- Filter by customer (dropdown or search)

### New Sale Form
1. Customer selector — searchable dropdown from WatermelonDB customers
2. Date picker — defaults to today
3. Line items section:
   - "Add Item" button → opens product picker modal
   - Each line item row: product name, qty input, unit_price input, line total (calculated)
   - Delete icon per line item
4. Total amount display (sum of all line items, recalculates live)
5. Notes (optional)
6. "Save Sale" button

**On save:**
- Validate: at least 1 line item, qty > 0, unit_price > 0
- Generate UUIDs for sale + each sale_item
- Calculate total_amount = sum of (qty * unit_price) for all items
- Write sale + sale_items to WatermelonDB in a single `database.write()` transaction
- Set all as `synced = 0`
- Update customer balance in WatermelonDB: `customer.balance += total_amount`
- Trigger sync push
- Navigate back to customer detail or sales list

**Product picker modal:**
- Shows product list from WatermelonDB
- Search by name
- On select: pre-fills product name, unit
- User enters qty and unit_price manually

---

## Milestone 5 — Payments Module

### Screens
- `app/(tabs)/payments/index.tsx` — Payments list
- `app/(tabs)/payments/new.tsx` — Record payment

### Payments List Screen
- Shows: customer name, date, amount
- Sorted by date descending

### Record Payment Form
Fields:
- Customer selector (searchable dropdown) — pre-filled if navigated from customer detail
- Amount (numeric input, required)
- Date (defaults to today)
- Notes (optional)

**On save:**
- Generate UUID
- Write to WatermelonDB payments table, `synced = 0`
- Update customer balance: `customer.balance -= amount`
- Trigger sync push
- Navigate back

---

## Milestone 6 — Bill Generation

### Location: Tab inside Customer Detail screen

### Bill Text Format
```
[Business Name]
Date: DD/MM/YYYY

Customer: [Name]
Phone: [Phone]

Total Sales:    ₹X,XXX
Total Paid:     ₹X,XXX
─────────────────────
Balance Due:    ₹X,XXX
```

**Calculation:**
- Total Sales = `SUM(sales.total_amount)` for this customer from WatermelonDB
- Total Paid = `SUM(payments.amount)` for this customer from WatermelonDB
- Balance Due = Total Sales - Total Paid

### Bill Actions

**Copy to Clipboard:**
- Uses `expo-clipboard` → `Clipboard.setStringAsync(billText)`
- Show toast: "Bill copied!"

**Send via SMS:**
- Uses `Linking.openURL('sms:' + customer.phone + '?body=' + encodeURIComponent(billText))`
- This opens the native SMS app pre-filled with the customer's number and the bill text
- User taps Send in their SMS app — the app does not send SMS programmatically
- If phone is empty, show: "No phone number saved for this customer"
- If SMS not available (tablet/no SIM): show fallback — "Copy the bill and send manually"

**Check SMS availability:**
```ts
const canSMS = await Linking.canOpenURL('sms:');
```

---

## Milestone 7 — Delivery: Driver Management

### Screens
- `app/(tabs)/delivery/drivers.tsx` — Driver list + management

### Driver List Screen
- Shows all drivers: name, phone, active/inactive status
- FAB: "Add Driver"

### Add Driver Modal/Sheet
Fields: Name (optional), Phone (required, 10 digits, acts as user ID)

**On save:**
- Generate UUID for driver
- Generate 6-digit numeric OTP: `Math.floor(100000 + Math.random() * 900000).toString()`
- Store driver with `otp`, `otp_used = 0`, `active = 1`, `synced = 0`
- Write to WatermelonDB → trigger sync push (so driver auth endpoint can validate)
- **Show OTP to admin** in a modal/alert: "Share this OTP with the driver: 482910"
- Provide copy button for the OTP

**OTP display notes:**
- OTP is shown once at creation time
- After closing the modal, OTP is stored in D1 (via sync) but not shown again in the UI for security
- Admin communicates OTP to driver manually (verbally or via SMS — provide share button)

### Driver Detail
- Shows driver name, phone, active status
- "Deactivate" toggle (sets `active = 0`)
- Cannot regenerate OTP in Phase 1 (v2 feature)

---

## Milestone 8 — Delivery: Tasks

### Screens
- `app/(tabs)/delivery/index.tsx` — Delivery list (all deliveries)
- `app/(tabs)/delivery/new-delivery.tsx` — Create delivery
- `app/(tabs)/delivery/[id].tsx` — Delivery detail + progress

### Delivery List Screen
- Shows deliveries grouped by status: Pending / In Progress / Completed
- Each card: driver name, number of items, status, created date
- Tap → delivery detail

### Create Delivery Screen
1. Driver selector (dropdown from active drivers)
2. Notes (optional)
3. Delivery Items section:
   - "Add Stop" button
   - Each stop: Address (text input), Stock Amount (text input, free text e.g. "5 boxes Rice, 2kg Sugar"), optional Customer selector
   - Delete icon per stop
4. "Send to Driver" button

**On save:**
- Generate UUID for delivery + each delivery_item
- Set delivery `status = 'pending'`
- Write to WatermelonDB → trigger sync push
- Driver app picks this up on their next pull cycle
- Show success: "Delivery sent to [driver name]"

### Delivery Detail Screen
Header: driver name, status badge, created date

Delivery items as checklist:
- Each stop shows: address, stock amount, status (pending/done)
- Status is read-only in admin app (updated by driver via driver app)
- Progress bar: X/N stops completed

---

## Milestone 9 — Delivery: Live Map

### Screen
- `app/(tabs)/delivery/map.tsx` — Live driver map

### Map Screen
- Uses `react-native-maps` with Google Maps provider (Android)
- Fetches driver locations from `GET /driver/locations` every 30 seconds using `setInterval` or React Query `refetchInterval`
- Shows a marker per active driver
- Marker tap: shows driver name, phone, last updated time
- If location is stale > 15 minutes: show marker in grey with "Last seen X min ago"

### Location Polling
```ts
const { data } = useQuery({
  queryKey: ['driver-locations'],
  queryFn: () => api.getDriverLocations(),
  refetchInterval: 30_000, // poll every 30s
  enabled: isMapVisible,   // only poll when map is on screen
})
```

### Map Setup Requirements
- Add Google Maps API key in `app.json` under `android.config.googleMaps.apiKey`
- Requires `ACCESS_FINE_LOCATION` permission — but only for driver app, NOT admin app
- Admin app only reads locations, does not report its own location

---

## Milestone 10 — Polish & Edge Cases

### Offline Handling
- Show banner: "You're offline — changes will sync when connected" using `NetInfo`
- All reads work fully offline (from WatermelonDB)
- All writes succeed offline, queued for sync
- Delivery map shows "Location data unavailable offline" instead of map

### Empty States
- Customer list empty: "No customers yet. Tap + to add one."
- Sales list empty: "No sales recorded."
- Delivery list empty: "No deliveries created."
- Driver map with no active drivers: "No drivers are currently active."

### Error States
- Sync failure: show banner "Sync failed. Will retry." with manual retry button
- API error on settings test: show "Could not connect. Check your sync key."
- Invalid sync key format (can't decode base64 or missing `|`): show inline validation error

### Performance
- Use `FlashList` (from `@shopify/flash-list`) instead of `FlatList` for all list screens
- WatermelonDB queries use `.observe()` for reactive updates — no manual refetch needed for local data
- React Query for all remote/Worker API calls only

### Input Validation Rules
| Field | Rule |
|---|---|
| Phone | Exactly 10 digits, numeric only |
| Amount / Price | Positive integer or decimal (convert to paise on save) |
| Qty | Positive integer |
| OTP | 6 digits, shown once |
| Sync Key | Must decode to `URL|SECRET` format |

---

## Screens Summary

| Screen | Route | Purpose |
|---|---|---|
| Dashboard | `/(tabs)/` | Overview: total balance, recent activity |
| Customer List | `/(tabs)/customers/` | All customers + search |
| Customer Detail | `/(tabs)/customers/[id]` | Sales, payments, bill tabs |
| Add Customer | `/(tabs)/customers/new` | Create customer |
| Sales List | `/(tabs)/sales/` | All sales |
| New Sale | `/(tabs)/sales/new` | Multi-line-item sale entry |
| Payments List | `/(tabs)/payments/` | All payments |
| Record Payment | `/(tabs)/payments/new` | Log payment |
| Delivery Dashboard | `/(tabs)/delivery/` | All deliveries by status |
| Create Delivery | `/(tabs)/delivery/new-delivery` | Assign stops to driver |
| Delivery Detail | `/(tabs)/delivery/[id]` | Progress checklist |
| Driver Management | `/(tabs)/delivery/drivers` | Add, view, deactivate drivers |
| Live Map | `/(tabs)/delivery/map` | Real-time driver locations |
| Settings | `/settings` | Sync key entry + status |

---

## Tab Bar Structure

```
[ Customers ] [ Sales ] [ Payments ] [ Delivery ] [ Settings ]
```

---

## Dependencies List

```json
{
  "expo": "latest",
  "expo-router": "latest",
  "nativewind": "^4",
  "tailwindcss": "^3",
  "@nozbe/watermelondb": "latest",
  "@tanstack/react-query": "^5",
  "zustand": "^4",
  "expo-secure-store": "latest",
  "expo-clipboard": "latest",
  "expo-linking": "latest",
  "expo-network": "latest",
  "react-native-maps": "latest",
  "@shopify/flash-list": "latest",
  "react-native-toast-message": "latest"
}
```

---

## Worker Changes Required

The existing Cloudflare Worker (`cloudflare/worker.js`) needs the following additions:

1. Handle new routes: `GET /pull/delivery`, `POST /push/delivery`
2. Handle: `POST /driver/auth` (no SYNC_SECRET required, uses phone+OTP validation)
3. Handle: `POST /driver/location` (validates driver_id)
4. Handle: `GET /driver/locations` (requires SYNC_SECRET)
5. Handle: `PATCH /delivery-item/:id/status` (validates driver_id in body)
6. Run D1 migration SQL from DATA_MODEL.md to create new tables

See API_SPEC.md for full details on each endpoint.
