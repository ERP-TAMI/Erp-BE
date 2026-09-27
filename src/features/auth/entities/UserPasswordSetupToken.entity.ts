import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PasswordSetupEmailStatus } from '../password-setup-email-status.enum';
import { PasswordTokenPurpose } from '../password-token-purpose.enum';

@Entity('user_password_setup_tokens')
export class UserPasswordSetupToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'char', length: 64, unique: true, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'used_at' })
  usedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: PasswordTokenPurpose.ACCOUNT_SETUP,
  })
  purpose: PasswordTokenPurpose;

  @Column({
    type: 'varchar',
    length: 16,
    name: 'delivery_status',
    default: PasswordSetupEmailStatus.PENDING,
  })
  deliveryStatus: PasswordSetupEmailStatus;

  @Column({
    type: 'timestamptz',
    nullable: true,
    name: 'delivery_attempted_at',
  })
  deliveryAttemptedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
