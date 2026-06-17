# Temporary Records — Feature Implementation Plan

> **Status:** Not started  
> **Author:** Auto-generated  
> **Date:** 2026-06-17  
> **Scope:** Admin mobile app + Desktop app + Cloudflare Worker  

---

## 1. Feature Overview

Temporary Records ("Tmp Records") is a lightweight, quick-entry record system for the admin to log sales, payments, and other expenses on the go — without going through the full formal sale/payment flows. These records are **temporary by design**:

- **Locally:** auto-deleted after a configurable number of days (default: 3 days).
- **In D1 (cloud):** auto-deleted after 15 days (hard-coded).

They are purely informational — they do **not** affect customer balances, product stock, or any other business state.

### User Flow Summary

1. On the **Home tab** of the mobile app, the admin taps a large **"+ Add"** rectangular button.
2. A floating modal opens with **3 type tabs**: Sale / Payment / Other.
3. The admin fills in the relevant fields (with autocomplete for customer names) and saves.
4. The record is stored in WatermelonDB locally and synced to Cloudflare D1.
5. A second button on the Home tab (similar to "Delivery Progress") opens a **viewer modal** where the admin can browse, edit, delete, and share (copy/SMS) these records.
6. On the **Desktop app**, a new **"Tmp Records"** page displays synced records in a read-only table view.

---

## 2. Design Decisions

### 2.1 Single Table Design

A single `tmp_records` table with a `type` discriminator column (`'sale'` | `'payment'` | `'other'`) is used instead of three separate tables. Rationale:

- Sync logic touches one table instead of three.
- Cleanup logic (local + D1) is a single query.
- The UI already filters by type — no need for separate collections.
- Nullable columns for type-specific fields (e.g., `qty`, `weight` are null for payments).

### 2.2 Customer Data: Autocomplete + Denormalized Storage

The customer name field uses an **autocomplete dropdown** populated from the local WatermelonDB `customers` table. When the user selects a customer from the list:

- `customer_id` → stored for potential future lookups
- `customer_name` → denormalized copy of the customer's name (for display even if the customer is later deleted)
- `customer_phone` → denormalized copy of the phone number (for SMS pre-fill)

If the user types a name that does not match any existing customer (or dismisses the autocomplete), the record saves with `customer_name` as the typed text and `customer_id = null` / `customer_phone = null`.

**Why denormalize?** Tmp records are ephemeral. Storing a copy of name and phone means we never need to JOIN to the customers table to display or share them, and they remain valid even after the local retention period expires and the customer data might have changed.

### 2.3 No Balance Impact

Tmp records are **not** linked to the real `sales` or `payments` tables. Creating a tmp sale record does NOT:
- Deduct product stock
- Increase customer balance
- Create `sale_items` entries

They are purely for quick note-taking and sharing.

### 2.4 Retention Cleanup Strategy

| Scope | Retention | Trigger | Configurable? |
|---|---|---|---|
| Local (WatermelonDB) | N days (default 3) | End of every sync cycle | Yes, via Settings |
| Cloud (D1) | 15 days | On every `/pull` request | No (hard-coded) |
| Local (Desktop SQLite) | 15 days | End of every sync cycle | No (hard-coded) |

Cleanup uses the `date` field (the user-assigned date of the record), not `created_at`. This means a record dated "today" won't be cleaned up even if it was created days ago on a different device.

---

## 3. Database Schema

### 3.1 D1 Table (Cloudflare)

**File:** `~/Development/Projects/wholesale-personal/cloudflare/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS tmp_records (
  id TEXT PRIMARY KEY,              -- UUID (generated client-side)
  type TEXT NOT NULL,                -- 'sale' | 'payment' | 'other'
  customer_id TEXT,                  -- Optional FK to customers.id (for lookups)
  customer_name TEXT,                -- Denormalized customer name for display
  customer_phone TEXT,               -- Denormalized phone for SMS sending
  qty REAL,                          -- Sale only: quantity of goods
  weight REAL,                       -- Sale only: weight in kg
  rate REAL,                         -- Sale only: auto-calculated (total_value / weight)
  discount INTEGER DEFAULT 0,        -- Sale/Payment: discount amount in paise
  total_value INTEGER,               -- Sale/Payment: total value in paise
  amount INTEGER,                    -- Other expenses: amount in paise
  reason TEXT,                       -- Other expenses: free-text reason
  date TEXT NOT NULL,                -- YYYY-MM-DD (user-assigned date)
  created_at TEXT NOT NULL,          -- ISO 8601 (auto-set on creation)
  updated_at TEXT NOT NULL,          -- ISO 8601 (auto-set on creation/update)
  synced INTEGER DEFAULT 0           -- 0 = unsynced, 1 = synced
);
```

### 3.2 WatermelonDB Schema (Mobile)

**File:** `admin-app/db/schema.ts`

