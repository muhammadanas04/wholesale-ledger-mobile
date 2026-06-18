# Requirements Document: Temporary Records (tmp-records)

## Introduction

Temporary Records is a lightweight, quick-entry record system enabling admins to log sales, payments, and expenses on the go without formal workflows. Records are informational only—they do not affect customer balances, product stock, or business state. The feature provides full CRUD operations on mobile, read-only access on desktop, automatic cloud sync, and configurable data retention with automatic cleanup.

## Glossary

- **TmpRecord**: A temporary record entry representing a sale, payment, or expense logged for quick tracking without formal business impact.
- **RecordType**: The category of a TmpRecord, being one of: 'sale', 'payment', or 'other'.
- **WatermelonDB**: The local database used by the mobile app for offline-first data storage.
- **D1**: Cloudflare's SQLite-based serverless database used for cloud sync storage.
- **Sync**: The process of synchronizing local data with the cloud database, consisting of push (local to cloud) and pull (cloud to local).
- **Retention Period**: The configurable number of days (1-30) that temporary records remain on a device before automatic deletion.
- **Paise**: The smallest monetary unit in Indian currency; all monetary values are stored as integers in paise to avoid floating-point errors.
- **Customer Autocomplete**: A search feature that suggests matching customers from the database as the user types a customer name.
- **Share**: The ability to send a formatted record message via SMS or copy it to the clipboard.

## Requirements

### Requirement 1: Create Sale Records

**User Story:** As an admin, I want to quickly create sale records with customer and item details, so that I can log sales on the go without formal workflows.

#### Acceptance Criteria

1. WHEN the admin taps the "+ Add Record" button on the dashboard, THE Mobile_App SHALL open the AddTmpRecordModal
2. WHEN the admin selects "Sale" as the record type, THE Mobile_App SHALL display fields for customer name, quantity, weight, discount, and total value
3. WHEN the admin types in the customer name field, THE Mobile_App SHALL query the customers table and display up to 5 matching customers sorted alphabetically
4. WHEN the admin selects a customer from autocomplete suggestions, THE Mobile_App SHALL populate customer_name and customer_phone fields
5. WHEN the admin enters weight and total value for a sale, THE Mobile_App SHALL automatically calculate and display the rate (total_value / weight)
6. WHEN the admin taps Save with valid sale data, THE Mobile_App SHALL create a new TmpRecord in WatermelonDB with synced=0
7. WHEN a new record is created, THE Mobile_App SHALL trigger background sync to push the record to D1

### Requirement 2: Create Payment Records

**User Story:** As an admin, I want to quickly log payment records from customers, so that I can track incoming payments informally.

#### Acceptance Criteria

1. WHEN the admin selects "Payment" as the record type, THE Mobile_App SHALL display fields for customer name, discount, and total value
2. WHEN the admin types in the customer name field, THE Mobile_App SHALL provide customer autocomplete suggestions
3. WHEN the admin taps Save with valid payment data (customer name and total value), THE Mobile_App SHALL create a new TmpRecord with type='payment'
4. WHEN a payment record is created, THE Mobile_App SHALL set synced=0 and trigger background sync

### Requirement 3: Create Expense Records

**User Story:** As an admin, I want to quickly log other expenses with amounts and reasons, so that I can track miscellaneous expenditures.

#### Acceptance Criteria

1. WHEN the admin selects "Other" as the record type, THE Mobile_App SHALL display fields for amount and reason
2. WHEN the admin taps Save with valid expense data (amount > 0), THE Mobile_App SHALL create a new TmpRecord with type='other'
3. WHEN an expense record is created, THE Mobile_App SHALL set synced=0 and trigger background sync
4. THE Mobile_App SHALL NOT display customer-related fields for 'other' type records

### Requirement 4: View and Filter Records

**User Story:** As an admin, I want to view all my temporary records filtered by type, so that I can quickly find specific records.

#### Acceptance Criteria

