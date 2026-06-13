import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

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

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'wholesale_ledger_db',
  jsi: true, // Use JS Interface for faster native access (React Native)
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
  ],
});
