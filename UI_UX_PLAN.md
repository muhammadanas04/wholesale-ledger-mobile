# UI/UX Plan — Wholesale Ledger Admin App

This document outlines the visual design strategy, usability guidelines, and performance-engineering considerations for the Wholesale Ledger Admin App. The goal is to build a premium, fast, and highly accessible app tailored for a wholesale owner who manages high-volume sales, customer balances, and driver routes on the move.

---

## 1. User Persona & Environmental Context

### Persona: The Busy Wholesale Admin
* **Context**: Often walking around a busy, noisy warehouse, loading dock, or traveling. 
* **Priorities**: High speed, immediate confirmation, high legibility under sunlight, single-handed operation, and resilience to flaky internet connectivity.
* **Key Usability Requirements**:
  * **Sunlight Legibility**: High contrast (meeting WCAG 2.2 AA at minimum, aiming for AAA where possible).
  * **One-Handed Tap Targets**: Primary actions must sit within the comfort thumb zone (bottom 60% of the screen) and be at least **48x48dp** with plenty of spacing.
  * **Minimal Typing**: Leverage numeric keypad configurations, smart autocomplete, and smart selectors to reduce manual typing.

---

## 2. Design System & Visual Aesthetics

To ensure a premium feel while maintaining high legibility, we will use a curated **Indigo & Amber** palette combined with slate grays.

### Color Palette (Tailwind Tokens)
* **Backgrounds**:
  * Primary: Slate 50 (`#F8FAFC`) / Slate 900 (`#0F172A`)
  * Surface: White (`#FFFFFF`) / Slate 800 (`#1E293B`)
* **Brand/Primary**: Indigo 600 (`#4F46E5`) / Indigo 400 (`#818CF8`)
* **Accents (Financial Meanings)**:
  * **Balance Due / Debts**: Rose 600 (`#E11D48`) / Rose 400 (`#FB7185`) — representing outstanding client debts.
  * **Settled / Paid**: Emerald 600 (`#059669`) / Emerald 400 (`#34D399`) — representing payments received or zero balances.
  * **Overpaid (Credits)**: Amber 600 (`#D97706`) / Amber 400 (`#FBBF24`) — representing customer credits.
* **Wayfinding / Offline Status**:
  * Synced / Online: Emerald 500
  * Unsynced Changes: Amber 500
  * Offline / Sync Error: Slate 400 / Rose 500

### Typography (Inter / System Sans-Serif)
* **Headers**: Heavy weight, bold tracking to stand out.
* **Numbers/Amounts**: Monospace or tabular numerals (e.g., `font-mono`) to prevent layout jitter and make alignment of decimal values easy to read.

---

## 3. Interaction Patterns (Ease of Use)

### A. Accelerated Forms (Keyboard-First Focus)
* **Sale Entry**:
  * On opening the "New Sale" screen, auto-focus the customer search.
  * When adding an item, default the quantity keyboard to `numeric` and unit price to `decimal-pad`.
  * Pressing "Next" on the keyboard should automatically move focus to the next logical input, and "Done" should trigger submission or item addition.
* **Tap-to-Action**:
  * Swipe actions on lists (e.g., swipe left on a Customer row to instantly open the "Record Payment" sheet or "Add Sale" form).

### B. Glassmorphism & Micro-animations
* **Micro-interactions**: Subtle scale down on tap for buttons (`scale-95` on active state) to simulate tactile feedback.
* **Transitions**: Use Expo Router shared element transitions or slide up modals for overlay actions (like the product picker) to give a spatial connection.
* **Bottom Sheets**: Use native-feeling bottom sheets for adding items in a sale, keeping the background context visible instead of forcing a full page transition.

---

## 4. Performance Engineering

A premium experience depends on high frame rates (60fps scrolling and instant touch responses). We will enforce the following:

### A. Rendering Optimization
1. **FlashList Integration**:
   * Replace native `FlatList` with `@shopify/flash-list` for the Customer List, Sales List, and Payments List.
   * Recycle views efficiently to handle databases containing 5,000+ customers or sales without lag.
2. **WatermelonDB Reactive Binding**:
   * Use `@nozbe/watermelondb/react` components or `.observe()` query hooks.
   * This ensures components only re-render when their queried data changes, avoiding global state tree re-evaluations.
3. **Debounced Search**:
   * Search queries on lists must be debounced by **150ms** before querying local database indexes, preventing UI stutter during typing.

### B. Network & Sync UX
* **Non-Blocking Push**: All database writes happen locally to WatermelonDB instantly. The UI transitions immediately with optimistic updates. The synchronization process runs silently in the background.
* **Wayfinding Indicators**: 
  * A subtle header sync icon:
    * Spinning arrow: Active sync.
    * Steady check: All synced.
    * Amber exclamation: Unsynced local edits (offline).
  * No blocking screen-wide loaders unless a connection setup test is explicitly requested by the user.

---

## 5. Screen-Specific UX Wireframe Guidelines

### Dashboard (Tabs Home)
* **Top Metric Cards**: Outstanding Balance (Large, Red), Total Active Drivers (Indigo), Synced Status (Right side, pill-shaped badge).
* **Recent Activity list**: Combined list of recent sales/payments with distinct iconography (green arrow incoming for payments, red arrow outgoing for sales).

### Customer Detail (Tabs / Customers / [id])
* **Sticky Profile Card**: Large Name, Quick SMS/Phone icon buttons (48x48 touch targets).
* **Three-Tab Selector**: Sales | Payments | Bill.
* **Bill Tab**: 
  * Large, copyable text-block with a preview of the actual SMS message.
  * Prominent, high-contrast CTA "Send via SMS" (with an SMS icon) at the bottom.
  * Disabled state with micro-copy if the customer lacks a registered phone number.
