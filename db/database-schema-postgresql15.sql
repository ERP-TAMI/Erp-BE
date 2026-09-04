-- ERP May Mac - full target schema Module 1-7 - PostgreSQL 15
-- Target terminology: Closed/Chốt. Legacy Final/PO_Final is migration-only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE record_status AS ENUM ('active','inactive');
CREATE TYPE po_status AS ENUM ('draft','pending_rd','in_progress','closed','cancelled');
CREATE TYPE product_status AS ENUM ('draft','in_review','sampling','closed','cancelled');
CREATE TYPE style_status AS ENUM ('draft','approved','active');
CREATE TYPE sample_status AS ENUM ('working','needs_revision','approved');
CREATE TYPE production_doc_status AS ENUM ('draft','in_progress','completed');
CREATE TYPE upload_status AS ENUM ('pending','ready','failed','quarantined');
CREATE TYPE document_purpose AS ENUM ('po_original','tech_pack','material_pdf','sample_image','translation','color_card','production_doc','avatar','other');
CREATE TYPE bom_status AS ENUM ('draft','wait_rd','wait_tpkh_confirm','wait_accounting','wait_sa_approve','closed');
CREATE TYPE notification_channel AS ENUM ('in_app','email');
CREATE TYPE notification_delivery_status AS ENUM ('pending','sent','failed','skipped');
CREATE TYPE audit_event_type AS ENUM ('created','updated','deleted','status_changed','approved','rejected','document_linked','document_unlinked','document_version_added','copied','synced','login','password_changed','role_changed');

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) NOT NULL,
 password_hash varchar(255) NOT NULL, full_name varchar(200) NOT NULL,
 phone varchar(20), avatar_url varchar(500), status record_status NOT NULL DEFAULT 'active',
 must_change_password boolean NOT NULL DEFAULT true, login_failed_count integer NOT NULL DEFAULT 0 CHECK (login_failed_count >= 0),
 lockout_until timestamptz, last_login_at timestamptz, row_version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_users_email UNIQUE (email)
);
CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(30) NOT NULL UNIQUE, name varchar(100) NOT NULL, description text, is_system boolean NOT NULL DEFAULT false);
CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(100) NOT NULL UNIQUE, description text NOT NULL);
CREATE TABLE user_roles (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT, assigned_at timestamptz NOT NULL DEFAULT now(), assigned_by uuid REFERENCES users(id) ON DELETE SET NULL, PRIMARY KEY(user_id,role_id));
CREATE TABLE role_permissions (role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY(role_id,permission_id));

CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_code varchar(50) NOT NULL UNIQUE,
 customer_name varchar(255) NOT NULL, status record_status NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE material_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(50) NOT NULL UNIQUE, name varchar(150) NOT NULL, status record_status NOT NULL DEFAULT 'active');
CREATE TABLE units (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(30) NOT NULL UNIQUE, name varchar(100) NOT NULL, decimal_scale smallint NOT NULL DEFAULT 4 CHECK(decimal_scale BETWEEN 0 AND 6), status record_status NOT NULL DEFAULT 'active');
CREATE TABLE materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), material_code varchar(100) NOT NULL UNIQUE, material_name varchar(255) NOT NULL, material_group_id uuid REFERENCES material_groups(id) ON DELETE RESTRICT, default_unit_id uuid REFERENCES units(id) ON DELETE RESTRICT, status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stage_code varchar(50) NOT NULL UNIQUE, stage_name varchar(255) NOT NULL, description text, default_ssv numeric(12,3) NOT NULL DEFAULT 0 CHECK(default_ssv>=0), status record_status NOT NULL DEFAULT 'active');

