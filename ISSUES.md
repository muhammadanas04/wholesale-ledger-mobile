# Security & Performance Audit — `admin-app`

Audit date: 2026-06-24

Scope: full codebase (lib, db, store, app screens, components, dependencies).

---

## 🔴 CRITICAL — Security

### 1. Hardcoded production sync secret committed to git
**`lib/api.ts:65-66`**
```ts
export const DEFAULT_WORKER_URL = 'https://wholesale-sync.niranjanskr06.workers.dev';
export const DEFAULT_SYNC_SECRET = '2156f797-86bf-439e-b3a3-963d01755d4e';
```
This is a **real bearer token** that authenticates against the Cloudflare Worker. It's shipped in every app build *and* lives in git history (`eea7128`). Anyone who installs the APK/IPA — or reads the public repo — gains full read/write access to the D1 database (customers, sales, payments, driver OTPs, locations).

`loadCredentials()` (`lib/api.ts:71-78`) falls back to these defaults, so the secret is **always** usable even after the user "disconnects."

**Fix:**
- Move the secrets to .env

---

## 🟠 HIGH — Security

### 2. WebView allows arbitrary navigation & file access
**`components/maps/LeafletMap.tsx:91-104`**
```tsx
originWhitelist={['*']}
onShouldStartLoadWithRequest={() => true}   // always allows every URL
```
The map loads remote Leaflet assets and is fed data via `injectJavaScript`. Combined with `onShouldStartLoadWithRequest` returning `true` unconditionally, any navigation the in-WebView JS initiates is permitted. Restrict the whitelist and gate `onShouldStartLoadWithRequest` so only the initial HTML / same-origin requests load.

### 3. Driver OTPs generated with `Math.random()` and stored in plaintext
**`app/(tabs)/delivery/drivers.tsx:155`**
```ts
const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
```
- `Math.random()` is **not cryptographically secure** — predictable, especially on Hermes.
- The OTP is persisted in cleartext (`driver.otp`) and then synced to the server, so it's used as a reusable static credential rather than a one-time code.

**Fix:** use `expo-crypto` (`Crypto.getRandomValues` / `randomUUID`-based digits), and treat OTPs as single-use (`otpUsed` already exists — enforce it server-side too).

### 4. IDs generated with `Math.random()` (collision-prone, weak entropy)
**`lib/utils.ts:34-39`** — `generateNumericId()` returns a random 15-digit int. This is used for `sales`, `sale_items` IDs (`new-sale.tsx:284, 333`). Collision risk grows with data volume, and `Math.random()` is not cryptographically sound. Prefer `Crypto.randomUUID()` (already imported in those files) or server-issued IDs.

---

## 🟠 HIGH — Performance

### 5. `useColorScheme` called per-row, causing list-wide re-renders
**`components/useColorScheme.ts`** subscribes to the NativeWind store. It's invoked inside `CustomerRow` (`customers/index.tsx:32`), `DeliveryCard`, `SaleItemRow`, etc. — i.e. inside list item components. Every theme/state change re-renders every visible row. The `Colors` object is static; resolve it **once** at the screen level and pass `colors` down as props (or memoize). Same applies to `useSafeAreaInsets()` used in child components.

### 6. Customer detail renders large lists inside a `ScrollView` (no virtualization)
**`app/(tabs)/customers/[id].tsx:778`** maps `combinedTransactions` directly into a `ScrollView`. For a customer with hundreds of sales/payments this mounts every row at once → memory spikes and jank. Wrap in a `FlashList`/`FlatList` (the customer list screen already uses `FlashList` correctly).

### 7. Non-virtualized product list in modal
**`new-sale.tsx:777-801`** renders products through `ScrollView` + `.map()`. With a large inventory this is slow and unbounded. Use `FlatList` (already imported) as the customer modal does.

### 9. Map polling + WebView re-inject full payload each tick
**`delivery/map.tsx:48-53`** polls every 15s and `LeafletMap.tsx:37-45` re-stringifies and re-injects the **entire** driver array on every change. For N drivers this is O(N) JSON serialize + JS bridge transfer + DOM diff every 15s. Consider diffing (only send changed coordinates) or moving staleness computation into the WebView.

---

## 🟡 MEDIUM

### 10. Dependency vulnerabilities (`pnpm audit`)
- **`@babel/runtime < 7.26.10`** — ReDoS in transpiled named-capture `.replace` (GHSA-968p-4wvh-cqc8). Transitive via `@nozbe/watermelondb`.
- **`uuid < 11.1.1`** — missing buffer bounds check (GHSA-w5hq-g745-h8pq). Transitive via `expo`/`xcode`.

**Fix:** run `pnpm update @babel/runtime` and bump/override `uuid` ≥ 11.1.1.

### 11. `dangerouslySetInnerHTML` on web
**`app/+html.tsx:23`** — the content is a static local string, so it's safe *today*, but it's a pattern to keep an eye on; don't interpolate user/shop data into it.

---

## 🟢 LOW / Hygiene

### 14. No input length limits
No length caps on notes/address fields (`new-sale.tsx`, `customers/new.tsx`) — allows unbounded text into the DB and sync payload.

### 15. `console.log` / `console.error` in production paths
Pervasive logging in sync/store (e.g. `lib/sync.ts:186, 247, 308`) — fine for dev, but should be gated behind `__DEV__` for production builds to avoid leaking internals.

### 16. `generateNumericId` range quirk
**`lib/utils.ts:35-36`**: min/max are both ~1e14, so `Math.random() * (max-min+1)` effectively always lands near the same magnitude — not wrong, but needless; prefer UUIDs (see #5).

---

## Recommended priority

1. **Remove the hardcoded secret (#1)** — the only true emergency; it's full prod DB access in plaintext.
2. Fix the WebView nav gate (#2) and secure OTP generation (#3).
3. Tighten sync ingestion allow-list (#4).
4. Address the per-row `useColorScheme` re-renders (#6) and virtualize the two big lists (#7, #8) — biggest UX wins.
5. Bump vulnerable deps (#11).
