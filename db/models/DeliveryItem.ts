import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation } from '@nozbe/watermelondb/decorators';
import Delivery from './Delivery';
import Customer from './Customer';

export default class DeliveryItem extends Model {
  static table = 'delivery_items';

  static associations = {
    deliveries: { type: 'belongs_to' as const, key: 'delivery_id' },
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  };

  @text('delivery_id') deliveryId!: string;
  @text('address') address!: string;
  @text('stock_amount') stockAmount!: string; // e.g. "5 boxes of Rice"
  @text('status') status!: string; // pending, done
  @text('customer_id') customerId?: string;
  @text('notes') notes?: string;
  @field('qty') qty?: number;
  @field('weight') weight?: number;
  @field('total_price') totalPrice?: number;
  @text('customer_name') customerName?: string;
  @text('customer_phone') customerPhone?: string;
  @text('created_at') createdAt?: string;
  @text('updated_at') updatedAt?: string;
  @field('synced') synced!: number;

  @relation('deliveries', 'delivery_id') delivery!: Relation<Delivery>;
  @relation('customers', 'customer_id') customer!: Relation<Customer>;
}