CREATE TABLE documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_code varchar(100), title varchar(500) NOT NULL,
 current_version_id uuid, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 CONSTRAINT uq_documents_code UNIQUE(document_code)
);
CREATE TABLE document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
 version_no integer NOT NULL CHECK(version_no>0), original_file_name varchar(500) NOT NULL,
 storage_key varchar(1000) NOT NULL UNIQUE, mime_type varchar(255) NOT NULL, byte_size bigint NOT NULL CHECK(byte_size>=0),
 sha256 char(64), status upload_status NOT NULL DEFAULT 'pending', change_reason text,
 uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL, uploaded_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_document_version UNIQUE(document_id,version_no), CONSTRAINT ck_sha256 CHECK(sha256 IS NULL OR sha256 ~ '^[0-9a-fA-F]{64}$')
);
ALTER TABLE documents ADD CONSTRAINT fk_document_current_version FOREIGN KEY(current_version_id) REFERENCES document_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE document_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES document_folders(id) ON DELETE RESTRICT, folder_name varchar(255) NOT NULL, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_folder_sibling UNIQUE NULLS NOT DISTINCT(parent_id,folder_name));
CREATE TABLE folder_documents (folder_id uuid NOT NULL REFERENCES document_folders(id) ON DELETE CASCADE, document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, linked_at timestamptz NOT NULL DEFAULT now(), linked_by uuid REFERENCES users(id) ON DELETE SET NULL, PRIMARY KEY(folder_id,document_id));

CREATE TABLE styles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), style_code varchar(100) NOT NULL UNIQUE,
 style_name varchar(255) NOT NULL, description text, category varchar(100), status style_status NOT NULL DEFAULT 'draft',
 base_image_version_id uuid REFERENCES document_versions(id) ON DELETE SET NULL, as3b_cm_base_days integer NOT NULL DEFAULT 30 CHECK(as3b_cm_base_days>0),
 row_version bigint NOT NULL DEFAULT 1, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE style_documents (style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE, document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, purpose document_purpose NOT NULL DEFAULT 'other', linked_by uuid REFERENCES users(id) ON DELETE SET NULL, linked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(style_id,document_id));
CREATE TABLE style_operation_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
 parent_step_id uuid REFERENCES style_operation_steps(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 stage_id uuid REFERENCES stages(id) ON DELETE RESTRICT, step_name varchar(255) NOT NULL, description text,
 time_per_piece numeric(12,3) NOT NULL DEFAULT 0 CHECK(time_per_piece>=0), ssv numeric(12,3) NOT NULL DEFAULT 0 CHECK(ssv>=0),
 target_total integer NOT NULL DEFAULT 0 CHECK(target_total>=0), note text, order_index integer NOT NULL CHECK(order_index>=0), is_group boolean NOT NULL DEFAULT false,
 CONSTRAINT uq_style_step_order UNIQUE(style_id,order_index)
);
CREATE TABLE style_sample_rounds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE, round_no integer NOT NULL CHECK(round_no>0), sample_date date, feedback text, status sample_status NOT NULL DEFAULT 'working', created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL, reviewed_at timestamptz, CONSTRAINT uq_style_sample_round UNIQUE(style_id,round_no));
CREATE TABLE style_sample_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sample_round_id uuid NOT NULL REFERENCES style_sample_rounds(id) ON DELETE CASCADE, document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT, color_name varchar(100), order_index integer NOT NULL DEFAULT 0 CHECK(order_index>=0));

CREATE TABLE draft_bom_families (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE, bom_code varchar(100) NOT NULL UNIQUE, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE draft_bom_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL REFERENCES draft_bom_families(id) ON DELETE CASCADE, parent_version_id uuid REFERENCES draft_bom_versions(id) ON DELETE RESTRICT, version_no integer NOT NULL CHECK(version_no>0), change_reason text, is_current boolean NOT NULL DEFAULT false, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_draft_bom_version UNIQUE(family_id,version_no));
CREATE UNIQUE INDEX uq_draft_bom_one_current ON draft_bom_versions(family_id) WHERE is_current;
CREATE TABLE draft_bom_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES draft_bom_versions(id) ON DELETE CASCADE, material_id uuid REFERENCES materials(id) ON DELETE RESTRICT, material_name_snapshot varchar(255) NOT NULL, material_group_id uuid REFERENCES material_groups(id) ON DELETE RESTRICT, unit_id uuid REFERENCES units(id) ON DELETE RESTRICT, consumption numeric(18,6) NOT NULL CHECK(consumption>=0), note text, order_index integer NOT NULL CHECK(order_index>=0), CONSTRAINT uq_draft_bom_line_order UNIQUE(version_id,order_index));

