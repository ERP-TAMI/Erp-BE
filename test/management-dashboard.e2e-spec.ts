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
  const overview = {
    month: '2026-09',
    totalPurchaseOrders: 0,
    overduePurchaseOrders: 0,
    upcomingPurchaseOrders: 0,
    items: [],
    meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
  };
  const endpoints = [
    '/management/dashboard/summary?periodType=month&month=2026-09',
    '/management/dashboard/purchase-orders?month=2026-09',
  ];
  const managementDashboardService = {
    getSummary: jest.fn(),
    getPurchaseOrdersOverview: jest.fn(),
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
      .get('/management/dashboard/summary?periodType=month&month=2026-09')
      .expect(200)
      .expect(summary);

    expect(managementDashboardService.getSummary).toHaveBeenCalledWith({
      periodType: 'month',
      month: '2026-09',
    });
  });

  it('allows another role explicitly granted management access to read both endpoints', async () => {
    currentRoleCode = 'TPKH';
    managementDashboardService.getSummary.mockResolvedValue(summary);
    managementDashboardService.getPurchaseOrdersOverview.mockResolvedValue(
      overview,
    );

    await request(app.getHttpServer()).get(endpoints[0]).expect(200);
    await request(app.getHttpServer()).get(endpoints[1]).expect(200);

    expect(managementDashboardService.getSummary).toHaveBeenCalledTimes(1);
    expect(
      managementDashboardService.getPurchaseOrdersOverview,
    ).toHaveBeenCalledTimes(1);
  });

  it.each(['2026-9', '2026-13', '0000-01', 'not-a-month'])(
    'rejects invalid month %s',
    async (month) => {
      await request(app.getHttpServer())
        .get(`/management/dashboard/summary?periodType=month&month=${month}`)
        .expect(400);

      expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
    },
  );

  it('rejects an unsafe purchase-order page before invoking the service', async () => {
    await request(app.getHttpServer())
      .get(
        '/management/dashboard/purchase-orders?month=2026-09&page=1000000000000000000&limit=10',
      )
      .expect(400);

    expect(
      managementDashboardService.getPurchaseOrdersOverview,
    ).not.toHaveBeenCalled();
  });

  it('rejects unknown query fields', async () => {
    await request(app.getHttpServer())
      .get(
        '/management/dashboard/summary?periodType=month&month=2026-09&ignored=true',
      )
      .expect(400);
  });

  it.each(endpoints)(
    'does not grant access to a role without permission: %s',
    async (endpoint) => {
      currentRoleCode = 'NVKH';
      currentPermissions = [];

      await request(app.getHttpServer()).get(endpoint).expect(403);

      expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
      expect(
        managementDashboardService.getPurchaseOrdersOverview,
      ).not.toHaveBeenCalled();
    },
  );

  it('does not grant management access from the legacy director role name', async () => {
    currentRoleCode = 'DIRECTOR';
    currentPermissions = [];

    await request(app.getHttpServer())
      .get('/management/dashboard/summary?periodType=month&month=2026-09')
      .expect(403);

    expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
  });

  it.each(endpoints)(
    'rejects unauthenticated requests: %s',
    async (endpoint) => {
      authenticated = false;

      await request(app.getHttpServer()).get(endpoint).expect(401);

      expect(managementDashboardService.getSummary).not.toHaveBeenCalled();
      expect(
        managementDashboardService.getPurchaseOrdersOverview,
      ).not.toHaveBeenCalled();
    },
  );
});
