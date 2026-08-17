import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('product_color_cards')
export class ProductColorCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_color_id' })
  productColorId: string;

  @Column({ type: 'uuid', nullable: true, name: 'current_version_id' })
  currentVersionId: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
