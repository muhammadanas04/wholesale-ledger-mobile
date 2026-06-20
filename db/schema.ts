import { appSchema, tableSchema } from '@nozbe/watermelondb';

// NOTE ON TIMESTAMPS: We intentionally use type 'string' for 'created_at' and 'updated_at' 
// to match the ISO 8601 date string formats used by the Cloudflare D1 and desktop SQLite databases.
// This disables WatermelonDB's native automatic @date tracking (which requires numbers).
// Consequently, CRUD and sync operations must manually update and parse these values as ISO strings.
export default appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'phone', type: 'string', isOptional: true, isIndexed: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'balance', type: 'number' }, // in paise
        { name: 'created_at', type: 'string' }, // ISO 8601 string
        { name: 'updated_at', type: 'string' }, // ISO 8601 string
        { name: 'synced', type: 'number' }, // 0 = unsynced, 1 = synced
      ],
    }),
    tableSchema({
      name: 'products',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'current_stock', type: 'number' },
        { name: 'reorder_level', type: 'number' },
        { name: 'created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isOptional: true },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'stock_purchases',
      columns: [
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'qty', type: 'number' },
        { name: 'cost_price', type: 'number' }, // in paise
        { name: 'supplier', type: 'string', isOptional: true },
        { name: 'firm_name', type: 'string', isOptional: true },
        { name: 'date', type: 'string' }, // YYYY-MM-DD
        { name: 'weight', type: 'number', isOptional: true },
        { name: 'location', type: 'string', isOptional: true },
        { name: 'bill_no', type: 'string', isOptional: true },
        { name: 'vehicle_number', type: 'string', isOptional: true },
        { name: 'driver_name', type: 'string', isOptional: true },
        { name: 'total_cost', type: 'number', isOptional: true }, // in paise
        { name: 'created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isOptional: true },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sales',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'string' }, // YYYY-MM-DD
        { name: 'total_amount', type: 'number' }, // in paise
        { name: 'discount', type: 'number' }, // in paise
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isOptional: true },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sale_items',
      columns: [
        { name: 'sale_id', type: 'string', isIndexed: true },
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'qty', type: 'number' },
        { name: 'unit_price', type: 'number' }, // in paise
        { name: 'weight', type: 'number', isOptional: true },
        { name: 'total_price', type: 'number', isOptional: true }, // in paise
        { name: 'created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isOptional: true },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'payments',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' }, // in paise
        { name: 'discount', type: 'number' }, // in paise
        { name: 'date', type: 'string' }, // YYYY-MM-DD
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isOptional: true },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'drivers',
      columns: [
        { name: 'phone', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isOptional: true },
        { name: 'otp', type: 'string', isOptional: true },
        { name: 'otp_used', type: 'number' }, // 0 = false, 1 = true
        { name: 'active', type: 'number' }, // 0 = inactive, 1 = active
        { name: 'created_at', type: 'string' },
        { name: 'updated_at', type: 'string' },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'deliveries',
      columns: [
        { name: 'driver_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' }, // pending, in_progress, completed
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'string' },
        { name: 'updated_at', type: 'string' },
        { name: 'synced', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'delivery_items',
      columns: [
        { name: 'delivery_id', type: 'string', isIndexed: true },
        { name: 'address', type: 'string' },
        { name: 'stock_amount', type: 'string' }, // Free text description of items
        { name: 'status', type: 'string' }, // pending, done
        { name: 'customer_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'qty', type: 'number', isOptional: true },
        { name: 'weight', type: 'number', isOptional: true },
        { name: 'total_price', type: 'number', isOptional: true },
        { name: 'customer_name', type: 'string', isOptional: true },
        { name: 'customer_phone', type: 'string', isOptional: true },
        { name: 'created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isOptional: true },
        { name: 'synced', type: 'number' },
      ],
    }),
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
  ],
});
