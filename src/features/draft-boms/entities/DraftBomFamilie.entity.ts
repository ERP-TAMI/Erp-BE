import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('draft_bom_families')
export class DraftBomFamilie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'style_id' })
  styleId: string;

  @Column({ type: 'varchar', length: 100, name: 'bom_code' })
  bomCode: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