```typescript
tableSchema({
  name: 'tmp_records',
  columns: [
    { name: 'type', type: 'string', isIndexed: true },
    { name: 'customer_id', type: 'string', isOptional: true, isIndexed: true },
    { name: 'customer_name', type: 'string', isOptional: true },
    { name: 'customer_phone', type: 'string', isOptional: true },
    { name: 'qty', type: 'number', isOptional: true },
    { name: 'weight', type: 'number', isOptional: true },
    { name: 'rate', type: 'number', isOptional: true },
    { name: 'discount', type: 'number', isOptional: true },
    { name: 'total_value', type: 'number', isOptional: true },
    { name: 'amount', type: 'number', isOptional: true },
    { name: 'reason', type: 'string', isOptional: true },
    { name: 'date', type: 'string' },
    { name: 'created_at', type: 'string' },
    { name: 'updated_at', type: 'string' },
    { name: 'synced', type: 'number' },
  ],
}),
```

**Schema version** must be bumped from `1` → `2`. A migration spec must be added to `db/index.ts` using `schemaMigrations` + `createTable`.

### 3.3 Desktop SQLite Schema

**File:** `~/Development/Projects/wholesale-personal/electron/db.js`

Identical column definitions to the D1 table above. Added via a version 10 migration block.

### 3.4 WatermelonDB Model Class

**File (NEW):** `admin-app/db/models/TmpRecord.ts`

```typescript
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class TmpRecord extends Model {
  static table = 'tmp_records';

  @text('type') type!: string;                   // 'sale' | 'payment' | 'other'
  @text('customer_id') customerId?: string;       // Optional FK
  @text('customer_name') customerName?: string;
  @text('customer_phone') customerPhone?: string;
  @field('qty') qty?: number;
  @field('weight') weight?: number;
  @field('rate') rate?: number;
  @field('discount') discount?: number;           // paise
  @field('total_value') totalValue?: number;       // paise
  @field('amount') amount?: number;               // paise
  @text('reason') reason?: string;
  @text('date') date!: string;                    // YYYY-MM-DD
  @text('created_at') createdAt?: string;         // ISO 8601
  @text('updated_at') updatedAt?: string;         // ISO 8601
  @field('synced') synced!: number;               // 0 or 1
}
```

The model must also be registered in the `modelClasses` array in `db/index.ts`.

---

## 4. Cloudflare Worker Changes

**File:** `~/Development/Projects/wholesale-personal/cloudflare/worker.js`

### 4.1 Sync Route Updates

The worker currently handles core business tables in two arrays:

- **`GET /pull`** route (line ~27): `tables` array → add `'tmp_records'`
- **`POST /push`** route (line ~67): `tables` array → add `'tmp_records'`

This piggybacks tmp records onto the existing sync mechanism with zero new endpoints.

### 4.2 D1 Auto-Cleanup

Add cleanup logic to the `GET /pull` route, executed before returning the response:

```javascript
// Cleanup tmp_records older than 15 days from D1
try {
  await env.DB.prepare(
    "DELETE FROM tmp_records WHERE date < date('now', '-15 days')"
  ).run();
} catch (e) {
  // Non-fatal: log and continue
  console.error('tmp_records cleanup error:', e);
}
```

This runs on every pull request. Since pull is called on every app open and periodically, this is sufficient. Alternatively, a Cloudflare Cron Trigger could be used, but piggybacking on pull is simpler and avoids additional configuration.

---

## 5. Mobile App Sync Changes

**File:** `admin-app/lib/sync.ts`

### 5.1 Add to Sync Tables

In `pullSync()` function (line ~95):
```typescript
const coreTables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'tmp_records'];
```

In `pushSync()` function (line ~133):
```typescript
const coreTables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'tmp_records'];
```

### 5.2 Local Retention Cleanup

Add a cleanup step at the end of `runSync()`, after both push and pull complete:

```typescript
// --- Local tmp_records cleanup ---
try {
  const retentionDays = await SecureStore.getItemAsync('tmp_retention_days');
  const days = parseInt(retentionDays || '3', 10);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const expired = await database.collections
    .get('tmp_records')
    .query(Q.where('date', Q.lt(cutoffStr)))
    .fetch();

  if (expired.length > 0) {
    await database.write(async () => {
      await database.batch(
        ...expired.map((r) => r.prepareDestroyPermanently())
      );
    });
    console.log(`[Sync] Cleaned up ${expired.length} expired tmp_records`);
  }
} catch (e) {
  console.error('[Sync] tmp_records cleanup error:', e);
}
```

**Note:** `prepareDestroyPermanently()` is used instead of `prepareMarkAsDeleted()` because we want a hard delete — there is no need to sync deletions for expired records.

---

## 6. Mobile App Store Changes

**File:** `admin-app/store/app.ts`

### 6.1 New State Fields

