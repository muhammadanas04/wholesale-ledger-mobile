# Admin App — API Specification

All requests go to the Cloudflare Worker URL stored in device settings.
All requests include: `Authorization: Bearer <SYNC_SECRET>` header.
All request/response bodies are JSON.
All monetary values are integers in paise.
All timestamps are ISO 8601 strings.

---

## Existing Endpoints (unchanged from desktop app)

### GET /pull
Pull all records changed after a given timestamp.

**Query params:** `?since=<ISO_timestamp>`
**Response:**
```json
{
  "customers": [...],
  "products": [...],
  "sales": [...],
  "sale_items": [...],
  "payments": [...],
  "stock_purchases": [...]
}
```

### POST /push
Upsert records from the app into D1. Uses last-write-wins on `updated_at`.

**Request body:**
```json
{
  "customers": [...],
  "products": [...],
  "sales": [...],
  "sale_items": [...],
  "payments": [...],
  "stock_purchases": [...]
}
```
**Response:** `{ "ok": true }`

---

## New Endpoints (add to Worker for delivery module)

### GET /pull/delivery
Pull delivery-related records changed after a given timestamp.

**Query params:** `?since=<ISO_timestamp>`
**Response:**
```json
{
  "drivers": [...],
  "deliveries": [...],
  "delivery_items": [...]
}
```

### POST /push/delivery
Upsert delivery records into D1.

**Request body:**
```json
{
  "drivers": [...],
  "deliveries": [...],
  "delivery_items": [...]
}
```
**Response:** `{ "ok": true }`

---

### POST /driver/auth
Called by the **driver app** to authenticate. Not called by admin app.

**Request body:**
```json
{
  "phone": "9876543210",
  "otp": "482910"
}
```
**Response (success):**
```json
{
  "ok": true,
  "driver_id": "uuid",
  "name": "Driver Name"
}
```
**Response (failure):**
```json
{ "ok": false, "error": "Invalid OTP" }
```
**Behaviour:** If `otp_used = 0` and OTP matches, return success and set `otp_used = 1` in D1. If `otp_used = 1`, reject (OTP already consumed).

---

### POST /driver/location
Called by the **driver app** periodically to update location.

**Request body:**
```json
{
  "driver_id": "uuid",
  "latitude": 27.6094,
  "longitude": 75.1398
}
```
**Response:** `{ "ok": true }`
**Behaviour:** Upserts into `driver_locations` table. Stores only the latest location per driver (overwrite or insert new row with timestamp).

---

### GET /driver/locations
Called by the **admin app** to get current locations of all active drivers.

**Response:**
```json
{
  "locations": [
    {
      "driver_id": "uuid",
      "driver_name": "Name",
      "phone": "9876543210",
      "latitude": 27.6094,
      "longitude": 75.1398,
      "recorded_at": "2026-06-12T10:30:00Z"
    }
  ]
}
```

---

### PATCH /delivery-item/:id/status
Called by the **driver app** to mark a delivery item done.

**Request body:** `{ "status": "done" }`
**Response:** `{ "ok": true }`
**Behaviour:** Updates `delivery_items.status` and `updated_at` in D1. Admin app picks this up on next pull cycle.

---

## Auth Notes

- Admin app: uses `SYNC_SECRET` in Authorization header — same as desktop app
- Driver app: uses `POST /driver/auth` → stores `driver_id` in AsyncStorage, no further auth needed
- Worker validates all admin requests with `if (request.headers.get('Authorization') !== 'Bearer ' + env.SYNC_SECRET)`
- Driver location endpoint validates by checking `driver_id` exists and `active = 1` in D1

---

## Error Responses (all endpoints)

```json
{ "ok": false, "error": "Unauthorized" }           // 401
{ "ok": false, "error": "Missing required fields" } // 400
{ "ok": false, "error": "Internal error" }          // 500
```