1. WHEN the admin taps the "Temporary Records" banner on the dashboard, THE Mobile_App SHALL open the TmpRecordsViewerModal displaying all records
2. THE TmpRecordsViewerModal SHALL display records sorted by created_at in descending order
3. WHEN the admin selects a type filter (All/Sale/Payment/Other), THE Mobile_App SHALL display only records matching the selected type
4. WHEN no records exist for the selected filter, THE Mobile_App SHALL display an empty state message
5. THE Mobile_App SHALL display each record card with type-specific formatting showing relevant fields

### Requirement 5: Edit Records

**User Story:** As an admin, I want to edit existing temporary records, so that I can correct mistakes or update information.

#### Acceptance Criteria

1. WHEN the admin taps the edit action on a record card, THE Mobile_App SHALL open AddTmpRecordModal in edit mode with existing values pre-populated
2. WHEN the admin modifies record fields and taps Save, THE Mobile_App SHALL update the existing record in WatermelonDB
3. WHEN a record is updated, THE Mobile_App SHALL set synced=0 and updated_at to the current timestamp
4. WHEN a record is updated, THE Mobile_App SHALL trigger background sync to push changes to D1

### Requirement 6: Delete Records

**User Story:** As an admin, I want to delete temporary records, so that I can remove incorrect or unwanted entries.

#### Acceptance Criteria

1. WHEN the admin taps the delete action on a record card, THE Mobile_App SHALL display a confirmation dialog
2. WHEN the admin confirms deletion, THE Mobile_App SHALL permanently remove the record from WatermelonDB
3. WHEN a record is deleted locally, THE Mobile_App SHALL sync the deletion to D1 on the next sync cycle

### Requirement 7: Share via SMS

**User Story:** As an admin, I want to share a record via SMS to a customer, so that I can quickly communicate order or payment details.

#### Acceptance Criteria

1. WHEN the admin taps the SMS button on a record with a customer phone number, THE Mobile_App SHALL open the native SMS app with recipient and message pre-filled
2. WHEN the admin taps the SMS button on a record without a customer phone number, THE Mobile_App SHALL open the native SMS app with only the message pre-filled
3. THE Mobile_App SHALL format the message according to record type (sale: "Shop - Order booked: Xkg ₹Y for Customer", payment: "Shop - Payment received: ₹X from Customer", other: "Shop - Expense: ₹X (reason)")
4. IF the device cannot open SMS (no SIM, tablet), THE Mobile_App SHALL display a toast notification and copy the message to clipboard

### Requirement 8: Copy to Clipboard

**User Story:** As an admin, I want to copy a formatted record message to clipboard, so that I can paste it into any messaging app.

#### Acceptance Criteria

1. WHEN the admin taps the Copy button on a record card, THE Mobile_App SHALL format the record as a human-readable message
2. WHEN the message is formatted, THE Mobile_App SHALL copy it to the system clipboard
3. WHEN the copy succeeds, THE Mobile_App SHALL display a toast notification "Copied to clipboard"

### Requirement 9: Synchronize Records

**User Story:** As an admin, I want my temporary records to sync across devices, so that I can access them from both mobile and desktop.

#### Acceptance Criteria

1. WHEN the mobile app opens or returns to foreground, THE Sync_Module SHALL execute runSync()
2. WHEN runSync() executes, THE Sync_Module SHALL push all unsynced records (synced=0) to D1 before pulling
3. WHEN push succeeds for a record that has not been modified during sync, THE Sync_Module SHALL set synced=1 for that record
4. WHEN pull executes, THE Sync_Module SHALL fetch all records updated since last sync from D1
5. WHEN new or updated records are pulled, THE Sync_Module SHALL upsert them to WatermelonDB
6. WHEN sync completes, THE Sync_Module SHALL update sync status in the Zustand store
7. IF network fails during sync, THE Sync_Module SHALL set sync status to 'error' and retry on next foreground event

### Requirement 10: Configure Retention Period

**User Story:** As an admin, I want to configure how long temporary records remain on my mobile device, so that I control data cleanup timing.

#### Acceptance Criteria

1. THE Mobile_App SHALL provide a settings option to configure retention period between 1 and 30 days
2. WHEN the admin changes the retention period, THE Mobile_App SHALL save the new value to local settings
3. WHEN retention period is configured, THE Mobile_App SHALL use it for local cleanup operations

