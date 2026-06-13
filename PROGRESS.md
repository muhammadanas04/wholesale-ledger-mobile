# Admin App — Progress Log

## Status: MILESTONE 5 COMPLETE (All Issues 1-15 Closed)

---

## How to Use This File

After every AI coding session, paste a summary of what was built, what changed, and what's next. Start every new AI session by sharing this file as context.

---

## Session Log

### Session 1 — June 13, 2026
**What we built:**
- Scaffolded Expo React Native app using the `tabs` template and configured it to use `pnpm` as requested.
- Fully set up local offline-first database using **WatermelonDB** containing all core shared tables (`customers`, `products`, `stock_purchases`, `sales`, `sale_items`, `payments`) and new tables (`drivers`, `deliveries`, `delivery_items`).
- Defined 9 WatermelonDB class models with fields, types, and associations.
- Configured visual styling via **Tailwind CSS / NativeWind v4**, complete with `global.css`, `tailwind.config.js`, `metro.config.js`, and Babel configurations.
- Integrated **Zustand** state store for sync settings.
- Initialized core file-based routes structure under `app/(tabs)/` and `app/settings.tsx`.

**What changed:**
- Replaced templates with brand colors (Indigo & Slate) and registered 5 sub-navigation folders matching tabs navigation.
- Enabled TypeScript experimental legacy decorators compiler options.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

**Next session starts at:**
- **Milestone 2** → Settings + Sync Connection (creating the base settings form, base64 key decoding, and sync hooks/logic skeleton).


### Session 2 — June 13, 2026
**What we built:**
- **Admin App Settings UI:** Built `app/settings.tsx` including a base64 Sync Key paste area, connection status indicator (green/amber/red), "Test Connection" endpoint checker, and secure save/disconnect buttons.
- **API Client:** Built `lib/api.ts` incorporating a robust cross-platform base64 decoder, secure credentials reader/writer using `expo-secure-store`, and HTTP routing requests.
- **Custom Offline Sync:** Built `lib/sync.ts` incorporating custom query-filtered `pullSync` and `pushSync` routines that execute bulk transactions via `database.batch()`.
- **Backend Worker Routes:** Updated `/wholesale-personal/cloudflare/worker.js` to implement `GET /pull/delivery`, `POST /push/delivery`, `POST /driver/auth` (OTP checks), `POST /driver/location` (pins upsert), `GET /driver/locations` (admin poll), and `PATCH /delivery-item/:id/status`.
- **D1 Migration Schema:** Appended `drivers`, `deliveries`, `delivery_items`, and `driver_locations` table statements to `/wholesale-personal/cloudflare/schema.sql`.

**What changed:**
- Bound sync initialization (`initStore`) and AppState triggers (`setupSyncTriggers`) inside root `app/_layout.tsx` to run background synchronization cycles on launch and foregrounding.
- Corrected sync design descriptions in `PLAN.md` to reflect check-and-branch batch updates.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).
- Expo routing config is validated and resolved successfully via `npx expo config`.

**Next session starts at:**
- **Milestone 3** → Customers Module (implementing customer list, customer detail view, and add customer form).

---

### Session 3 — June 13, 2026
**What we built:**
- **Customer List Screen (`app/(tabs)/customers/index.tsx`):** Implemented high-contrast index view containing debounced search input, outstanding balance details formatted in INR, pull-to-refresh to trigger off-line sync loops, and FAB navigation link.
- **Customer Details Screen (`app/(tabs)/customers/[id].tsx`):** Designed sticky profile header, Call/SMS intents, in-page tab states (Sales, Payments, Bill text generator), and sticky bottom quick action CTAs.
- **Add Customer Screen (`app/(tabs)/customers/new.tsx`):** Structured registration page including validation, phone cleaning, and secure database writes.
- **Reactive Hooks & Utils (`db/hooks.ts`, `lib/utils.ts`):** Developed `useQuery`, `useRecord`, `useRelation`, `formatCurrency`, and `sanitizePhone` hooks/helpers.

**What changed:**
- Installed Hermes-compatible `expo-crypto` native module to generate cryptographically secure UUIDs.
- Updated `db/schema.ts` to add database indices to `name` and `phone` columns on `customers`.
- Resolved database column-to-property snake_case mapping bugs in `lib/sync.ts` pull upsert loops.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

