# Plan: Xoá field `displayOrder` khỏi Nhóm vật tư

Scope: chỉ branch `feat/Thang-material-groups-be-api` (PR #18) + `feat/Thang-material-groups-fe-ui` (PR #9). Business xác nhận "Thứ tự hiển thị" không cần thiết, chỉ cần search là đủ.

Plan "đồng nhất UI dùng chung" (PageHeader/ConfirmDialog/Toast/Table chung giữa Nhóm vật tư và Mẫu Fit) được tách riêng, xem `FE-TAMI/docs/plan-shared-ui-components.md` — không làm trong branch này.

## Backend (`Erp-BE`)

1. **Migration mới** `src/database/migrations/1740000000004-RemoveMaterialGroupDisplayOrder.ts`:
   - `up()`: `ALTER TABLE material_groups DROP CONSTRAINT ck_material_groups_display_order_non_negative;` rồi `ALTER TABLE material_groups DROP COLUMN display_order;`
   - `down()`: thêm lại cột (`ADD COLUMN display_order integer NOT NULL DEFAULT 0`) rồi thêm lại constraint check.
   - **Không đụng** `uq_material_groups_name_normalized` (tạo chung migration cũ với `display_order` nhưng là logic khác — unique tên chuẩn hoá, phải giữ nguyên).
2. **Entity**: `src/features/master-data/entities/MaterialGroup.entity.ts` — xoá field `displayOrder`.
3. **DTO**: `src/features/master-data/material-groups/dto/create-material-group.dto.ts`, `material-group-response.dto.ts` (xoá field + dòng map trong `fromEntity`). `update-material-group.dto.ts` tự động theo (là `PartialType`).
4. **Service**: `material-groups.service.ts` — bỏ `displayOrder` khỏi `create`/`update`; đổi `findAll`'s `order: { displayOrder: 'ASC', name: 'ASC' }` → `order: { name: 'ASC' }`.
5. **Test cần sửa/xoá**:
   - Xoá hẳn `src/database/__tests__/add-material-group-display-order-non-negative-check.spec.ts`.
   - `src/database/entities.metadata.spec.ts` — xoá block test displayOrder (dòng ~48-60), kiểm tra import `MaterialGroup` còn dùng chỗ khác không.
   - `src/features/master-data/material-groups/__tests__/material-groups.service.spec.ts` — bỏ `displayOrder` khỏi fixture + assertion `order: {...}`.
   - `test/material-groups.e2e-spec.ts` — bỏ field khỏi payload/assertion; bỏ hẳn 2 test case `displayOrder: -1` và `displayOrder: 1.5`.
   - `test/material-groups.database.e2e-spec.ts` — bỏ assertion `displayOrder`.

## Frontend (`FE-TAMI`)

Chỉ xoá field, không đổi component dùng chung:
1. `src/features/master-data/material-groups/types/material-group.types.ts` — bỏ `displayOrder` khỏi `MaterialGroup`/`MaterialGroupInput`.
2. `src/features/master-data/material-groups/schemas/material-group.schema.ts` — bỏ `displayOrder`.
3. `src/features/master-data/material-groups/components/MaterialGroupForm.tsx` — bỏ khỏi zod schema/`FormValues`/`defaultValues`; xoá `<Input label="Thứ tự hiển thị" .../>`.
4. `src/features/master-data/material-groups/components/MaterialGroupTable.tsx` — xoá cột `displayOrder`.
5. Cập nhật `MaterialGroupForm.test.tsx`, `MaterialGroupTable.test.tsx` theo.

## Verification
- BE: `tsc --noEmit -p tsconfig.build.json`, `eslint`, `jest` (unit), `jest --config test/jest-e2e.json`, `nest build`, `migration:show`.
- FE: `tsc --noEmit`, `eslint src`, `vitest run`, `npm run build`.
- Test tay: mở `/masters/material-groups`, tạo/sửa 1 nhóm — form không còn "Thứ tự hiển thị", bảng không còn cột đó, search vẫn hoạt động.
