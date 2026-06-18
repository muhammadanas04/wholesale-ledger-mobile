import { Platform } from 'react-native';
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schemaMigrations, createTable } from '@nozbe/watermelondb/Schema/migrations';

import schema from './schema';
import Customer from './models/Customer';
import Product from './models/Product';
import StockPurchase from './models/StockPurchase';
import Sale from './models/Sale';
import SaleItem from './models/SaleItem';
import Payment from './models/Payment';
import Driver from './models/Driver';
import Delivery from './models/Delivery';
import DeliveryItem from './models/DeliveryItem';
import TmpRecord from './models/TmpRecord';

const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
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
    },
  ],
});

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'wholesale_ledger_db',
  jsi: Platform.OS === 'ios', // JSI is disabled on Android due to React Native 0.74+ deprecations
  onSetUpError: (error) => {
    console.error('WatermelonDB adapter set up error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Customer,
    Product,
    StockPurchase,
    Sale,
    SaleItem,
    Payment,
    Driver,
    Delivery,
    DeliveryItem,
    TmpRecord,
  ],
});
