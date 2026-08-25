import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterStyleBaseImageVersionIdToVarchar1740000000012 implements MigrationInterface {
  name = 'AlterStyleBaseImageVersionIdToVarchar1740000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "styles" DROP CONSTRAINT IF EXISTS "styles_base_image_version_id_fkey";
      ALTER TABLE "styles" ALTER COLUMN "base_image_version_id" TYPE varchar(500) USING base_image_version_id::varchar;
    `);
  }

  // CẢNH BÁO: down() sẽ lỗi nếu đã có row lưu giá trị không phải UUID thật (vd. URL upload
  // local dạng "/uploads/img-xxx.png") — chính là mục đích của migration này (cho phép
  // base_image_version_id lưu URL thay vì chỉ UUID tham chiếu document_versions). Không revert
  // migration này trên môi trường đã có dữ liệu URL thật mà không dọn/backfill dữ liệu trước.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "styles" ALTER COLUMN "base_image_version_id" TYPE uuid USING base_image_version_id::uuid;
    `);
  }
}
