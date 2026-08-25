import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeStageGroupItemsIndependent1740000000011 implements MigrationInterface {
  name = 'MakeStageGroupItemsIndependent1740000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stage_group_items
        DROP CONSTRAINT stage_group_items_stage_id_fkey,
        DROP CONSTRAINT stage_group_items_pkey;

      ALTER TABLE stage_group_items
        RENAME COLUMN stage_id TO legacy_source_stage_id;
      ALTER TABLE stage_group_items
        RENAME COLUMN name_snapshot TO item_name;
      ALTER TABLE stage_group_items
        RENAME COLUMN description_snapshot TO description;
      ALTER TABLE stage_group_items
        RENAME COLUMN ssv_snapshot TO ssv;

      ALTER TABLE stage_group_items
        ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
        ADD COLUMN status record_status;

      UPDATE stage_group_items item
      SET status = stage.status
      FROM stages stage
      WHERE stage.id = item.legacy_source_stage_id;

      ALTER TABLE stage_group_items
        ALTER COLUMN status SET DEFAULT 'active'::record_status,
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN legacy_source_stage_id DROP NOT NULL,
        ADD CONSTRAINT stage_group_items_pkey PRIMARY KEY (id);

      ALTER TABLE stage_group_items
        RENAME CONSTRAINT stage_group_items_ssv_snapshot_check
        TO stage_group_items_ssv_check;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM stage_group_items
          WHERE legacy_source_stage_id IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore Stage-linked group items after independent children were created';
        END IF;
      END $$;

      ALTER TABLE stage_group_items
        DROP CONSTRAINT stage_group_items_pkey;

      ALTER TABLE stage_group_items
        DROP COLUMN status,
        DROP COLUMN id;

      ALTER TABLE stage_group_items
        ALTER COLUMN legacy_source_stage_id SET NOT NULL;
      ALTER TABLE stage_group_items
        RENAME COLUMN legacy_source_stage_id TO stage_id;
      ALTER TABLE stage_group_items
        RENAME COLUMN item_name TO name_snapshot;
      ALTER TABLE stage_group_items
        RENAME COLUMN description TO description_snapshot;
      ALTER TABLE stage_group_items
        RENAME COLUMN ssv TO ssv_snapshot;

      ALTER TABLE stage_group_items
        RENAME CONSTRAINT stage_group_items_ssv_check
        TO stage_group_items_ssv_snapshot_check;

      ALTER TABLE stage_group_items
        ADD CONSTRAINT stage_group_items_pkey
          PRIMARY KEY (stage_group_id, stage_id),
        ADD CONSTRAINT stage_group_items_stage_id_fkey
          FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE RESTRICT;
    `);
  }
}
