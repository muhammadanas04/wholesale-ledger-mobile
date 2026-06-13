import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, relation, children } from '@nozbe/watermelondb/decorators';
import { Query } from '@nozbe/watermelondb';
import Driver from './Driver';
import DeliveryItem from './DeliveryItem';

export default class Delivery extends Model {
  static table = 'deliveries';

  static associations = {
    drivers: { type: 'belongs_to' as const, key: 'driver_id' },
    delivery_items: { type: 'has_many' as const, foreignKey: 'delivery_id' },
  };

  @text('driver_id') driverId!: string;
  @text('status') status!: string; // pending, in_progress, completed
  @text('notes') notes?: string;
  @text('created_at') createdAt!: string;
  @text('updated_at') updatedAt!: string;
  @field('synced') synced!: number;

  @relation('drivers', 'driver_id') driver!: Relation<Driver>;
  @children('delivery_items') items!: Query<DeliveryItem>;
}
