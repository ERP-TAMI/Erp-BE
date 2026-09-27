import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { DataSource, In } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RecordStatus } from '../src/common/enums/database.enums';
import {
  hashPassword,
  verifyPassword,
} from '../src/common/security/password.util';
import { User } from '../src/features/auth/entities/User.entity';
import { UserPasswordSetupToken } from '../src/features/auth/entities/UserPasswordSetupToken.entity';
import { UserSession } from '../src/features/auth/entities/UserSession.entity';
import { Role } from '../src/features/auth/entities/Role.entity';
import { UserRole } from '../src/features/auth/entities/UserRole.entity';
import { SmtpMailService } from '../src/features/auth/smtp-mail.service';
import { Notification } from '../src/features/notifications/entities/Notification.entity';
import { NotificationDeliverie } from '../src/features/notifications/entities/NotificationDeliverie.entity';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Auth database API (e2e)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdUserIds: string[] = [];
  const mail = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendTemporaryAccountLockEmail: jest.fn().mockResolvedValue(undefined),
  };
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SmtpMailService)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  }, 30_000);

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      const notifications = await dataSource.getRepository(Notification).find({
        where: { recipientUserId: In(createdUserIds) },
        select: { id: true },
      });
      const notificationIds = notifications.map(({ id }) => id);
      if (notificationIds.length > 0) {
        await dataSource
          .getRepository(NotificationDeliverie)
          .delete({ notificationId: In(notificationIds) });
        await dataSource
          .getRepository(Notification)
          .delete({ id: In(notificationIds) });
      }
      await dataSource
        .getRepository(UserSession)
        .delete({ userId: In(createdUserIds) });
      await dataSource
        .getRepository(UserPasswordSetupToken)
        .delete({ userId: In(createdUserIds) });
      await dataSource
        .getRepository(UserRole)
        .delete({ userId: In(createdUserIds) });
      await dataSource.getRepository(User).delete({ id: In(createdUserIds) });
    }
    await app.close();
  });

  async function createActiveUser(label: string, password: string) {
    const now = new Date();
    const user = await dataSource.getRepository(User).save({
      email: `${label}-${suffix}@tami.test`,
      passwordHash: await hashPassword(password),
      fullName: `Auth E2E ${label}`,
      phone: null,
      avatarUrl: null,
      status: RecordStatus.ACTIVE,
      mustChangePassword: false,
      loginFailedCount: 0,
      lockoutUntil: null,
      manuallyLockedAt: null,
      manuallyLockedBy: null,
      authVersion: 1,
      lastLoginAt: null,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function assignRole(userId: string, roleCode: string) {
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ code: roleCode });
    await dataSource.getRepository(UserRole).save({
      userId,
      roleId: role.id,
      assignedAt: new Date(),
    });
  }

  it('updates the current profile and changes password without ending the current session', async () => {
    const oldPassword = 'current password';
    const newPassword = 'updated password';
    const user = await createActiveUser('profile', oldPassword);
    await assignRole(user.id, 'NVKH');

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: oldPassword })
      .expect(200);
    const accessToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: '  Hồ sơ đã cập nhật  ', phone: ' 0905 123 456 ' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          email: user.email,
          fullName: 'Hồ sơ đã cập nhật',
          phone: '0905 123 456',
          roleCode: 'NVKH',
        });
      });

    await request(app.getHttpServer())
      .patch('/auth/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'wrong password', newPassword })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('CURRENT_PASSWORD_INCORRECT');
      });

    await request(app.getHttpServer())
      .patch('/auth/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: oldPassword, newPassword })
      .expect(204);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: oldPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: newPassword })
      .expect(200);

    const updatedUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    expect(updatedUser.authVersion).toBe(1);
  });

  it('allows only one concurrent reset completion and revokes existing sessions', async () => {
    const oldPassword = 'old password';
    const newPassword = 'new password';
    const user = await createActiveUser('reset', oldPassword);
    const now = new Date();
    const session = await dataSource.getRepository(UserSession).save({
      userId: user.id,
      refreshTokenHash: createHash('sha256')
        .update(`session-${suffix}`)
        .digest('hex'),
      userAgent: 'auth-e2e',
      ipAddress: '127.0.0.1',
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      revokeReason: null,
      createdAt: now,
    });

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: user.email })
      .expect(202);

    expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const token = mail.sendPasswordResetEmail.mock.calls[0][0].token as string;
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/password-reset/complete')
        .send({ token, password: newPassword }),
      request(app.getHttpServer())
        .post('/auth/password-reset/complete')
        .send({ token, password: newPassword }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([204, 410]);
    const updatedUser = await dataSource.getRepository(User).findOneByOrFail({
      id: user.id,
    });
    expect(updatedUser.authVersion).toBe(2);
    await expect(
      verifyPassword(newPassword, updatedUser.passwordHash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(oldPassword, updatedUser.passwordHash),
    ).resolves.toBe(false);
    await expect(
      dataSource.getRepository(UserSession).findOneByOrFail({ id: session.id }),
    ).resolves.toMatchObject({
      revokedAt: expect.any(Date),
      revokeReason: 'password_reset',
    });
  });

  it('counts concurrent failures exactly and sends one temporary-lock email', async () => {
    const user = await createActiveUser('lockout', 'correct password');

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: user.email, password: 'wrong password' }),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([
      401, 401, 401, 401, 403,
    ]);
    const lockedUser = await dataSource.getRepository(User).findOneByOrFail({
      id: user.id,
    });
    expect(lockedUser.loginFailedCount).toBe(5);
    expect(lockedUser.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(mail.sendTemporaryAccountLockEmail).toHaveBeenCalledTimes(1);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong password' })
      .expect(403);
    expect(mail.sendTemporaryAccountLockEmail).toHaveBeenCalledTimes(1);

    await expect(
      dataSource.getRepository(Notification).countBy({
        recipientUserId: user.id,
        entityType: 'user',
      }),
    ).resolves.toBe(1);
  });
});