**Next session starts at:**
- **Milestone 4** → Sales Module (implementing Sales list, new sale creation with line items, product selector modal, and transaction updates).

---

### Session 4 — June 13, 2026
**What we built / fixed:**
- **Restored Milestone 3 Files (Issue 10):** Restored all empty 0-byte implementation files (`index.tsx`, `[id].tsx`, `new.tsx`, `lib/sync.ts`, `lib/utils.ts`, and `db/hooks.ts`) with their complete functional implementations.
- **Fixed Event Listener Leak (Issue 11):** Patched `app/_layout.tsx` to handle the asynchronous `setupSyncTriggers` return function registration cleanly, preventing memory/event leaks during layout unmounting.
- **Optimized Connection Testing (Issue 12):** Standardized `api.testConnection` to request pulls with `since=2099-12-31T23:59:59.000Z`, validating authorization and endpoints with 0 download payload bytes. Linked `app/settings.tsx` to this shared method, DRYing the connection code.

**What changed:**
- Re-ran TypeScript compiler checks to ensure clean builds across all files.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

**Next session starts at:**
- **Milestone 4** → Sales Module (implementing Sales list, new sale creation with line items, product selector modal, and transaction updates).

---

### Session 5 — June 13, 2026
**What we built / fixed:**
- **Resolved Push Concurrency Race Condition (Issue 13):** Modified both core and delivery `pushSync` transaction loops in `lib/sync.ts`. Pre-push timestamps (`updated_at`) are now recorded, and records are re-fetched during the write phase to compare timestamps. The record's `synced` flag is updated to `1` only if no local updates occurred during the push network transaction.
- **Verified Bandwidth Connection Check (Issue 12):** Confirmed that `1970` query parameter does not exist in `lib/api.ts`'s test methods, keeping the `since=2099-12-31` future query verification intact.

**What changed:**
- Re-ran TypeScript compiler checks to ensure clean builds across all files.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

**Next session starts at:**
- **Milestone 4** → Sales Module (implementing Sales list, new sale creation with line items, product selector modal, and transaction updates).

---

### Session 6 — June 13, 2026
**What we built:**
- **Sales List Screen (`app/(tabs)/sales/index.tsx`):** Built the invoice listing page including reactive customer name joins, debounced search filtering by client name using SQLite join queries, pull-to-refresh sync hooks, and FAB links.
- **New Sale Invoice Form (`app/(tabs)/sales/new.tsx`):** Implemented searchable Customer Selector and Product Picker modals, raw string value text inputs to prevent typing format issues, live invoice totals calculation, optional notes, and full validation blocks.
- **Atomic Transaction Writes:** Secured database updates inside a single `database.write` block, atomically generating UUIDs, inserting a `Sale` header record, inserting multiple `SaleItem` rows, and incrementing the selected customer's balance.

**What changed:**
- Audited type correctness across the entire workspace directory.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

**Next session starts at:**
- **Milestone 5** → Payments Module (implementing Payments list, record payments form, and customer balance subtraction transactions).

---

### Session 7 — June 13, 2026
**What we built / fixed:**
- **Resolved Rounding Mismatch 1-Paisa Bug (Issue 14):** Modified `app/(tabs)/sales/new.tsx` to calculate all line item totals in paise first, then compute the invoice total in paise directly as the sum of these rounded subtotals. Linked both list rows and the sticky bottom total display to this exact integer paise computation.
- **Strict Date Input Validation (Issue 15):** Enforced a regular expression check on the YYYY-MM-DD input, and resolved calendar rollover checks (e.g. invalid calendar dates like Feb 30) using splits and `Date` instance comparison before database writes.

**What changed:**
- Re-ran TypeScript compiler checks to ensure clean builds across all files.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

### Session 8 — June 13, 2026
**What we built:**
- **Record Payment Entry Form (`app/(tabs)/payments/new.tsx`):** Implemented a customer selector modal list, raw string decimal inputs, strict date format and calendar validation, and post-save background synchronization.
- **Atomic Transaction Safety:** Wrapped payment creation and customer outstanding balance subtraction (`customer.balance -= (amount + discount)`) inside an offline-first transactional batch transaction.

