import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation } from '@nozbe/watermelondb/decorators';
import Customer from './Customer';

export default class Payment extends Model {
  static table = 'payments';

  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  };

  @text('customer_id') customerId!: string;
  @field('amount') amount!: number; // in paise
  @field('discount') discount!: number; // in paise
  @text('date') date!: string; // YYYY-MM-DD
  @text('notes') notes?: string;
  @text('created_at') createdAt?: string;
  @text('updated_at') updatedAt?: string;
  @field('synced') synced!: number;

  @relation('customers', 'customer_id') customer!: Relation<Customer>;
}
