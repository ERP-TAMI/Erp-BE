import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectPlanningRoleNames1740000000020 implements MigrationInterface {
  name = 'CorrectPlanningRoleNames1740000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE roles
      SET name = 'Trưởng phòng Kế hoạch',
          description = 'Quản lý dữ liệu và nghiệp vụ kế hoạch'
      WHERE code = 'TPKH'
    `);
    await queryRunner.query(`
      UPDATE roles
      SET name = 'Nhân viên Kế hoạch',
          description = 'Thực hiện nghiệp vụ kế hoạch hàng ngày'
      WHERE code = 'NVKH'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE roles
      SET name = 'Trưởng phòng Kinh doanh',
          description = 'Quản lý dữ liệu và nghiệp vụ kinh doanh'
      WHERE code = 'TPKH'
    `);
    await queryRunner.query(`
      UPDATE roles
      SET name = 'Nhân viên Kinh doanh',
          description = 'Thực hiện nghiệp vụ kinh doanh hàng ngày'
      WHERE code = 'NVKH'
    `);
  }
}
