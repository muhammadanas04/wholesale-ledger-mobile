import { Model } from '@nozbe/watermelondb';
import { field, text, children } from '@nozbe/watermelondb/decorators';
import { Query } from '@nozbe/watermelondb';
import Sale from './Sale';
import Payment from './Payment';

export default class Customer extends Model {
  static table = 'customers';

  static associations = {
    sales: { type: 'has_many' as const, foreignKey: 'customer_id' },
    payments: { type: 'has_many' as const, foreignKey: 'customer_id' },
  };

  @text('name') name!: string;
  @text('phone') phone?: string;
  @text('address') address?: string;
  @field('balance') balance!: number; // in paise
  @text('created_at') createdAt!: string;
  @text('updated_at') updatedAt!: string;
  @field('synced') synced!: number;

  @children('sales') sales!: Query<Sale>;
  @children('payments') payments!: Query<Payment>;
}
