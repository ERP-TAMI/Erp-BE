import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('production_plan_days')
export class ProductionPlanDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'production_plan_id' })
  productionPlanId: string;

  @Column({ type: 'date', name: 'plan_date' })
  planDate: Date;

  @Column({ type: 'int', default: 0, name: 'planned_quantity' })
  plannedQuantity: number;

  @Column({ type: 'int', default: 0, name: 'actual_quantity' })
  actualQuantity: number;

  @Column({ type: 'boolean', default: false, name: 'is_manual_override' })
  isManualOverride: boolean;
}
