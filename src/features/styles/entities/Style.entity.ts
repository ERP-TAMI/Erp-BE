import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { StyleStatus } from '../../../common/enums/database.enums';

@Entity('styles')
@Index('ix_styles_lookup', ['status', 'category', 'createdAt', 'id'])
export class Style {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_styles_code', { unique: true })
  @Column({ type: 'varchar', length: 100, name: 'style_code', unique: true })
  styleCode: string;

  @Column({ type: 'varchar', length: 255, name: 'style_name' })
  styleName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({
    type: 'enum',
    enum: StyleStatus,
    enumName: 'style_status',
    default: StyleStatus.DRAFT,
  })
  status: StyleStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'base_image_version_id' })
  baseImageVersionId: string | null;

  @Column({ type: 'int', default: 30, name: 'as3b_cm_base_days' })
  as3bCmBaseDays: number;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'updated_by' })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
