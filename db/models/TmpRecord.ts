import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation } from '@nozbe/watermelondb/decorators';
import Customer from './Customer';

export default class TmpRecord extends Model {
  static table = 'tmp_records';

  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  };

  @text('type') type!: string;                   // 'sale' | 'payment' | 'other'
  @text('customer_id') customerId?: string;       // Optional FK
  @text('customer_name') customerName?: string;
  @text('customer_phone') customerPhone?: string;
  @field('qty') qty?: number;
  @field('weight') weight?: number;
  @field('rate') rate?: number;
  @field('discount') discount?: number;           // paise
  @field('total_value') totalValue?: number;       // paise
  @field('amount') amount?: number;               // paise
  @text('reason') reason?: string;
  @text('date') date!: string;                    // YYYY-MM-DD
  @text('created_at') createdAt?: string;         // ISO 8601
  @text('updated_at') updatedAt?: string;         // ISO 8601
  @field('synced') synced!: number;               // 0 or 1

  @relation('customers', 'customer_id') customer!: Relation<Customer>;
}