### Requirement 11: Automatic Local Cleanup

**User Story:** As an admin, I want old temporary records to be automatically deleted from my device, so that storage is managed efficiently.

#### Acceptance Criteria

1. WHEN sync completes, THE Mobile_App SHALL execute local cleanup based on configured retention period
2. WHEN a record's date is older than (current date - retention days), THE Mobile_App SHALL permanently delete that record
3. THE Mobile_App SHALL NOT delete records newer than the retention cutoff
4. THE D1_Database SHALL delete records older than 15 days on every pull request

### Requirement 12: Desktop Read-Only Access

**User Story:** As an admin, I want to view my temporary records on desktop, so that I can review historical entries on a larger screen.

#### Acceptance Criteria

1. WHEN the admin opens the TmpRecords page on Desktop, THE Desktop_App SHALL fetch and display records from local SQLite
2. THE Desktop_App SHALL provide type filter dropdown (All/Sale/Payment/Other)
3. THE Desktop_App SHALL provide date range filters (date_from, date_to)
4. THE Desktop_App SHALL display records in a paginated table with default 50 records per page
5. THE Desktop_App SHALL NOT provide create, edit, or delete actions (read-only access)
6. WHEN the desktop app syncs, THE Desktop_App SHALL pull records from D1 and upsert to local SQLite

### Requirement 13: Offline Operation

**User Story:** As an admin, I want to create and manage records while offline, so that I can work without network connectivity.

#### Acceptance Criteria

1. WHEN the device is offline, THE Mobile_App SHALL allow creating, editing, viewing, and deleting records normally
2. WHEN records are created or modified offline, THE Mobile_App SHALL store them with synced=0
3. WHEN network connectivity is restored, THE Mobile_App SHALL automatically sync pending changes on next foreground event

### Requirement 14: Form Validation

**User Story:** As an admin, I want clear validation feedback when form input is invalid, so that I can correct errors before saving.

#### Acceptance Criteria

1. WHEN the admin attempts to save a sale or payment record without a customer name, THE Mobile_App SHALL prevent save and display an inline validation error
2. WHEN the admin attempts to save an 'other' record with amount ≤ 0, THE Mobile_App SHALL prevent save and display an inline validation error
3. WHEN the admin enters an invalid date format, THE Mobile_App SHALL prevent save and display an error
4. WHEN validation fails, THE Mobile_App SHALL highlight the specific field(s) with errors

### Requirement 15: Performance - Autocomplete Query

**User Story:** As a system, the autocomplete query must be fast, so that the user experience remains responsive.

#### Acceptance Criteria

1. WHEN the admin types in the customer name field, THE Mobile_App SHALL return autocomplete results within 200ms for typical queries
2. THE Mobile_App SHALL limit autocomplete results to 5 customers maximum
3. THE Mobile_App SHALL use indexed queries on the customer name field

### Requirement 16: Data Integrity - Monetary Values

**User Story:** As a system, monetary values must be stored accurately, so that financial data is precise.

#### Acceptance Criteria

1. THE System SHALL store all monetary values as integers in paise
2. WHEN converting rupees to paise, THE System SHALL multiply by 100 and round to the nearest integer
3. THE System SHALL NOT store monetary values as floating-point numbers
4. THE System SHALL ensure all monetary values are non-negative

### Requirement 17: Security - Authentication

**User Story:** As a system, sync requests must be authenticated, so that only authorized users can access the data.

#### Acceptance Criteria

1. WHEN making sync requests, THE System SHALL include Bearer token in the Authorization header
2. THE System SHALL use the same SYNC_SECRET authentication as core business data
3. IF authentication fails, THE Worker SHALL reject the request with 401 Unauthorized

### Requirement 18: Concurrency Handling

**User Story:** As a system, concurrent edits during sync must be handled correctly, so that no data is lost or corrupted.

#### Acceptance Criteria

1. WHEN pushing a record to D1, THE Sync_Module SHALL record the record's updated_at timestamp
2. WHEN marking a record as synced, THE Sync_Module SHALL verify the updated_at has not changed during push
3. IF a record was modified during push, THE Sync_Module SHALL leave synced=0 for the next sync cycle
