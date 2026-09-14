import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('user_roles')
export class UserRole {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'uuid', name: 'role_id' })
  roleId: string;

  @Column({ type: 'timestamptz', name: 'assigned_at' })
  assignedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_by' })
  assignedBy: string;
}
