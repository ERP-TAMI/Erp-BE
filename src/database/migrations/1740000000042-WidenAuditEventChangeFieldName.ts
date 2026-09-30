import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lần lưu hàng loạt công đoạn ghi field_name dạng "<tên công đoạn>::<field>".
 * step_name cho tới 255 ký tự nhưng field_name chỉ 150 → tên dài làm insert
 * audit lỗi và rollback luôn cả lần lưu bảng công đoạn. 300 đủ cho 255 + "::"
 * + tên field.
 */
export class WidenAuditEventChangeFieldName1740000000042 implements MigrationInterface {
  name = 'WidenAuditEventChangeFieldName1740000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_event_changes ALTER COLUMN field_name TYPE varchar(300);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_event_changes ALTER COLUMN field_name TYPE varchar(150) USING left(field_name, 150);`,
    );
  }
}
