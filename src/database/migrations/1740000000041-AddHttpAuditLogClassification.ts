import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  classifyHttpRequest,
  shouldSkipHttpAudit,
} from '../../features/audit/http-audit-classifier';

export class AddHttpAuditLogClassification1740000000041 implements MigrationInterface {
  name = 'AddHttpAuditLogClassification1740000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE http_audit_logs
        ADD COLUMN action varchar(40),
        ADD COLUMN resource_type varchar(40),
        ADD COLUMN resource_id varchar(64);
    `);
    await queryRunner.query(
      `CREATE INDEX ix_http_audit_action ON http_audit_logs(action, occurred_at DESC);`,
    );

    const rows: {
      id: string;
      method: string;
      path: string;
      status_code: number | null;
    }[] = await queryRunner.query(
      `SELECT id, method, path, status_code FROM http_audit_logs`,
    );

    for (const row of rows) {
      if (shouldSkipHttpAudit(row.method, row.path)) {
        await queryRunner.query(`DELETE FROM http_audit_logs WHERE id = $1`, [
          row.id,
        ]);
        continue;
      }
      const classified = classifyHttpRequest(
        row.method,
        row.path,
        row.status_code,
      );
      await queryRunner.query(
        `UPDATE http_audit_logs SET action = $1, resource_type = $2, resource_id = $3 WHERE id = $4`,
        [
          classified.action,
          classified.resource?.type ?? null,
          classified.resource?.id ?? null,
          row.id,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_http_audit_action;`);
    await queryRunner.query(`
      ALTER TABLE http_audit_logs
        DROP COLUMN IF EXISTS action,
        DROP COLUMN IF EXISTS resource_type,
        DROP COLUMN IF EXISTS resource_id;
    `);
  }
}