```typescript
interface AppState {
  // ... existing fields ...
  tmpRetentionDays: number;
  setTmpRetentionDays: (days: number) => Promise<void>;
}
```

### 6.2 Implementation

```typescript
tmpRetentionDays: 3,

setTmpRetentionDays: async (days) => {
  const validDays = Math.max(1, Math.min(30, days)); // clamp 1–30
  set({ tmpRetentionDays: validDays });
  try {
    await SecureStore.setItemAsync('tmp_retention_days', String(validDays));
  } catch (e) {
    console.error('Failed to save tmp retention days:', e);
  }
},
```

### 6.3 Load in `initStore()`

```typescript
const savedRetention = await SecureStore.getItemAsync('tmp_retention_days');
if (savedRetention) {
  const parsed = parseInt(savedRetention, 10);
  if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
    set({ tmpRetentionDays: parsed });
  }
}
```

---

## 7. Mobile App UI — Home Tab Changes

**File:** `admin-app/app/(tabs)/index.tsx`

### 7.1 New Queries & State

```typescript
import TmpRecord from '../../db/models/TmpRecord';

// At component top:
const [showAddModal, setShowAddModal] = useState(false);
const [showViewerModal, setShowViewerModal] = useState(false);

const tmpRecords = useQuery(
  useMemo(() =>
    database.collections.get<TmpRecord>('tmp_records').query(Q.sortBy('created_at', Q.desc)),
  [])
);

const tmpRecordCount = tmpRecords.length;
```

### 7.2 "+ Add Record" Button

Placed in the metrics grid area, between the existing Receivables/Drivers row and the Delivery Progress banner. Design:

```
┌──────────────────────────────────────────┐
│  ┌─ Receivables ─┐  ┌─── Drivers ───┐   │
│  └───────────────┘  └───────────────┘   │
│                                          │
│  ┌──────── + Add Record ────────────┐   │  ◄── NEW: Large rectangular button
│  │   [+]  Quick add a temporary     │   │
│  │        sale, payment, or expense │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──── Delivery Progress ───────────┐   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──── Temporary Records (3) ───────┐   │  ◄── NEW: Banner with record count
│  └──────────────────────────────────┘   │
│                                          │
│  Recent Activity                         │
│  ...                                     │
└──────────────────────────────────────────┘
```

**"+ Add Record" button styling:**
- Uses `GlassView` with `borderRadius={20}`, matching existing metric cards
- Background: semi-transparent teal/accent tint
- Large `+` icon (SymbolView: `ios: 'plus.circle.fill'`, `android: 'add_circle'`)
- Label: "Add Record" in bold
- Subtitle: "Quick add a temporary sale, payment, or expense"
- `onPress={() => setShowAddModal(true)}`
- Height: ~72px, full width

**"Temporary Records" banner styling:**
- Identical layout to the existing Delivery Progress banner
- Left icon: clock or notepad (SymbolView: `ios: 'clock.badge.fill'`, `android: 'schedule'`)
- Title: "Temporary Records"
- Subtitle: "{N} active records" (or "No records" if empty)
- Right chevron icon
- `onPress={() => setShowViewerModal(true)}`

### 7.3 Modal Rendering

At the bottom of the JSX, inside `<ScreenBackground>`:

```tsx
<AddTmpRecordModal
  visible={showAddModal}
  onClose={() => setShowAddModal(false)}
/>
<TmpRecordsViewerModal
  visible={showViewerModal}
  onClose={() => setShowViewerModal(false)}
  records={tmpRecords}
/>
```

---

## 8. Mobile App UI — AddTmpRecordModal

**File (NEW):** `admin-app/components/AddTmpRecordModal.tsx`

### 8.1 Component Props

```typescript
interface AddTmpRecordModalProps {
  visible: boolean;
  onClose: () => void;
  editRecord?: TmpRecord | null;  // If provided, pre-fill form for editing
}
```

### 8.2 UI Layout

