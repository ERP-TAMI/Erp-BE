import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/User.entity';
import { QueryUsersDto } from './dto/query-users.dto';
import { UserAccountStatus } from './dto/user-account-status.enum';
import {
  UserListItemResponseDto,
  UserListResponseDto,
} from './dto/user-list-response.dto';

type UserListRawRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleCode: string | null;
  roleName: string | null;
  accountStatus: UserAccountStatus;
};

const DISPLAY_ROLE_JOIN = `role.id = (
  SELECT ur.role_id
  FROM user_roles ur
  JOIN roles selected_role ON selected_role.id = ur.role_id
  WHERE ur.user_id = "user"."id"
  ORDER BY selected_role.code ASC
  LIMIT 1
)`;

@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findAll(query: QueryUsersDto): Promise<UserListResponseDto> {
    const queryBuilder = this.users
      .createQueryBuilder('user')
      .leftJoin('roles', 'role', DISPLAY_ROLE_JOIN)
      .select([
        'user.id AS "id"',
        'user.fullName AS "fullName"',
        'user.email AS "email"',
        'user.phone AS "phone"',
        'role.code AS "roleCode"',
        'role.name AS "roleName"',
        `CASE
          WHEN user.status = 'inactive' THEN 'inactive'
          WHEN user.lockoutUntil > CURRENT_TIMESTAMP THEN 'locked'
          ELSE 'active'
        END AS "accountStatus"`,
      ]);

    if (query.search) {
      queryBuilder.andWhere(
        `(user.fullName ILIKE :search ESCAPE '\\'
          OR user.email ILIKE :search ESCAPE '\\'
          OR COALESCE(user.phone, '') ILIKE :search ESCAPE '\\')`,
        { search: `%${this.escapeLikePattern(query.search)}%` },
      );
    }

    if (query.role) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM user_roles filter_user_role
          JOIN roles filter_role ON filter_role.id = filter_user_role.role_id
          WHERE filter_user_role.user_id = user.id AND filter_role.code = :role
        )`,
        { role: query.role },
      );
    }

    this.applyStatusFilter(queryBuilder, query.status);

    const total = await queryBuilder.getCount();
    const rows = await queryBuilder
      .orderBy('user.fullName', 'ASC')
      .addOrderBy('user.email', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getRawMany<UserListRawRow>();

    return {
      data: rows.map((row) => this.toResponseItem(row)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  private applyStatusFilter(
    queryBuilder: ReturnType<Repository<User>['createQueryBuilder']>,
    status?: UserAccountStatus,
  ): void {
    if (status === UserAccountStatus.ACTIVE) {
      queryBuilder.andWhere(
        "user.status = 'active' AND (user.lockoutUntil IS NULL OR user.lockoutUntil <= CURRENT_TIMESTAMP)",
      );
    } else if (status === UserAccountStatus.LOCKED) {
      queryBuilder.andWhere(
        "user.status = 'active' AND user.lockoutUntil > CURRENT_TIMESTAMP",
      );
    } else if (status === UserAccountStatus.INACTIVE) {
      queryBuilder.andWhere("user.status = 'inactive'");
    }
  }

  private toResponseItem(row: UserListRawRow): UserListItemResponseDto {
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      role:
        row.roleCode && row.roleName
          ? { code: row.roleCode, name: row.roleName }
          : null,
      accountStatus: row.accountStatus,
    };
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
  }
}
