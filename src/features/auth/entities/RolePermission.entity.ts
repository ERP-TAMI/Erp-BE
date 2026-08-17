import { Entity, PrimaryColumn } from 'typeorm';

@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ type: 'uuid' })
  roleId: string;

  @PrimaryColumn({ type: 'uuid' })
  permissionId: string;
}