```
┌─────────────────────────────────────────┐
│  ✕ Close              Add Record        │  ◄── Header
│─────────────────────────────────────────│
│                                         │
│  ┌── Sale ──┐┌ Payment ┐┌── Other ──┐  │  ◄── Type selector pills
│  └──────────┘└─────────┘└───────────┘  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Customer Name                   │    │  ◄── Autocomplete input
│  │ ┌─────────────────────────────┐ │    │
│  │ │ Rah...                      │ │    │
│  │ ├─────────────────────────────┤ │    │
│  │ │ 🔍 Rahul Sharma            │ │    │  ◄── Autocomplete dropdown
│  │ │    Rahul Verma              │ │    │
│  │ │    Raheem Khan              │ │    │
│  │ └─────────────────────────────┘ │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌──── Qty ─────┐ ┌── Weight (kg) ──┐  │  ◄── Side-by-side inputs
│  │              │ │                  │  │
│  └──────────────┘ └─────────────────┘  │
│                                         │
│  ┌──── Rate ────────────────────────┐  │  ◄── Read-only computed field
│  │  ₹200/kg (auto)                  │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──── Discount ┐ ┌── Total Value ──┐  │  ◄── Side-by-side inputs
│  │              │ │                  │  │
│  └──────────────┘ └─────────────────┘  │
│                                         │
│  ┌──────────── Save Record ─────────┐  │  ◄── Save button (teal accent)
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 8.3 Type Selector

Three horizontally-arranged pill buttons:
- **Active state:** teal accent background, white text, slight shadow
- **Inactive state:** transparent background, grey text
- Switching type resets form fields (except customer name if already filled)

### 8.4 Autocomplete Customer Input

**Implementation details:**

1. User types into the TextInput.
2. On every keystroke (debounced ~200ms), query WatermelonDB:
   ```typescript
   const results = await database.collections
     .get<Customer>('customers')
     .query(Q.where('name', Q.like(`%${sanitizedInput}%`)))
     .fetch();
   ```
3. Display up to 5 matching customers in a dropdown below the input.
4. Each suggestion row shows: `customer.name` and `customer.phone` (dimmed).
5. On tap of a suggestion:
   - Set `customerName` state to `customer.name`
   - Set `customerId` state to `customer.id`
   - Set `customerPhone` state to `customer.phone`
   - Dismiss the dropdown
6. If the user types a name and does NOT tap a suggestion:
   - `customerName` = typed text
   - `customerId` = null
   - `customerPhone` = null
7. The dropdown dismisses when:
   - A suggestion is tapped
   - The input loses focus
   - The input is cleared

**Styling:** The dropdown appears as an elevated card (shadow + border) directly below the input, overlaying form content beneath it. Each suggestion row has a press highlight.

### 8.5 Rate Auto-Calculation

The Rate field is **read-only** and displays automatically:

```typescript
const computedRate = useMemo(() => {
  if (weight && weight > 0 && totalValue && totalValue > 0) {
    return totalValue / weight;
  }
  return null;
}, [weight, totalValue]);
```

- Shown as: `₹{rate}/kg` or `—` if not calculable
- The field uses a dimmed/disabled visual style to indicate it's not editable
- Updates reactively as the user types weight or total value

### 8.6 Form Visibility by Type

| Field | Sale | Payment | Other |
|---|---|---|---|
| Customer Name (autocomplete) | ✅ Show | ✅ Show | ❌ Hide |
| Qty | ✅ Show | ❌ Hide | ❌ Hide |
| Weight (kg) | ✅ Show | ❌ Hide | ❌ Hide |
| Rate (auto) | ✅ Show | ❌ Hide | ❌ Hide |
| Discount | ✅ Show | ✅ Show | ❌ Hide |
| Total Value | ✅ Show | ✅ Show | ❌ Hide |
| Amount | ❌ Hide | ❌ Hide | ✅ Show |
| Reason | ❌ Hide | ❌ Hide | ✅ Show |

### 8.7 Validation Rules

| Type | Required Fields | Validation |
|---|---|---|
| Sale | `customer_name` | At least customer name must be non-empty |
| Payment | `customer_name` | At least customer name must be non-empty |
| Other | `amount` | Amount must be > 0 |

All other fields are optional and can be left empty (stored as `null` / `0`).

### 8.8 Save Logic

```typescript
const handleSave = async () => {
  // 1. Validate
  if (type !== 'other' && !customerName.trim()) {
    Toast.show({ type: 'error', text1: 'Customer name is required' });
    return;
  }
  if (type === 'other' && (!amount || amount <= 0)) {
    Toast.show({ type: 'error', text1: 'Amount is required' });
    return;
  }

  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10); // YYYY-MM-DD

  // 2. Convert rupees to paise
  const discountPaise = Math.round((discount || 0) * 100);
  const totalValuePaise = Math.round((totalValue || 0) * 100);
  const amountPaise = Math.round((amount || 0) * 100);
  const computedRate = (weight && weight > 0 && totalValuePaise > 0)
    ? totalValuePaise / weight
    : null;

  // 3. Write to WatermelonDB
  await database.write(async () => {
    if (editRecord) {
      // Update existing record
      await editRecord.update((r) => {
        r.type = type;
        r.customerId = customerId || null;
        r.customerName = customerName.trim() || null;
        r.customerPhone = customerPhone || null;
        r.qty = qty || null;
        r.weight = weight || null;
        r.rate = computedRate;
        r.discount = discountPaise;
        r.totalValue = totalValuePaise;
        r.amount = amountPaise;
        r.reason = reason.trim() || null;
        r.updatedAt = now;
        r.synced = 0;
      });
    } else {
      // Create new record
      await database.collections.get('tmp_records').create((r) => {
        r._raw.id = crypto.randomUUID();
        r.type = type;
        r.customerId = customerId || null;
        r.customerName = customerName.trim() || null;
        r.customerPhone = customerPhone || null;
        r.qty = qty || null;
        r.weight = weight || null;
        r.rate = computedRate;
        r.discount = discountPaise;
        r.totalValue = totalValuePaise;
        r.amount = amountPaise;
        r.reason = reason.trim() || null;
        r.date = dateStr;
        r.createdAt = now;
        r.updatedAt = now;
        r.synced = 0;
      });
    }
  });

  // 4. Trigger background sync
  runSync(database).catch(() => {});

  // 5. Close modal
  onClose();
  Toast.show({ type: 'success', text1: editRecord ? 'Record updated' : 'Record saved' });
};
```

### 8.9 Edit Mode

When `editRecord` prop is provided:
- Pre-fill all form fields from the record
- Convert paise back to rupees for display: `totalValue / 100`
- Change header title to "Edit Record"
- Change button label to "Update Record"
- On save, call `editRecord.update(...)` instead of `collection.create(...)`

---

## 9. Mobile App UI — TmpRecordsViewerModal

**File (NEW):** `admin-app/components/TmpRecordsViewerModal.tsx`

### 9.1 Component Props

```typescript
interface TmpRecordsViewerModalProps {
  visible: boolean;
  onClose: () => void;
  records: TmpRecord[];
}
```

### 9.2 UI Layout

```
┌─────────────────────────────────────────┐
│  ✕ Close         Temporary Records      │  ◄── Header
│─────────────────────────────────────────│
│                                         │
│  ┌ All ┐┌ Sale ┐┌ Payment ┐┌ Other ┐   │  ◄── Filter pills
│  └─────┘└──────┘└─────────┘└───────┘   │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🔵 SALE          17 Jun 2026   │    │  ◄── Record card
│  │ Rahul Sharma                    │    │
│  │ 10 qty · 50kg · ₹200/kg        │    │
│  │ Discount: ₹500  Total: ₹9,500  │    │
│  │                                 │    │
│  │  [🗑 Delete] [✏ Edit] [📋 Copy] [📤 SMS] │  ◄── Action buttons
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🟢 PAYMENT       17 Jun 2026   │    │
│  │ Suresh Patel                    │    │
│  │ Discount: ₹200  Total: ₹10,000 │    │
│  │                                 │    │
│  │  [🗑 Delete] [✏ Edit] [📋 Copy] [📤 SMS] │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🟠 OTHER         17 Jun 2026   │    │
│  │ Truck fuel refill               │    │
│  │ Amount: ₹2,500                  │    │
│  │                                 │    │
│  │  [🗑 Delete] [✏ Edit] [📋 Copy] [📤 SMS] │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### 9.3 Filter Pills