**What changed:**
- Marked Milestone 5 tasks as complete.

**Current working state:**
- The project builds and compiles cleanly with **zero TypeScript errors** (`pnpm exec tsc --noEmit` succeeds).

**Next session starts at:**
- **Milestone 6** → Bill generation (creating the text bill template, SMS redirects, and clipboard copy function).

---

## Known Issues / Bugs
| # | Description | Status |
|---|---|---|
| 1 | **Missing WatermelonDB Expo Config Plugin**: `@morrowdigital/watermelondb-expo-plugin` is missing from `package.json` and `app.json`. Native builds and JSI loader will fail. | Closed |
| 2 | **Scaffold leftovers in `app.json`**: App name, slug, and scheme are still set to `tmp-scaffold` instead of actual app branding. | Closed |
| 3 | **Build Plan assumes `collection.upsert()`**: `PLAN.md` Milestone 2 incorrectly assumes WatermelonDB has an `upsert()` API. Must use check-and-branch with `database.batch()`. | Closed |
| 4 | **Custom Date String Type**: Schema uses `string` for `created_at` / `updated_at`, disabling WatermelonDB's native automatic `@date` tracking (requires `number` Unix millisecond timestamps). Sync must handle these manually. | Closed |
| 5 | **Missing UUID Generator (`expo-crypto`)**: Hermes JS engine does not support `crypto.randomUUID()` globally. Need to install `expo-crypto` for UUIDs. | Closed |
| 6 | **Missing Search Indexes**: `name` and `phone` columns in `customers` table lack `isIndexed: true` which will cause slow full-table scans. | Closed |
| 7 | **Unsanitized search query**: Search input should use `Q.sanitizeLikeString()` to prevent wildcard manipulation or SQL syntax issues. | Closed |
| 8 | **Currency Formatting Consistency**: Lacks a common utility to format paise integers into `₹X.XX` format (especially handling negative credit balances). | Closed |
| 9 | **Phone Input Sanitization**: Customer forms should strip spaces/hyphens from phone numbers before checking the 10-digit validation. | Closed |
| 10 | **Milestone 3 Implementation Files Wiped/Empty**: `app/(tabs)/customers/index.tsx`, `[id].tsx`, `new.tsx`, `lib/sync.ts`, `lib/utils.ts`, and `db/hooks.ts` are currently 0-byte empty files, causing critical compilation errors. | Closed |
| 11 | **React useEffect Cleanup Bug**: In `app/_layout.tsx`, `setupSyncTriggers` unsubscribe callback is returned inside an async `.then()` promise, causing event listener leaks. | Closed |
| 12 | **Duplicated Connection Test & High Bandwidth Usage**: `app/settings.tsx` duplicates HTTP fetch logic, and both `settings.tsx` and `api.ts` query `since=1970` for testing (downloading entire database). | Closed |
| 13 | **Push Concurrency Race Condition**: If a user edits a local record while a sync push is in-flight, those updates (which are not in the payload) are blindly marked as `synced = 1` and lost. | Closed |
| 14 | **Invoice Rounding Mismatch (1-paisa Bug)**: In `sales/new.tsx`, the invoice total is rounded in float, while item totals are rounded individually, potentially causing a 1-paisa mismatch between the invoice header and item sums. | Closed |
| 15 | **Lack of Sale Date Format Validation**: In `sales/new.tsx`, `saleDate` YYYY-MM-DD input is a free text input without format validation, allowing malformed dates to corrupt queries. | Closed |
| 16 | **Payments List Query Variable Naming Mismatch**: In `payments/index.tsx`, the variable storing the queried payments array is named `sales` instead of `payments`. (Style-only discrepancy) | Closed |
---

## Decisions Made

| Decision | Reason |
|---|---|
| Use `pnpm` | Specified by User for consistent package management. |
| Add `nativewind-env.d.ts` | Necessary to resolve type configurations for `className` attributes on native React Native components and support CSS file side-effect imports in TypeScript. |
| Use String IDs in models | WatermelonDB on native requires string IDs (which will map to UUIDs). SQLite dynamic typing allows these to be stored seamlessly in D1 and SQLite on the desktop alongside desktop autoincrement integer IDs. |

---