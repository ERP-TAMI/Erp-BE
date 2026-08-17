import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  scope: string;

  @Column({ type: 'varchar', length: 200, name: 'idempotency_key' })
  idempotencyKey: string;

  @Column({ type: 'char', length: 64, name: 'request_hash' })
  requestHash: string;

  @Column({ type: 'int', nullable: true, name: 'response_code' })
  responseCode: number;

  @Column({ type: 'uuid', nullable: true, name: 'resource_id' })
  resourceId: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
