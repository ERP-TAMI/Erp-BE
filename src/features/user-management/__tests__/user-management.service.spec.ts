import { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../../auth/entities/User.entity';
import { UserManagementService } from '../user-management.service';
import { UserAccountStatus } from '../dto/user-account-status.enum';
import { UserRoleCode } from '../dto/query-users.dto';

describe('UserManagementService', () => {
  let users: jest.Mocked<Repository<User>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<User>>;
  let service: UserManagementService;

  beforeEach(() => {
    queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115',
          fullName: 'Nhân viên IT',
          email: 'it@tami.test',
          phone: '0901234567',
          roleCode: 'IT',
          roleName: 'Công nghệ thông tin',
          accountStatus: UserAccountStatus.ACTIVE,
        },
      ]),
    } as unknown as jest.Mocked<SelectQueryBuilder<User>>;
    users = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as jest.Mocked<Repository<User>>;
    service = new UserManagementService(users);
  });

  it('returns an allowlisted, paginated user response', async () => {
    await expect(service.findAll({ page: 1, limit: 10 })).resolves.toEqual({
      data: [
        {
          id: '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115',
          fullName: 'Nhân viên IT',
          email: 'it@tami.test',
          phone: '0901234567',
          role: { code: 'IT', name: 'Công nghệ thông tin' },
          accountStatus: UserAccountStatus.ACTIVE,
        },
      ],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });

    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('user.fullName', 'ASC');
  });

  it('escapes SQL wildcard characters in a case-insensitive text search', async () => {
    await service.findAll({ search: '100%_admin\\', page: 1, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE :search ESCAPE '\\'"),
      { search: '%100\\%\\_admin\\\\%' },
    );
  });

  it('filters role without multiplying user rows', async () => {
    await service.findAll({ role: UserRoleCode.IT, page: 1, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('EXISTS'),
      { role: 'IT' },
    );
  });

  it.each([
    [UserAccountStatus.ACTIVE, "user.status = 'active'", 'lockoutUntil'],
    [UserAccountStatus.LOCKED, "user.status = 'active'", 'lockoutUntil'],
    [UserAccountStatus.INACTIVE, "user.status = 'inactive'", undefined],
  ])(
    'filters the derived %s account status',
    async (status, statusClause, lockClause) => {
      await service.findAll({ status, page: 1, limit: 10 });

      const matchingCalls = queryBuilder.andWhere.mock.calls.filter(([sql]) =>
        String(sql).includes(statusClause),
      );
      expect(matchingCalls.length).toBeGreaterThan(0);
      if (lockClause) {
        expect(
          matchingCalls.some(([sql]) => String(sql).includes(lockClause)),
        ).toBe(true);
      }
    },
  );

  it('keeps pagination metadata valid for an empty result', async () => {
    queryBuilder.getCount.mockResolvedValue(0);
    queryBuilder.getRawMany.mockResolvedValue([]);

    await expect(service.findAll({ page: 4, limit: 20 })).resolves.toEqual({
      data: [],
      meta: { total: 0, page: 4, limit: 20, totalPages: 1 },
    });
  });
});
