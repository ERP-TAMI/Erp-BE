import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ManagementDashboardController } from '../src/features/management-dashboard/management-dashboard.controller';
import { ManagementDashboardService } from '../src/features/management-dashboard/management-dashboard.service';

describe('Management dashboard API (e2e)', () => {
  const summary = {
    month: '2026-09',
    totalPurchaseOrders: 12,
    completedPurchaseOrders: 5,
    overduePurchaseOrders: 3,
    activeEmployees: 24,
  };
  const managementDashboardService = {
    getSummary: jest.fn(),
  };
  let currentPermissions: string[];
  let currentRoleCode: string;
  let authenticated: boolean;
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    currentPermissions = ['management.area.access'];
    currentRoleCode = 'SA';
    authenticated = true;
    const moduleRef = await Test.createTestingModule({
      controllers: [ManagementDashboardController],
      providers: [
        {
          provide: ManagementDashboardService,
          useValue: managementDashboardService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) {
            throw new UnauthorizedException();
          }
          context.switchToHttp().getRequest().user = {
            roleCode: currentRoleCode,
            permissions: currentPermissions,
          };
          return true;
        },
      })
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
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the management summary for SA with management access', async () => {
    managementDashboardService.getSummary.mockResolvedValue(summary);

    await request(app.getHttpServer())
      .get('/management/dashboard/summary?month=2026-09')
      .expect(200)
      .expect(summary);

    expect(managementDashboardService.getSummary).toHaveBeenCalledWith(
      '2026-09',
    );
  });

  it.each(['2026-9', '2026-13', '0000-01', 'not-a-month'])(
    'rejects invalid month %s',
    async (month) => {
      await request(app.getHttpServer())
        .get(`/management/dashboard/summary?month=${month}`)
        .expect(400);

      expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
    },
  );

  it('rejects unknown query fields', async () => {
    await request(app.getHttpServer())
      .get('/management/dashboard/summary?month=2026-09&ignored=true')
      .expect(400);
  });

  it('does not grant management access from the legacy director role name', async () => {
    currentRoleCode = 'DIRECTOR';
    currentPermissions = [];

    await request(app.getHttpServer())
      .get('/management/dashboard/summary?month=2026-09')
      .expect(403);

    expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    authenticated = false;

    await request(app.getHttpServer())
      .get('/management/dashboard/summary?month=2026-09')
      .expect(401);

    expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
  });
});
