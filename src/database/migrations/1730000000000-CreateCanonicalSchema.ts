import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const tables = [
  'audit_event_changes',
  'audit_events',
  'bill_of_material_lines',
  'bill_of_material_status_history',
  'bills_of_materials',
  'customers',
  'document_folders',
  'document_versions',
  'documents',
  'draft_bom_families',
  'draft_bom_lines',
  'draft_bom_versions',
  'folder_documents',
  'idempotency_keys',
  'material_groups',
  'material_sizes',
  'materials',
  'notification_catalog',
  'notification_catalog_roles',
  'notification_deliveries',
  'notification_preferences',
  'notifications',
  'outbox_events',
  'permissions',
  'product_color_card_versions',
  'product_color_cards',
  'production_document_images',
  'production_document_revisions',
  'production_document_sections',
  'production_document_size_rows',
  'production_documents',
  'production_plan_days',
  'production_plans',
  'purchase_order_documents',
  'purchase_order_product_color_sizes',
  'purchase_order_product_colors',
  'purchase_order_product_documents',
  'purchase_order_product_operation_steps',
  'purchase_order_product_sample_images',
  'purchase_order_product_sample_rounds',
  'purchase_order_product_status_history',
  'purchase_order_products',
  'purchase_order_status_history',
  'purchase_orders',
  'role_permissions',
  'roles',
  'size_chart_items',
  'size_charts',
  'stage_group_items',
  'stage_groups',
  'stages',
  'style_documents',
  'style_operation_steps',
  'style_sample_images',
  'style_sample_rounds',
  'styles',
  'units',
  'user_roles',
  'user_sessions',
  'users',
  'workshops',
];

const enumTypes = [
  'audit_event_type',
  'bom_status',
  'document_purpose',
  'notification_channel',
  'notification_delivery_status',
  'po_status',
  'production_doc_status',
  'product_status',
  'record_status',
  'sample_status',
  'style_status',
  'upload_status',
];

export class CreateCanonicalSchema1730000000000 implements MigrationInterface {
  name = 'CreateCanonicalSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schemaPath = resolve(
      process.cwd(),
      'db/database-schema-postgresql15.sql',
    );
    await queryRunner.query(readFileSync(schemaPath, 'utf8'));
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      DO $$
      DECLARE item record;
      BEGIN
        FOR item IN
          SELECT table_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'updated_at'
        LOOP
          EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || item.table_name || '_updated_at', item.table_name);
          EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()', 'trg_' || item.table_name || '_updated_at', item.table_name);
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS set_updated_at_timestamp()',
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS ${tables.map((table) => `"${table}"`).join(', ')} CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS ${enumTypes.map((type) => `"${type}"`).join(', ')} CASCADE`,
    );
  }
}
