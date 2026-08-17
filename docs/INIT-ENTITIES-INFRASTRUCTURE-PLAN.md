# INIT ENTITIES + INFRASTRUCTURE

## Scope

Implement entity, feature skeleton, logger, TypeORM migrations and tests from `db/database-schema-postgresql15.sql`.

- SQL schema is the source of truth; keep canonical table names.
- `styles` is mẫu fit; `purchase_order_products` is sản phẩm trong PO.
- `purchase_order_products.source_style_id -> styles.id`.
- Official BOM belongs to `purchase_order_product_colors`.
- `user_roles` intentionally enforces one role per user with `uq_user_single_role`.
- `updated_at` is maintained automatically by PostgreSQL update triggers.
- Do not use `synchronize: true`.
- Keep `1720000000000-InitialMigration` unchanged.
- DTO, validation and business APIs are deferred; create only compile-safe feature skeletons.

## Task 1 — Feature structure

Create:

```text
src/features/{auth,master-data,documents,styles,draft-boms,purchase-orders,boms,production,notifications,audit,platform}/
src/database/{entities,migrations,data-source.ts,typeorm.config.ts}
src/infrastructure/logger/
```

Each feature contains:

```text
<feature>.module.ts
<feature>.controller.ts
<feature>.service.ts
entities/
dto/          # empty for now
__tests__/
```

Services/controllers are compile-safe skeletons only.

## Task 2 — Explicit entity mapping

Do not create `BaseEntity`, `BaseIdEntity` or `BaseJunctionEntity`. Declare columns explicitly in each entity.

- UUID keys use `@PrimaryGeneratedColumn('uuid')`.
- Timestamp decorators are used only where SQL has timestamp columns.
- Composite-key tables keep their composite key and do not get a synthetic `id`.
- Map camelCase properties to snake_case columns with `name`.
- Preserve nullable, default, unique, check, precision/scale and delete behavior.
- Numeric fields use the SQL precision/scale; avoid silently changing money/quantity semantics.

## Task 3 — PostgreSQL enums

Map these SQL enums to TypeScript enums with exact values and `enumName`:

```text
record_status, po_status, product_status, style_status, sample_status,
production_doc_status, upload_status, document_purpose, bom_status,
notification_channel, notification_delivery_status, audit_event_type
```

Migrations create enums before dependent tables.

## Task 4 — Auth/RBAC entities