Four horizontally-arranged pills: `All` | `Sale` | `Payment` | `Other`

```typescript
const [filter, setFilter] = useState<'all' | 'sale' | 'payment' | 'other'>('all');

const filteredRecords = useMemo(() => {
  if (filter === 'all') return records;
  return records.filter((r) => r.type === filter);
}, [records, filter]);
```

### 9.4 Record Card Design

Each card uses `GlassView` with:
- **Type badge:** Colored pill in top-left
  - Sale: blue background, "SALE" text
  - Payment: green background, "PAYMENT" text
  - Other: orange background, "OTHER" text
- **Date:** Right-aligned, dimmed text
- **Primary info:** Customer name (sale/payment) or reason (other), bold
- **Secondary info:** Varies by type:
  - Sale: `{qty} qty · {weight}kg · ₹{rate}/kg` (only shows non-empty fields)
  - Payment: (no secondary line, just discount/total)
  - Other: (no secondary line, just amount)
- **Amounts line:** `Discount: ₹{discount}  Total: ₹{total_value}` (or `Amount: ₹{amount}` for other)
- **Action buttons row:** Four small icon buttons in a horizontal row

### 9.5 Action Buttons

#### Delete

```typescript
const handleDelete = (record: TmpRecord) => {
  Alert.alert(
    'Delete Record',
    'Are you sure you want to delete this temporary record?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await record.destroyPermanently();
          });
          Toast.show({ type: 'success', text1: 'Record deleted' });
        },
      },
    ]
  );
};
```

#### Edit

```typescript
const [editingRecord, setEditingRecord] = useState<TmpRecord | null>(null);

// Opens AddTmpRecordModal in edit mode:
const handleEdit = (record: TmpRecord) => {
  setEditingRecord(record);
};

// In JSX:
<AddTmpRecordModal
  visible={!!editingRecord}
  onClose={() => setEditingRecord(null)}
  editRecord={editingRecord}
/>
```

#### Copy to Clipboard

