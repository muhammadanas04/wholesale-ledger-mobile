import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation } from '@nozbe/watermelondb/decorators';
import Sale from './Sale';
import Product from './Product';

export default class SaleItem extends Model {
  static table = 'sale_items';

  static associations = {
    sales: { type: 'belongs_to' as const, key: 'sale_id' },
    products: { type: 'belongs_to' as const, key: 'product_id' },
  };

  @text('sale_id') saleId!: string;
  @text('product_id') productId!: string;
  @field('qty') qty!: number;
  @field('unit_price') unitPrice!: number; // in paise
  @field('weight') weight?: number;
  @field('total_price') totalPrice?: number; // in paise
  @text('created_at') createdAt?: string;
  @text('updated_at') updatedAt?: string;
  @field('synced') synced!: number;

  @relation('sales', 'sale_id') sale!: Relation<Sale>;
  @relation('products', 'product_id') product!: Relation<Product>;
}
