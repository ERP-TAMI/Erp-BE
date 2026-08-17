import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('user_roles')
export class UserRole {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'uuid' })
  roleId: string;

  @Column({ type: 'timestamptz', name: 'assigned_at' })
  assignedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_by' })
  assignedBy: string;
}
