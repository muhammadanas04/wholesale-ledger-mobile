import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation, children } from '@nozbe/watermelondb/decorators';
import { Query } from '@nozbe/watermelondb';
import Customer from './Customer';
import SaleItem from './SaleItem';

export default class Sale extends Model {
  static table = 'sales';

  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
    sale_items: { type: 'has_many' as const, foreignKey: 'sale_id' },
  };

  @text('customer_id') customerId!: string;
  @text('date') date!: string; // YYYY-MM-DD
  @field('total_amount') totalAmount!: number; // in paise
  @field('discount') discount!: number; // in paise
  @text('notes') notes?: string;
  @text('created_at') createdAt?: string;
  @text('updated_at') updatedAt?: string;
  @field('synced') synced!: number;

  @relation('customers', 'customer_id') customer!: Relation<Customer>;
  @children('sale_items') items!: Query<SaleItem>;
}
