import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHttpAuditLogs1740000000040 implements MigrationInterface {
  name = 'CreateHttpAuditLogs1740000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE http_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        occurred_at timestamptz NOT NULL DEFAULT now(),
        method varchar(10) NOT NULL,
        path varchar(1000) NOT NULL,
        status_code integer,
        duration_ms integer,
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        actor_identifier varchar(255),
        actor_role varchar(30),
        ip_address varchar(64),
        user_agent varchar(500),
        request_id varchar(100),
        query_params jsonb,
        request_body jsonb,
        error_message text
      );
    `);
    await queryRunner.query(
      `CREATE INDEX ix_http_audit_time ON http_audit_logs(occurred_at DESC, id DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_http_audit_actor ON http_audit_logs(actor_user_id, occurred_at DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS http_audit_logs;`);
  }
}