Create `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `UserSession` for:

```text
users, roles, permissions, user_roles, role_permissions, user_sessions
```

Relations: User–Role N-N, Role–Permission N-N, User–Session 1-N, `UserRole.assigned_by -> User`. Preserve unique email/code, composite keys and FK delete rules.

## Task 5 — Master data entities

Create `Customer`, `MaterialGroup`, `Unit`, `Material`, `MaterialSize`, `Stage`, `StageGroup`, `StageGroupItem`, `Workshop`, `SizeChart`, `SizeChartItem`.

Preserve material/group/unit relations, stage-group relations, size-chart self-reference, codes, indexes and numeric/check constraints.

## Task 6 — Documents and styles

Create `Document`, `DocumentVersion`, `DocumentFolder`, `FolderDocument`, `Style`, `StyleDocument`, `StyleOperationStep`, `StyleSampleRound`, `StyleSampleImage`.

Preserve document versioning, folder self-reference, Style–Document junctions, operation steps and sample round/image relations. `Style` remains separate from PO product.

## Task 7 — Draft BOM

Create `DraftBomFamily`, `DraftBomVersion`, `DraftBomLine` for:

```text
styles -> draft_bom_families -> draft_bom_versions -> draft_bom_lines
```

Lines reference Material, MaterialGroup and Unit. Preserve parent-version relation, version/order uniqueness, current-version partial index and consumption checks.

## Task 8 — Purchase Order

Create entities for:

- `purchase_orders` and status/history/document tables.
- `purchase_order_products` and product status/document tables.
- Product colors, color sizes, operation steps, sample rounds and images.
- Product color cards and card versions.

Relations:

```text
Customer -> PurchaseOrder -> PurchaseOrderProduct
Style -> PurchaseOrderProduct via source_style_id
PurchaseOrderProduct -> ProductColor -> ProductColorSize
ProductColor -> ProductColorCard -> ProductColorCardVersion
```

Preserve snapshots, status history, self-referencing operation steps and composite/partial unique constraints.

## Task 9 — Official BOM

Create `BillOfMaterials`, `BillOfMaterialLine`, `BillOfMaterialStatusHistory` for:

```text
bills_of_materials, bill_of_material_lines, bill_of_material_status_history
```

One BOM belongs to one product color. Preserve material/order uniqueness, approval check, status history and snapshot fields.

## Task 10 — Production

Create entities for production documents, sections, size rows, images, revisions, production plans and plan days.

Preserve style/product owner check, partial unique indexes, section/revision uniqueness, date checks and plan-day uniqueness.

## Task 11 — Notifications, platform and audit

Create:

```text
IdempotencyKey
NotificationCatalog
NotificationCatalogRole
NotificationPreference
Notification
NotificationDelivery
OutboxEvent
AuditEvent
AuditEventChange
```

Preserve delivery-channel uniqueness, retry fields, unpublished outbox index, audit reason check and aggregate/time indexes.

## Task 12 — Module registration

Create/register `AuthModule`, `MasterDataModule`, `DocumentModule`, `StyleModule`, `DraftBomsModule`, `PurchaseOrdersModule`, `BomsModule`, `ProductionModule`, `NotificationsModule`, `AuditModule`, `PlatformModule`, `DatabaseModule` and `LoggerModule`.

Each domain module uses `TypeOrmModule.forFeature([...])`. `AppModule` composes modules only. TypeORM uses glob discovery for `*.entity.ts/js`; `forFeature()` remains required for repository injection.

## Task 13 — Pino logger

Install/configure `nestjs-pino`, `pino`, `pino-pretty`.

- Readable console logs in development.
- Structured JSON logs in production.
- File output at `logs/app.log`.
- Global injectable logger module.
- Redact passwords, auth headers, JWTs, refresh tokens, AWS secrets and DB passwords.

## Task 14 — Migrations

Create migrations in dependency order:

1. Extension and enums.
2. Auth/RBAC.
3. Master data.
4. Documents/styles.
5. Draft BOM.
6. Purchase orders.
7. Production.
8. Official BOM.
9. Notifications/platform.
10. Audit.

Every migration has `up()`/`down()`, correct FK order, indexes and constraints. TypeORM must load only the correct `src` or `dist` migration path.

## Task 15 — Tests

Entity metadata tests must verify table names, primary/composite keys, relations, enum mappings, explicit columns and duplicate table names.

Migration test on clean Docker PostgreSQL:

```bash
docker compose up -d
npm run migration:show
npm run migration:run
```

Verify all tables/enums/FK/indexes/constraints, no pending migrations, successful final rollback and no duplicate on rerun.

## Task 16 — Runtime checks

```bash
npm run lint
npm run build
npm run test
npm run start:dev
```

Verify DB connection with `DB_AUTO_CONNECT=true`, all entities load, `/health` returns 200, Swagger works and logs appear in console/file.

## Acceptance checklist

- [ ] All entities from SQL schema exist.
- [ ] Style and PurchaseOrderProduct are separate entities.
- [ ] `source_style_id` maps to Style.
- [ ] Official BOM maps to product color.
- [ ] Explicit columns match SQL; no mandatory BaseEntity inheritance.
- [ ] Enums, FK, delete rules, indexes and constraints match SQL.
- [ ] Feature modules and entity folders are ready for team development.
- [ ] Migrations run on a clean database.
- [ ] Pino logs to console and file.
- [ ] `start:dev`, build, lint and tests pass.

## Deferred

DTOs, class-validator decorators, Auth/Material/BOM business logic, `/auth/login`, invalid-email test and CRUD endpoints. Service/controller files created here are skeletons only.