CREATE TABLE purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_code varchar(50) NOT NULL UNIQUE, customer_po_code varchar(100),
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, customer_name_snapshot varchar(255) NOT NULL,
 received_date date NOT NULL, note text, status po_status NOT NULL DEFAULT 'draft', cancellation_reason text,
 closed_at timestamptz, closed_by uuid REFERENCES users(id) ON DELETE SET NULL, row_version bigint NOT NULL DEFAULT 1,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 CONSTRAINT ck_po_terminal_data CHECK((status='closed' AND closed_at IS NOT NULL) OR status<>'closed'),
 CONSTRAINT ck_po_cancel_reason CHECK(status<>'cancelled' OR nullif(btrim(cancellation_reason),'') IS NOT NULL)
);
CREATE TABLE purchase_order_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT, old_status po_status, new_status po_status NOT NULL, action varchar(50) NOT NULL, reason text, changed_by uuid REFERENCES users(id) ON DELETE SET NULL, changed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE purchase_order_documents (purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, purpose document_purpose NOT NULL DEFAULT 'other', linked_by uuid REFERENCES users(id) ON DELETE SET NULL, linked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(purchase_order_id,document_id));

CREATE TABLE purchase_order_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
 source_style_id uuid REFERENCES styles(id) ON DELETE SET NULL, product_code varchar(100) NOT NULL, product_name varchar(255) NOT NULL,
 category varchar(100), material_note text, deadline date, structure_image_version_id uuid REFERENCES document_versions(id) ON DELETE SET NULL,
 status product_status NOT NULL DEFAULT 'draft', previous_status product_status, cancellation_reason text,
 closed_at timestamptz, closed_by uuid REFERENCES users(id) ON DELETE SET NULL, row_version bigint NOT NULL DEFAULT 1,
 as3b_cm_base_days integer NOT NULL DEFAULT 30 CHECK(as3b_cm_base_days>0), imported_at timestamptz, imported_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_po_product_code UNIQUE(purchase_order_id,product_code),
 CONSTRAINT ck_product_cancel_reason CHECK(status<>'cancelled' OR nullif(btrim(cancellation_reason),'') IS NOT NULL)
);
CREATE TABLE purchase_order_product_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE RESTRICT, old_status product_status, new_status product_status NOT NULL, action varchar(50) NOT NULL, reason text, changed_by uuid REFERENCES users(id) ON DELETE SET NULL, changed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE purchase_order_product_documents (product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE CASCADE, document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, source_po_document boolean NOT NULL DEFAULT false, purpose document_purpose NOT NULL DEFAULT 'other', linked_by uuid REFERENCES users(id) ON DELETE SET NULL, linked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(product_id,document_id));
CREATE TABLE purchase_order_product_colors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE CASCADE, color_name varchar(100) NOT NULL, color_code varchar(50), order_index integer NOT NULL DEFAULT 0 CHECK(order_index>=0), CONSTRAINT uq_product_color UNIQUE(product_id,color_name));
CREATE TABLE purchase_order_product_color_sizes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_color_id uuid NOT NULL REFERENCES purchase_order_product_colors(id) ON DELETE CASCADE, size_label varchar(30) NOT NULL, quantity integer NOT NULL CHECK(quantity>=0), order_index integer NOT NULL DEFAULT 0 CHECK(order_index>=0), CONSTRAINT uq_product_color_size UNIQUE(product_color_id,size_label));
CREATE TABLE purchase_order_product_operation_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE CASCADE, source_style_step_id uuid REFERENCES style_operation_steps(id) ON DELETE SET NULL, parent_step_id uuid REFERENCES purchase_order_product_operation_steps(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, stage_id uuid REFERENCES stages(id) ON DELETE RESTRICT, step_name varchar(255) NOT NULL, description text, time_per_piece numeric(12,3) NOT NULL DEFAULT 0 CHECK(time_per_piece>=0), ssv numeric(12,3) NOT NULL DEFAULT 0 CHECK(ssv>=0), target_total integer NOT NULL DEFAULT 0 CHECK(target_total>=0), note text, order_index integer NOT NULL CHECK(order_index>=0), is_group boolean NOT NULL DEFAULT false, CONSTRAINT uq_product_step_order UNIQUE(product_id,order_index));

