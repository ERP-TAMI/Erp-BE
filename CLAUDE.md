# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
docker-compose up -d          # Postgres on 55432 (container erp-be-postgres), pgAdmin on 5050
cp .env.example .env          # set SEED_TEST_ACCOUNT_PASSWORD before seeding
npm run start:dev             # nest --watch, port from APP_PORT (default 3000)
npm run build
npm run lint                  # npm run lint:fix to autofix
npm test                      # jest unit tests; add -- --maxWorkers=4 if the machine is memory-constrained
npx jest src/features/purchase-orders/purchase-orders.service.spec.ts   # single file
npm run test:e2e
npm run migration:generate -- <Name>
npm run migration:run
npm run migration:revert
npm run migration:show
npm run seed:auth              # seeds 6 test accounts using SEED_TEST_ACCOUNT_PASSWORD
npm run seed:master-data       # add --reset to wipe first
npm run seed:po-demo
npm run migrate:legacy-uploads -- --dry-run   # one-off: push pre-S3 local uploads to S3
```

`GET /health` is the liveness check. Swagger is at `/api/docs`.

## Architecture

- Feature modules live under `src/features/<domain>/`: `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`. `purchase-orders/` is the largest and most active module. `styles/style-sample-rounds.*` is the fit-sample-round feature (rounds + presigned images per round, plus a `download-url` endpoint that reuses `getPresignedGetUrl(..., downloadFileName)` to force `Content-Disposition: attachment`).
- **Every controller needs `@Auth()`** — it's opt-in per controller, not global, and `styles`/`style-operation-steps`/`style-documents` shipped for a while with no guard at all (silently open to unauthenticated requests) before that was caught. When adding a new controller, add `@Auth()` (or `@Auth('permission')`) in the same commit, don't assume it's inherited.
- **No global route prefix** (`main.ts` doesn't call `setGlobalPrefix`). A few controllers (`purchase-orders`, `styles`, `style-operation-steps`) register their path as an array of aliases, e.g. `['purchase-orders', 'api/purchase-orders', 'api/v1/purchase-orders']`, so the same routes answer under three prefixes. This is deliberate backward-compat duplication carried over from a contract disagreement, not a bug — don't "clean it up" without checking every consumer first.
- **Auth**: `@Auth(permission?)` (`src/common/decorators/auth.decorator.ts`) stacks `JwtAuthGuard` + `PermissionGuard`. Permissions are a flat string array baked into the JWT payload at login (`JwtPayload.permissions`) and checked directly against it — there's no per-request DB permission lookup. `JwtStrategy` re-validates the user against the DB every request (active status, `lockoutUntil`, `authVersion`) so that revoking a user or bumping `authVersion` invalidates already-issued tokens without a blocklist.
- **File storage** (`src/features/storage/`): uploads never pass through the server. Flow is presign (`StorageService.getPresignedPutUrl`, injected via the `STORAGE_SERVICE` token) → client PUTs straight to S3 → a `confirm` endpoint verifies the object and writes the DB row. Verification reads only the first few KB via `getObjectHead()` (ranged GET) — never `getObjectBuffer()` (full download) except for the `.txt`/`.csv` case, which needs the whole body to scan for embedded binary. `confirm` endpoints validate that the client-supplied `objectKey` sits under the prefix that specific endpoint issued, before touching it.
  - `getPresignedGetUrl()` must be called fresh on every read — never persist a signed URL (they expire per `PRESIGN_GET_EXPIRY_SECONDS`).
  - `isResolvableObjectKey()` / `isLegacyLocalStorageKey()` (`storage-key.util.ts`) guard against rows whose `storage_key` is still a pre-migration local `/uploads/...` path with no object behind it on S3 — skip presigning those, don't error.
- **TypeORM**: `src/database/data-source.ts` is the CLI data source. Migrations in `src/database/migrations/` are the only source of truth for schema — `synchronize` is not used, always add a migration.
- **Pagination**: list endpoints return `{ items, total, page, limit, totalPages }` (see `PaginatedPoResult` and siblings in `purchase-orders.service.ts`). Query DTOs cap `limit` (commonly 100) because some list responses do per-row work (a presign, a count) that scales with page size.
- **Detail endpoints return only their own tab's data** — don't spread whole entities (`{...entity}`) into a response or reintroduce a "return everything for every tab" endpoint. Both patterns have caused real bugs here: leaking internal columns (`rowVersion`, `previousStatus`, `createdBy`/`updatedBy`, `closedBy`) to the client, and forcing every screen to pay for data it doesn't render (N+1 presigns on an unopened tab).