```typescript
import * as Clipboard from 'expo-clipboard';

const buildMessage = (record: TmpRecord): string => {
  const shopName = useAppStore.getState().shopName;
  
  switch (record.type) {
    case 'sale': {
      const parts = [`${shopName} - Order booked:`];
      if (record.weight) parts.push(`${record.weight}kg`);
      if (record.totalValue) parts.push(`₹${(record.totalValue / 100).toLocaleString('en-IN')}`);
      if (record.customerName) parts.push(`for ${record.customerName}`);
      return parts.join(' ');
    }
    case 'payment': {
      const amt = record.totalValue
        ? `₹${(record.totalValue / 100).toLocaleString('en-IN')}`
        : '';
      return `${shopName} - Payment received: ${amt} from ${record.customerName || 'Customer'}`;
    }
    case 'other': {
      const amt = record.amount
        ? `₹${(record.amount / 100).toLocaleString('en-IN')}`
        : '';
      const reason = record.reason ? ` (${record.reason})` : '';
      return `${shopName} - Expense: ${amt}${reason}`;
    }
    default:
      return '';
  }
};

const handleCopy = async (record: TmpRecord) => {
  const message = buildMessage(record);
  await Clipboard.setStringAsync(message);
  Toast.show({ type: 'success', text1: 'Copied to clipboard' });
};
```

#### Send via SMS

```typescript
import { Linking } from 'react-native';

const handleSMS = async (record: TmpRecord) => {
  const message = buildMessage(record);
  const encodedBody = encodeURIComponent(message);
  
  let smsUrl: string;
  if (record.customerPhone) {
    smsUrl = `sms:${record.customerPhone}?body=${encodedBody}`;
  } else {
    smsUrl = `sms:?body=${encodedBody}`;
  }

  const canOpen = await Linking.canOpenURL('sms:');
  if (canOpen) {
    await Linking.openURL(smsUrl);
  } else {
    // Fallback: copy to clipboard instead
    await Clipboard.setStringAsync(message);
    Toast.show({
      type: 'info',
      text1: 'SMS not available',
      text2: 'Message copied to clipboard instead.',
    });
  }
};
```

**Behavior:**
- If `customer_phone` is available → SMS app opens with recipient pre-filled + message body
- If `customer_phone` is null → SMS app opens with empty recipient + message body
- If SMS is unavailable (no SIM/tablet) → falls back to clipboard copy with info toast

### 9.6 Empty State

When `filteredRecords.length === 0`:

```
┌─────────────────────────────────────────┐
│                                         │
│           📋                            │
│   No temporary records yet.             │
│   Tap "+ Add Record" on the dashboard   │
│   to create your first one.             │
│                                         │
└─────────────────────────────────────────┘
```

---

## 10. Mobile App Settings — Retention Days

**File:** `admin-app/app/settings.tsx`

### 10.1 New Card Section

Add a new `GlassView` card section below the existing "Shop Details" card:

```
┌─────────────────────────────────────────┐
│  TEMPORARY RECORDS                      │  ◄── cardLabel
│                                         │
│  Local Retention Period                 │  ◄── cardTitle
│  Temporary records will be              │  ◄── cardDescription
│  automatically deleted from your        │
│  device after this many days.           │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  3                         days  │   │  ◄── Numeric input + suffix label
│  └──────────────────────────────────┘   │
│                                         │
│  Records in the cloud are kept for      │  ◄── Helper text
│  15 days regardless of this setting.    │
│                                         │
└─────────────────────────────────────────┘
```

### 10.2 Implementation

```typescript
const { tmpRetentionDays, setTmpRetentionDays } = useAppStore();
const [retentionInput, setRetentionInput] = useState(String(tmpRetentionDays));

// On input change:
const handleRetentionChange = (val: string) => {
  setRetentionInput(val);
  const parsed = parseInt(val, 10);
  if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
    setTmpRetentionDays(parsed);
  }
};
```

---

## 11. Desktop App — Electron DB Functions

**File:** `~/Development/Projects/wholesale-personal/electron/db.js`

### 11.1 Schema Migration

Bump `SCHEMA_VERSION` from `9` → `10`. Add migration block:

```javascript
if (version < 10) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tmp_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        qty REAL,
        weight REAL,
        rate REAL,
        discount INTEGER DEFAULT 0,
        total_value INTEGER,
        amount INTEGER,
        reason TEXT,
        date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );
    `);
  } catch (e) {
    console.error('Migration to version 10 failed:', e);
  }
}
```

**Note:** The desktop uses `INTEGER PRIMARY KEY AUTOINCREMENT` for original tables, but tmp_records uses `TEXT PRIMARY KEY` because IDs are UUIDs generated by the mobile app. This matches the pattern used by the delivery module tables.

### 11.2 CRUD Functions

```javascript
// ── Tmp Records ─────────────────────────────────────────────────

