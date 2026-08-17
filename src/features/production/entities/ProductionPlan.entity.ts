import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('production_plans')
export class ProductionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @Column({ type: 'uuid', nullable: true, name: 'workshop_id' })
  workshopId: string;

  @Column({ type: 'smallint', name: 'plan_month' })
  planMonth: number;

  @Column({ type: 'smallint', name: 'plan_year' })
  planYear: number;

  @Column({ type: 'int', name: 'planned_quantity' })
  plannedQuantity: number;

  @Column({ type: 'date', nullable: true, name: 'start_date' })
  startDate: Date;

  @Column({ type: 'date', nullable: true, name: 'end_date' })
  endDate: Date;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
