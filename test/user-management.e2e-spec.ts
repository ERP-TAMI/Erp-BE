import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { UserManagementController } from '../src/features/user-management/user-management.controller';
import { UserManagementService } from '../src/features/user-management/user-management.service';
import { UserAccountStatus } from '../src/features/user-management/dto/user-account-status.enum';

describe('User management API (e2e)', () => {
  const response = {
    data: [
      {
        id: '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115',
        fullName: 'Nhân viên IT',
        email: 'it@tami.test',
        phone: null,
        role: { code: 'IT', name: 'Công nghệ thông tin' },
        accountStatus: UserAccountStatus.ACTIVE,
      },
    ],
    meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
  };
  const userManagementService = { findAll: jest.fn() };
  let currentPermissions: string[];
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    currentPermissions = ['system.users.manage'];
    const moduleRef = await Test.createTestingModule({
      controllers: [UserManagementController],
      providers: [
        { provide: UserManagementService, useValue: userManagementService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            permissions: currentPermissions,
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it('lists users with normalized search, filters and pagination', async () => {
    userManagementService.findAll.mockResolvedValue(response);

    await request(app.getHttpServer())
      .get(
        '/system/users?search=%20Nhan%20vien%20&role=IT&status=active&page=2&limit=20',
      )
      .expect(200)
      .expect(response);

    expect(userManagementService.findAll).toHaveBeenCalledWith({
      search: 'Nhan vien',
      role: 'IT',
      status: UserAccountStatus.ACTIVE,
      page: 2,
      limit: 20,
    });
  });

  it.each([
    '/system/users?role=DIRECTOR',
    '/system/users?status=disabled',
    '/system/users?page=0',
    '/system/users?limit=101',
    `/system/users?search=${'a'.repeat(256)}`,
    '/system/users?ignored=true',
  ])('rejects invalid query %s before it reaches the service', async (url) => {
    await request(app.getHttpServer()).get(url).expect(400);
    expect(userManagementService.findAll).not.toHaveBeenCalled();
  });

  it('forbids access without system.users.manage', async () => {
    currentPermissions = [];

    await request(app.getHttpServer()).get('/system/users').expect(403);
    expect(userManagementService.findAll).not.toHaveBeenCalled();
  });
});
