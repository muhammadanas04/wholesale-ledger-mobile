import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Product extends Model {
  static table = 'products';

  @text('name') name!: string;
  @text('unit') unit!: string; // e.g. kg, box, piece
  @field('current_stock') currentStock!: number;
  @field('reorder_level') reorderLevel!: number;
  @text('created_at') createdAt?: string;
  @text('updated_at') updatedAt?: string;
  @field('synced') synced!: number;
}