CREATE TABLE purchase_order_product_sample_rounds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE CASCADE, source_style_sample_round_id uuid REFERENCES style_sample_rounds(id) ON DELETE SET NULL, round_no integer NOT NULL CHECK(round_no>0), sample_date date, feedback text, status sample_status NOT NULL DEFAULT 'working', row_version bigint NOT NULL DEFAULT 1, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL, reviewed_at timestamptz, CONSTRAINT uq_product_sample_round UNIQUE(product_id,round_no));
CREATE TABLE purchase_order_product_sample_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sample_round_id uuid NOT NULL REFERENCES purchase_order_product_sample_rounds(id) ON DELETE CASCADE, product_color_id uuid REFERENCES purchase_order_product_colors(id) ON DELETE RESTRICT, document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT, color_name_snapshot varchar(100), order_index integer NOT NULL DEFAULT 0 CHECK(order_index>=0));

CREATE TABLE product_color_cards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_color_id uuid NOT NULL UNIQUE REFERENCES purchase_order_product_colors(id) ON DELETE CASCADE, current_version_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE product_color_card_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), color_card_id uuid NOT NULL REFERENCES product_color_cards(id) ON DELETE CASCADE, version_no integer NOT NULL CHECK(version_no>0), document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT, replacement_reason text, uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL, uploaded_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_color_card_version UNIQUE(color_card_id,version_no));
ALTER TABLE product_color_cards ADD CONSTRAINT fk_color_card_current FOREIGN KEY(current_version_id) REFERENCES product_color_card_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE production_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), style_id uuid REFERENCES styles(id) ON DELETE CASCADE, product_id uuid REFERENCES purchase_order_products(id) ON DELETE CASCADE, name varchar(255) NOT NULL, description text, status production_doc_status NOT NULL DEFAULT 'draft', source_document_id uuid REFERENCES production_documents(id) ON DELETE SET NULL, row_version bigint NOT NULL DEFAULT 1, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT ck_prod_doc_owner CHECK(num_nonnulls(style_id,product_id)=1));
CREATE UNIQUE INDEX uq_style_prod_doc ON production_documents(style_id) WHERE style_id IS NOT NULL;
CREATE UNIQUE INDEX uq_product_prod_doc ON production_documents(product_id) WHERE product_id IS NOT NULL;
CREATE TABLE production_document_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_document_id uuid NOT NULL REFERENCES production_documents(id) ON DELETE CASCADE, section_code varchar(40) NOT NULL, title varchar(255) NOT NULL, content text, image_groups jsonb, order_index integer NOT NULL CHECK(order_index>=0), is_fixed boolean NOT NULL DEFAULT false, CONSTRAINT uq_prod_doc_section_order UNIQUE(production_document_id,order_index), CONSTRAINT uq_prod_doc_fixed_code UNIQUE(production_document_id,section_code));
CREATE TABLE production_document_size_rows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_document_id uuid NOT NULL REFERENCES production_documents(id) ON DELETE CASCADE, size_label varchar(30) NOT NULL, measurement_name varchar(255) NOT NULL, measurement_value varchar(100), tolerance varchar(100), order_index integer NOT NULL DEFAULT 0 CHECK(order_index>=0));
CREATE TABLE production_document_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid NOT NULL REFERENCES production_document_sections(id) ON DELETE CASCADE, group_heading varchar(255), heading_color varchar(30), document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT, group_order integer NOT NULL DEFAULT 0 CHECK(group_order>=0), image_order integer NOT NULL DEFAULT 0 CHECK(image_order>=0));
CREATE TABLE production_document_revisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_document_id uuid NOT NULL REFERENCES production_documents(id) ON DELETE RESTRICT, revision_no integer NOT NULL CHECK(revision_no>0), action varchar(30) NOT NULL, source_document_id uuid REFERENCES production_documents(id) ON DELETE SET NULL, reason text, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_prod_doc_revision UNIQUE(production_document_id,revision_no));