function getTmpRecords({ limit = 50, offset = 0, date_from, date_to, type } = {}) {
  let sql = `SELECT * FROM tmp_records`
  const conds = []
  const params = []
  
  if (date_from) {
    conds.push("date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("date <= ?")
    params.push(date_to)
  }
  if (type && type !== 'all') {
    conds.push("type = ?")
    params.push(type)
  }
  
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  sql += " ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)
  return db.prepare(sql).all(...params)
}

function getTmpRecordsCount({ date_from, date_to, type } = {}) {
  let sql = `SELECT COUNT(*) AS count FROM tmp_records`
  const conds = []
  const params = []
  
  if (date_from) {
    conds.push("date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("date <= ?")
    params.push(date_to)
  }
  if (type && type !== 'all') {
    conds.push("type = ?")
    params.push(type)
  }
  
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  return db.prepare(sql).get(...params).count
}

function cleanupOldTmpRecords() {
  db.prepare("DELETE FROM tmp_records WHERE date < date('now', '-15 days')").run()
}
```

Export: `getTmpRecords`, `getTmpRecordsCount`, `cleanupOldTmpRecords`

---

## 12. Desktop App — IPC Handlers

**File:** `~/Development/Projects/wholesale-personal/electron/ipc.js`

Add new handler registrations:

```javascript
// ── Tmp Records ───────────────────────────────────────────────
ipcMain.handle('tmp-records:list', wrap((_e, args) => db.getTmpRecords(args)))
ipcMain.handle('tmp-records:count', wrap((_e, args) => db.getTmpRecordsCount(args)))
```

No add/update/delete IPC handlers — desktop is read-only for tmp records.

---

## 13. Desktop App — Sync Integration

**File:** `~/Development/Projects/wholesale-personal/electron/sync.js`

### 13.1 Add to Sync Tables

Line ~68, add `'tmp_records'` to the tables array:

```javascript
const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'other_expenses', 'tmp_records']
```

### 13.2 Post-Sync Cleanup

After the sync cycle completes (before setting `last_sync_time`), add:

```javascript
// Cleanup expired tmp_records from local SQLite
try {
  db.prepare("DELETE FROM tmp_records WHERE date < date('now', '-15 days')").run()
} catch (e) {
  console.error('tmp_records cleanup error:', e)
}
```

---

## 14. Desktop App — Sidebar & Routing

### 14.1 Sidebar Navigation

**File:** `~/Development/Projects/wholesale-personal/src/components/Sidebar.jsx`

Add to `navItems` array (after "Other Expenses"):

```javascript
import { Clock } from 'lucide-react'  // or FileText, ClipboardList

// In navItems:
{ to: '/tmp-records', label: 'Tmp Records', icon: Clock },
```

### 14.2 Route Registration

**File:** `~/Development/Projects/wholesale-personal/src/main.jsx`

```javascript
import TmpRecords from './pages/TmpRecords'

// In Routes:
<Route path="/tmp-records" element={<TmpRecords />} />
```

Add keyboard shortcut in the `handleKeyDown` function:

```javascript
case 'm': navigate('/tmp-records'); break  // Alt+M
```

---

## 15. Desktop App — TmpRecords Page

**File (NEW):** `~/Development/Projects/wholesale-personal/src/pages/TmpRecords.jsx`

### 15.1 Page Design

Read-only table view, matching the visual style of the existing OtherExpenses page.

```
┌─────────────────────────────────────────────────────────────────┐
│  Temporary Records                            [Type ▾] [Dates] │
│─────────────────────────────────────────────────────────────────│
│                                                                 │
│  Type     │ Customer/Reason │ Phone      │ Qty │ Weight │ ...  │
│───────────┼─────────────────┼────────────┼─────┼────────┼──────│
│ 🔵 Sale   │ Rahul Sharma    │ 9876543210 │ 10  │ 50kg   │ ...  │
│ 🟢 Pay    │ Suresh Patel    │ 9876543210 │ —   │ —      │ ...  │
│ 🟠 Other  │ Truck fuel      │ —          │ —   │ —      │ ...  │
│───────────┼─────────────────┼────────────┼─────┼────────┼──────│
│                                                                 │
│  ◄ 1 2 3 ►                                  Showing 1-20 of 45 │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Table Columns

| Column | Source | Format |
|---|---|---|
| Type | `type` | Colored badge: blue "Sale", green "Payment", orange "Other" |
| Customer / Reason | `customer_name` (sale/payment) or `reason` (other) | Plain text |
| Phone | `customer_phone` | Plain text or `—` |
| Qty | `qty` | Number or `—` |
| Weight | `weight` | `{n}kg` or `—` |
| Rate | `rate` | `₹{n}/kg` or `—` |
| Discount | `discount` | `₹{n}` (paise→rupees) or `—` |
| Total / Amount | `total_value` (sale/payment) or `amount` (other) | `₹{n}` (paise→rupees) |
| Date | `date` | `DD/MM/YYYY` |

### 15.3 Filters

- **Type dropdown:** All / Sale / Payment / Other (sends `type` param to IPC)
- **Date range:** Two date inputs (From / To) — same pattern as OtherExpenses page

### 15.4 Implementation Pattern

Follow the exact same pattern as `OtherExpenses.jsx`:
- `useEffect` to fetch data via `ipc('tmp-records:list', filters)`
- `useEffect` to fetch count via `ipc('tmp-records:count', filters)`
- Pagination via the existing `Pagination` component
- Date range state management identical to OtherExpenses

---

## 16. Complete File Change Manifest

### Mobile App (`admin-app/`)

| # | Action | File | What Changes |
|---|---|---|---|
| 1 | MODIFY | `db/schema.ts` | Add `tmp_records` tableSchema, bump version to 2 |
| 2 | MODIFY | `db/index.ts` | Add schemaMigrations (v1→v2: createTable), register TmpRecord model |
| 3 | NEW | `db/models/TmpRecord.ts` | WatermelonDB model class |
| 4 | MODIFY | `lib/sync.ts` | Add `'tmp_records'` to coreTables in pull+push, add local cleanup |
| 5 | MODIFY | `store/app.ts` | Add `tmpRetentionDays` state + setter + loader |
| 6 | MODIFY | `app/(tabs)/index.tsx` | Add "+ Add" button, "Tmp Records" banner, modal state + rendering |
| 7 | NEW | `components/AddTmpRecordModal.tsx` | Full modal: type selector, autocomplete customer, dynamic form, save/edit |
| 8 | NEW | `components/TmpRecordsViewerModal.tsx` | Full modal: filter, record cards, delete/edit/copy/SMS actions |
| 9 | MODIFY | `app/settings.tsx` | Add retention days configuration card |

### Desktop App (`wholesale-personal/`)

| # | Action | File | What Changes |
|---|---|---|---|
| 10 | MODIFY | `cloudflare/schema.sql` | Add `CREATE TABLE tmp_records` DDL |
| 11 | MODIFY | `cloudflare/worker.js` | Add `'tmp_records'` to pull/push table arrays, add D1 cleanup |
| 12 | MODIFY | `electron/db.js` | Bump schema v10, migration, add getTmpRecords/Count/Cleanup functions |
| 13 | MODIFY | `electron/ipc.js` | Register `tmp-records:list` and `tmp-records:count` handlers |
| 14 | MODIFY | `electron/sync.js` | Add `'tmp_records'` to tables array, add post-sync cleanup |
| 15 | NEW | `src/pages/TmpRecords.jsx` | Read-only page: table view with filters and pagination |
| 16 | MODIFY | `src/components/Sidebar.jsx` | Add "Tmp Records" nav item |
| 17 | MODIFY | `src/main.jsx` | Import page, add route, add Alt+M shortcut |

**Total: 17 files (3 new, 14 modified)**

---

## 17. Execution Order

The changes should be implemented in this order to avoid broken intermediate states:

1. **Database layer first** (files #1–3, #10, #12): Schema, migrations, model
2. **Sync layer** (files #4, #11, #14): Worker + mobile + desktop sync
3. **Store** (file #5): Retention days state
4. **Mobile UI** (files #6–8): Dashboard buttons + modals
5. **Settings UI** (file #9): Retention days card
6. **Desktop UI** (files #13, #15–17): IPC + page + navigation

---

## 18. Testing Checklist

- [ ] Fresh mobile app install → schema created at v2 with tmp_records table
- [ ] Existing mobile app upgrade → migration v1→v2 runs, tmp_records table created, existing data preserved
- [ ] Create a Sale tmp record → form validates, saves, appears in viewer
- [ ] Create a Payment tmp record → form validates, saves, appears in viewer
- [ ] Create an Other tmp record → form validates, saves, appears in viewer
- [ ] Customer autocomplete → typing shows suggestions, selecting fills name+id+phone
- [ ] Custom customer name → typing without selecting saves name only, id+phone null
- [ ] Edit a record → opens pre-filled form, saves updates
- [ ] Delete a record → confirmation dialog, record removed
- [ ] Copy to clipboard → formatted message copied, toast shown
- [ ] SMS with phone → native SMS app opens with recipient + message pre-filled
- [ ] SMS without phone → native SMS app opens with empty recipient + message
- [ ] SMS unavailable → falls back to clipboard copy with info toast
- [ ] Rate auto-calculation → rate updates as weight/totalValue change
- [ ] Sync push → new/edited records push to D1 via Worker
- [ ] Sync pull → records from D1 appear on other devices
- [ ] Local cleanup → records older than N days deleted after sync (N from settings)
- [ ] D1 cleanup → records older than 15 days deleted on pull
- [ ] Desktop sync → tmp_records pulled and displayed on TmpRecords page
- [ ] Desktop filters → type dropdown and date range work correctly
- [ ] Desktop pagination → works for large record sets
- [ ] Settings → changing retention days persists across app restart
- [ ] Settings → values clamped to 1–30 range
