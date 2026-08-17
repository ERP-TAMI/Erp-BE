import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BomStatus } from '../../../common/enums/database.enums';

@Entity('bills_of_materials')
export class BillOfMaterials {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'bom_code' })
  bomCode: string;

  @Column({ type: 'uuid', name: 'product_color_id' })
  productColorId: string;

  @Column({ type: 'varchar', length: 100, name: 'product_code_snapshot' })
  productCodeSnapshot: string;

  @Column({ type: 'varchar', length: 255, name: 'product_name_snapshot' })
  productNameSnapshot: string;

  @Column({ type: 'varchar', length: 100, name: 'color_name_snapshot' })
  colorNameSnapshot: string;

  @Column({ type: 'varchar', length: 50, name: 'po_code_snapshot' })
  poCodeSnapshot: string;

  @Column({ type: 'int', name: 'order_quantity_snapshot' })
  orderQuantitySnapshot: number;

  @Column({ type: 'timestamptz', nullable: true })
  deadline: Date;

  @Column({ type: 'enum', enum: BomStatus, enumName: 'bom_status' })
  status: BomStatus;

  @Column({ type: 'text', nullable: true, name: 'rd_note' })
  rdNote: string;

  @Column({ type: 'uuid', nullable: true, name: 'approved_by' })
  approvedBy: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt: Date;

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
