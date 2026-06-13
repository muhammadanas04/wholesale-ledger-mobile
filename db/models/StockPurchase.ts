import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation } from '@nozbe/watermelondb/decorators';
import Product from './Product';

export default class StockPurchase extends Model {
  static table = 'stock_purchases';

  static associations = {
    products: { type: 'belongs_to' as const, key: 'product_id' },
  };

  @text('product_id') productId!: string;
  @field('qty') qty!: number;
  @field('cost_price') costPrice!: number; // in paise
  @text('supplier') supplier?: string;
  @text('firm_name') firmName?: string;
  @text('date') date!: string; // YYYY-MM-DD
  @field('weight') weight?: number;
  @text('location') location?: string;
  @text('bill_no') billNo?: string;
  @text('vehicle_number') vehicleNumber?: string;
  @text('driver_name') driverName?: string;
  @field('total_cost') totalCost?: number; // in paise
  @text('created_at') createdAt?: string;
  @text('updated_at') updatedAt?: string;
  @field('synced') synced!: number;

  @relation('products', 'product_id') product!: Relation<Product>;
}
