import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { StyleStatus } from '../../../common/enums/database.enums';

@Entity('styles')
export class Style {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'style_code' })
  styleCode: string;

  @Column({ type: 'varchar', length: 255, name: 'style_name' })
  styleName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  @Column({ type: 'enum', enum: StyleStatus, enumName: 'style_status' })
  status: StyleStatus;

  @Column({ type: 'uuid', nullable: true, name: 'base_image_version_id' })
  baseImageVersionId: string;

  @Column({ type: 'int', default: 30, name: 'as3b_cm_base_days' })
  as3bCmBaseDays: number;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'updated_by' })
  updatedBy: string;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
