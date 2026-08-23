import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'char', length: 64, name: 'refresh_token_hash' })
  refreshTokenHash: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  userAgent: string | null;

  @Column({ type: 'inet', nullable: true, name: 'ip_address' })
  ipAddress: string | null;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'revoke_reason' })
  revokeReason: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