CREATE TABLE idempotency_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope varchar(100) NOT NULL, idempotency_key varchar(200) NOT NULL, request_hash char(64) NOT NULL, response_code integer, resource_id uuid, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_idempotency UNIQUE(scope,idempotency_key));


-- Module 4: extended master data
ALTER TABLE materials
 ADD COLUMN default_yield_pct numeric(7,4) NOT NULL DEFAULT 0 CHECK(default_yield_pct>=0),
 ADD COLUMN latest_unit_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK(latest_unit_cost>=0),
 ADD COLUMN low_stock_threshold numeric(18,4) NOT NULL DEFAULT 10 CHECK(low_stock_threshold>=0);

CREATE TABLE material_sizes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
 size_code varchar(20) NOT NULL, barcode varchar(50), unit_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 current_stock numeric(18,4) NOT NULL DEFAULT 0 CHECK(current_stock>=0),
 low_stock_threshold numeric(18,4) NOT NULL DEFAULT 10 CHECK(low_stock_threshold>=0),
 status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_material_size UNIQUE(material_id,size_code), CONSTRAINT uq_material_size_barcode UNIQUE(barcode)
);

CREATE TABLE stage_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_code varchar(50) NOT NULL UNIQUE, group_name varchar(255) NOT NULL,
 description text, status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stage_group_items (
 stage_group_id uuid NOT NULL REFERENCES stage_groups(id) ON DELETE CASCADE,
 stage_id uuid NOT NULL REFERENCES stages(id) ON DELETE RESTRICT, order_index integer NOT NULL CHECK(order_index>=0),
 name_snapshot varchar(255) NOT NULL, description_snapshot text, ssv_snapshot numeric(12,3) NOT NULL CHECK(ssv_snapshot>=0),
 PRIMARY KEY(stage_group_id,stage_id), CONSTRAINT uq_stage_group_order UNIQUE(stage_group_id,order_index)
);

CREATE TABLE workshops (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workshop_code varchar(50) NOT NULL UNIQUE, name varchar(255) NOT NULL,
 manager varchar(200), location varchar(255), daily_capacity integer NOT NULL DEFAULT 0 CHECK(daily_capacity>=0),
 status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE size_charts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL UNIQUE, status record_status NOT NULL DEFAULT 'active',
 revision_no integer NOT NULL DEFAULT 1 CHECK(revision_no>0), supersedes_id uuid REFERENCES size_charts(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE size_chart_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), size_chart_id uuid NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
 size_label varchar(30) NOT NULL, order_index integer NOT NULL CHECK(order_index>=0),
 CONSTRAINT uq_size_chart_label UNIQUE(size_chart_id,size_label), CONSTRAINT uq_size_chart_order UNIQUE(size_chart_id,order_index)
);

