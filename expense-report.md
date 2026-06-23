# Implementation Plan: Driver Expense Reports in Admin App

## 1. Objective
Enable admins to view, verify, and track expense reports (including receipt images) submitted by drivers directly from the **Delivery** tab in the Admin App.

## 2. API & Data Layer (`lib/api.ts`)
We need to fetch the expenses stored in the database.
- **Add API Method:** Create a `getExpenses(driverId?: string)` function in `admin-app/lib/api.ts`.
- **Endpoint:** This will call the Cloudflare Worker proxy (e.g., `GET /admin/expenses`). 
- **Payload Structure:** Ensure the response includes:
  - `id`
  - `driver_id` (used to map to the driver's name)
  - `category` (e.g., 'fuel', 'maintenance', 'challan')
  - `amount` (stored as integers/paise)
  - `image_url` (the Backblaze B2 public URL for the receipt)
  - `note`
  - `created_at`
- **Caching:** Use `@tanstack/react-query` to fetch, cache, and automatically refresh this data.

## 3. UI/UX Implementation
### A. Location within the App
Since expenses are heavily tied to drivers, there are two ideal places for this:
1. **Dedicated Expenses Screen:** Create `app/(tabs)/delivery/expenses.tsx` as a top-level sub-view in the Delivery stack.
2. **Driver Profile View:** Embed an "Expenses" section inside the specific driver's detail modal/screen in `drivers.tsx`.

*Recommendation:* Start with a dedicated "Recent Expenses" global list in the Delivery tab so admins can see a feed of all driver expenses, with a filter by driver.

### B. New Components
1. **`ExpenseCard.tsx`**
   - **Header:** Driver Name & Date/Time.
   - **Body:** 
     - Icon based on the `category` (e.g., ⛽ for fuel, 📄 for challan).
     - Formatted amount (convert paise back to ₹ or units).
     - Optional `note` text.
   - **Media:** A square thumbnail of the `image_url`.
2. **`ImageViewerModal.tsx`**
   - When the admin taps the receipt thumbnail on the `ExpenseCard`, open a full-screen modal.
   - Support pinch-to-zoom (using `react-native-gesture-handler` or a library like `react-native-image-zoom-viewer`) so admins can read small text on the receipts.

## 4. Execution Steps
1. **Worker Update (if needed):** Verify the Cloudflare worker exposes a `GET /admin/expenses` route that returns all expenses across all drivers.
2. **API Client Update:** Add the `getExpenses` fetcher to `admin-app/lib/api.ts`.
3. **Build UI Components:** Implement `ExpenseCard` and `ImageViewerModal` in `admin-app/components/`.
4. **Integrate Screen:** Create the Expenses screen/feed in the Delivery tab and wire it up with React Query.
5. **Polish:** Add loading skeletons, empty states, and pull-to-refresh functionality.

---

## 5. Context & Strict Guidelines for AI Agents
**To any AI agent implementing this plan, strictly adhere to the following guardrails to prevent regressions in the `admin-app`:**

- **DO NOT TOUCH** unrelated routing or layout files like `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, or `app/(tabs)/index.tsx`.
- **DO NOT MODIFY** existing UI components in `components/` unless absolutely necessary for reusability. Instead, create *new* isolated components (`ExpenseCard.tsx`, `ImageViewerModal.tsx`).
- **RESTRICTED SCOPE:** Only modify the following existing files:
  1. `lib/api.ts` (Append `getExpenses` method ONLY. Do not alter existing auth or fetch logic).
  2. `app/(tabs)/delivery/drivers.tsx` OR `app/(tabs)/delivery/index.tsx` (Only add the navigation link/button to the new Expenses screen).
- **NEW FILES TO CREATE:**
  - `app/(tabs)/delivery/expenses.tsx` (The main screen)
  - `components/ExpenseCard.tsx`
  - `components/ImageViewerModal.tsx`
- **STYLING:** Use the existing Tailwind CSS (NativeWind) setup with `className`. Do not introduce new styling systems.
- **STATE:** Use the existing `@tanstack/react-query` setup. Do not introduce Redux or alter the Zustand `store/app.ts` state unless specifically handling a new global auth requirement (which shouldn't be needed here).
