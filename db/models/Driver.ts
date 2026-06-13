import { Model } from '@nozbe/watermelondb';
import { field, text, children } from '@nozbe/watermelondb/decorators';
import { Query } from '@nozbe/watermelondb';
import Delivery from './Delivery';

export default class Driver extends Model {
  static table = 'drivers';

  static associations = {
    deliveries: { type: 'has_many' as const, foreignKey: 'driver_id' },
  };

  @text('phone') phone!: string;
  @text('name') name?: string;
  @text('otp') otp?: string;
  @field('otp_used') otpUsed!: number; // 0 = false, 1 = true
  @field('active') active!: number; // 0 = inactive, 1 = active
  @text('created_at') createdAt!: string;
  @text('updated_at') updatedAt!: string;
  @field('synced') synced!: number;

  @children('deliveries') deliveries!: Query<Delivery>;
}