-- Module 3: official BOM, one BOM per product color through its whole lifecycle
CREATE TABLE bills_of_materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bom_code varchar(100) NOT NULL UNIQUE,
 product_color_id uuid NOT NULL UNIQUE REFERENCES purchase_order_product_colors(id) ON DELETE RESTRICT,
 product_code_snapshot varchar(100) NOT NULL, product_name_snapshot varchar(255) NOT NULL,
 color_name_snapshot varchar(100) NOT NULL, po_code_snapshot varchar(50) NOT NULL, order_quantity_snapshot integer NOT NULL CHECK(order_quantity_snapshot>0),
 deadline timestamptz, status bom_status NOT NULL DEFAULT 'draft', rd_note text,
 approved_by uuid REFERENCES users(id) ON DELETE SET NULL, approved_at timestamptz,
 row_version bigint NOT NULL DEFAULT 1, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_bom_approval CHECK((status='closed' AND approved_at IS NOT NULL) OR status<>'closed')
);
CREATE TABLE bill_of_material_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bill_of_material_id uuid NOT NULL REFERENCES bills_of_materials(id) ON DELETE CASCADE,
 material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
 material_name_snapshot varchar(255) NOT NULL, material_group_snapshot varchar(100), unit_snapshot varchar(50) NOT NULL,
 consumption_per_unit numeric(18,6) CHECK(consumption_per_unit>0), unit_cost numeric(18,2) CHECK(unit_cost>0),
 order_index integer NOT NULL CHECK(order_index>=0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_bom_material UNIQUE(bill_of_material_id,material_id), CONSTRAINT uq_bom_line_order UNIQUE(bill_of_material_id,order_index)
);
CREATE TABLE bill_of_material_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bill_of_material_id uuid NOT NULL REFERENCES bills_of_materials(id) ON DELETE RESTRICT,
 old_status bom_status, new_status bom_status NOT NULL, action varchar(50) NOT NULL, reason text,
 changed_by uuid REFERENCES users(id) ON DELETE SET NULL, changed_at timestamptz NOT NULL DEFAULT now()
);

-- Module 5 dependency: production progress used by Dashboard (feature itself is outside current build scope)
CREATE TABLE production_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE RESTRICT,
 workshop_id uuid REFERENCES workshops(id) ON DELETE RESTRICT, plan_month smallint NOT NULL CHECK(plan_month BETWEEN 1 AND 12),
 plan_year smallint NOT NULL CHECK(plan_year BETWEEN 2000 AND 2200), planned_quantity integer NOT NULL CHECK(planned_quantity>=0),
 start_date date, end_date date, note text, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_product_plan_period UNIQUE(product_id,workshop_id,plan_year,plan_month), CONSTRAINT ck_plan_dates CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date)
);
CREATE TABLE production_plan_days (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_plan_id uuid NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
 plan_date date NOT NULL, planned_quantity integer NOT NULL DEFAULT 0 CHECK(planned_quantity>=0),
 actual_quantity integer NOT NULL DEFAULT 0 CHECK(actual_quantity>=0), is_manual_override boolean NOT NULL DEFAULT false,
 CONSTRAINT uq_production_plan_day UNIQUE(production_plan_id,plan_date)
);

-- Module 6: sessions and notification preferences/inbox/delivery
CREATE TABLE user_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 refresh_token_hash char(64) NOT NULL UNIQUE, user_agent varchar(500), ip_address inet,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, revoke_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_code varchar(100) NOT NULL UNIQUE, event_group varchar(50) NOT NULL,
 display_name varchar(255) NOT NULL, default_in_app boolean NOT NULL DEFAULT true, default_email boolean NOT NULL DEFAULT false,
 is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE notification_catalog_roles (
 notification_catalog_id uuid NOT NULL REFERENCES notification_catalog(id) ON DELETE CASCADE,
 role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, PRIMARY KEY(notification_catalog_id,role_id)
);
CREATE TABLE notification_preferences (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 notification_catalog_id uuid NOT NULL REFERENCES notification_catalog(id) ON DELETE CASCADE,
 in_app_enabled boolean NOT NULL, email_enabled boolean NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,notification_catalog_id)
);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 notification_catalog_id uuid NOT NULL REFERENCES notification_catalog(id) ON DELETE RESTRICT,
 title varchar(255) NOT NULL, body text NOT NULL, entity_type varchar(80), entity_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 channel notification_channel NOT NULL, status notification_delivery_status NOT NULL DEFAULT 'pending',
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0), last_error text, next_attempt_at timestamptz,
 sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_notification_channel UNIQUE(notification_id,channel)
);
CREATE TABLE outbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type varchar(80) NOT NULL, aggregate_id uuid NOT NULL,
 event_type varchar(100) NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0), last_error text
);

CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), occurred_at timestamptz NOT NULL DEFAULT now(), actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL, actor_identifier varchar(255), aggregate_type varchar(80) NOT NULL, aggregate_id uuid NOT NULL, parent_id uuid, event_type audit_event_type NOT NULL, actor_role varchar(30), target_label varchar(500), reason text, correlation_id uuid, request_id varchar(100), CONSTRAINT ck_audit_reason CHECK(event_type NOT IN ('updated','deleted','status_changed','approved','rejected','role_changed') OR nullif(btrim(reason),'') IS NOT NULL));
CREATE TABLE audit_event_changes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, audit_event_id uuid NOT NULL REFERENCES audit_events(id) ON DELETE CASCADE, field_name varchar(150) NOT NULL, old_value jsonb, new_value jsonb);

CREATE INDEX ix_po_list ON purchase_orders(status,created_at DESC,id DESC) WHERE archived_at IS NULL;
CREATE INDEX ix_po_customer_date ON purchase_orders(customer_id,received_date DESC,id DESC) WHERE archived_at IS NULL;
CREATE INDEX ix_product_po_status ON purchase_order_products(purchase_order_id,status,created_at DESC,id DESC);
CREATE INDEX ix_doc_version_latest ON document_versions(document_id,version_no DESC);
CREATE INDEX ix_style_docs_document ON style_documents(document_id);
CREATE INDEX ix_po_docs_document ON purchase_order_documents(document_id);
CREATE INDEX ix_product_docs_document ON purchase_order_product_documents(document_id);
CREATE INDEX ix_style_steps_export ON style_operation_steps(style_id,order_index);
CREATE INDEX ix_product_steps_export ON purchase_order_product_operation_steps(product_id,order_index);
CREATE INDEX ix_style_sample_history ON style_sample_rounds(style_id,round_no DESC);
CREATE INDEX ix_product_sample_history ON purchase_order_product_sample_rounds(product_id,round_no DESC);
CREATE INDEX ix_po_status_history ON purchase_order_status_history(purchase_order_id,changed_at DESC,id DESC);
CREATE INDEX ix_product_status_history ON purchase_order_product_status_history(product_id,changed_at DESC,id DESC);
CREATE INDEX ix_audit_aggregate ON audit_events(aggregate_type,aggregate_id,occurred_at DESC,id DESC);
CREATE INDEX ix_audit_time ON audit_events(occurred_at DESC,id DESC);
CREATE INDEX ix_idempotency_expiry ON idempotency_keys(expires_at);

-- Fixed production-document sections are inserted by the create-document transaction:
-- DESCRIPTION, ACCESSORIES, NOTES, CUSTOMER_COMMENTS. Application prevents deletion/renaming.
-- State-transition readiness (approved sample, all children terminal) requires locked aggregate queries;
-- implement in service transaction or SECURITY DEFINER functions, not mutable CHECK constraints.


CREATE UNIQUE INDEX uq_user_single_role ON user_roles(user_id);
CREATE INDEX ix_material_active_lookup ON materials(status,material_name,id);
CREATE INDEX ix_material_size_lookup ON material_sizes(material_id,status,size_code);
CREATE INDEX ix_stage_active_lookup ON stages(status,stage_name,id);
CREATE INDEX ix_workshop_active_lookup ON workshops(status,name,id);
CREATE INDEX ix_bom_pipeline ON bills_of_materials(status,deadline,id);
CREATE INDEX ix_bom_product_color ON bills_of_materials(product_color_id);
CREATE INDEX ix_bom_status_history ON bill_of_material_status_history(bill_of_material_id,changed_at DESC,id DESC);
CREATE INDEX ix_plan_period ON production_plans(plan_year,plan_month,workshop_id,id);
CREATE INDEX ix_plan_day_date ON production_plan_days(plan_date,production_plan_id);
CREATE INDEX ix_active_sessions ON user_sessions(user_id,expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX ix_notification_inbox ON notifications(recipient_user_id,created_at DESC,id DESC);
CREATE INDEX ix_notification_unread ON notifications(recipient_user_id,created_at DESC,id DESC) WHERE read_at IS NULL;
CREATE INDEX ix_delivery_queue ON notification_deliveries(status,next_attempt_at,id) WHERE status IN ('pending','failed');
CREATE INDEX ix_outbox_unpublished ON outbox_events(occurred_at,id) WHERE published_at IS NULL;
