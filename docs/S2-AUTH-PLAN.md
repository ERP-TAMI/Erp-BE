# S2-AUTH: Kế hoạch triển khai Authentication & Authorization (Backend)

## Status
S2-AUTH-01: code xong, đã test migration/seed thật trên DB dev (idempotent), PR đang mở (#21). Cần xác nhận phần "Giả định nghiệp vụ" bên dưới trước khi merge. Các task còn lại (02, 03, 05-BE) chưa bắt đầu.

## Scope
Tài liệu này lên kế hoạch chi tiết cho 4 nhánh việc thuộc repo `Erp-BE`:

| Ticket | Nội dung | Branch |
|---|---|---|
| S2-AUTH-01 | Hoàn thiện bảng users/roles/permissions/user_roles/user_sessions, migration, seed dữ liệu vai trò/quyền, script tạo tài khoản test | `feat/Nguyen_S2-AUTH-01-user-role-permission-seed` |
| S2-AUTH-02 | API đăng nhập, refresh, logout, me; băm mật khẩu; quản lý phiên | `feat/Nguyen_S2-AUTH-02-login-session-api` |
| S2-AUTH-03 | Hoàn thiện JwtAuthGuard/PermissionGuard/@Permission, áp dụng vào API hiện có | `feat/Nguyen_S2-AUTH-03-permission-guard` |
| S2-AUTH-05 (phần BE) | Unit test + API E2E cho auth | `feat/Nguyen_S2-AUTH-05-be-auth-tests` |

Phần FE (S2-AUTH-04, S2-AUTH-05 phần FE) nằm ở tài liệu riêng: `FE-TAMI/docs/S2-AUTH-PLAN.md`. Hai tài liệu tham chiếu chéo contract API ở mục "API contract" bên dưới.

## Quyết định kỹ thuật đã chốt (theo xác nhận của product owner ngày 2026-08-23)

1. **Băm mật khẩu**: `bcryptjs` (pure JS, không cần build native — tránh rủi ro thiếu node-gyp/VS Build Tools trên máy Windows).
2. **Lưu phiên đăng nhập**: access token JWT sống ngắn (15 phút), **không lưu ở FE storage nào cả** — chỉ giữ trong memory (zustand store). Refresh token là chuỗi ngẫu nhiên (không phải JWT), lưu **hash SHA-256** trong `user_sessions.refresh_token_hash`, gửi cho FE qua **httpOnly cookie** (`Secure` khi prod, `SameSite=Lax`). Refresh token được **rotate** mỗi lần refresh (tạo token mới, revoke session cũ) để phát hiện replay/đánh cắp token.
3. **Cơ chế làm mới phiên** (trả lời câu hỏi "sao phải F5 mới gọi lại"): vì access token chỉ ở memory nên **mất khi tải lại trang** — bắt buộc phải gọi `/auth/refresh` **một lần lúc app khởi động** (bootstrap) để khôi phục phiên từ cookie. Ngoài ra có: (a) timer chủ động gọi refresh ~60 giây **trước khi access token hết hạn thật** (không đợi hết hạn mới gọi), (b) interceptor bắt lỗi 401 làm lớp dự phòng cuối, dùng single-flight (1 request refresh dùng chung cho nhiều request đang chờ) + cờ "đã retry 1 lần" để **không bao giờ lặp vô hạn**. Đây là pattern chuẩn cho SPA dùng httpOnly refresh cookie (xem nguồn tham khảo cuối file).
4. **Quy trình PR**: Claude tự `git push` + `gh pr create` cho từng task ngay sau khi code xong (xác nhận với user trước mỗi lần tạo PR vì đây là hành động public). Mỗi task là 1 PR riêng, không gộp.

## Nhánh & Worktree

Base branch cho toàn bộ: `origin/dev`. Vì các task phụ thuộc code của nhau và có thể PR trước chưa merge kịp, các branch sau **stack lên branch trước** (branch từ branch trước, không phải từ dev), và phải **rebase lên dev** trước khi mở PR nếu dev đã có thay đổi mới hoặc PR trước đã merge.

| Task | Worktree path | Branch | Base |
|---|---|---|---|
| S2-AUTH-01 | `E:\Project\Startup-Project\ERP-May\Erp-BE-auth-01` | `feat/Nguyen_S2-AUTH-01-user-role-permission-seed` | `origin/dev` |
| S2-AUTH-02 | `E:\Project\Startup-Project\ERP-May\Erp-BE-auth-02` | `feat/Nguyen_S2-AUTH-02-login-session-api` | `feat/Nguyen_S2-AUTH-01-...` (stacked) |
| S2-AUTH-03 | `E:\Project\Startup-Project\ERP-May\Erp-BE-auth-03` | `feat/Nguyen_S2-AUTH-03-permission-guard` | `feat/Nguyen_S2-AUTH-02-...` (stacked) |
| S2-AUTH-05-BE | `E:\Project\Startup-Project\ERP-May\Erp-BE-auth-05be` | `feat/Nguyen_S2-AUTH-05-be-auth-tests` | `feat/Nguyen_S2-AUTH-03-...` (stacked) |

Lệnh tạo worktree mẫu (chạy từ repo gốc `Erp-BE`):
```bash
git fetch origin
git worktree add ../Erp-BE-auth-01 -b feat/Nguyen_S2-AUTH-01-user-role-permission-seed origin/dev
```

## Danh mục quyền (permission catalog)

> ⚠️ **Giả định nghiệp vụ cần xác nhận trước khi merge S2-AUTH-01**: mapping role → permission dưới đây là suy luận hợp lý từ tên vai trò, KHÔNG phải yêu cầu nghiệp vụ đã được xác nhận. Cần Product Owner duyệt lại trước khi seed vào môi trường thật.

Mã quyền theo format `<module>.<resource>.<action>`, chỉ tạo quyền cho các module đã có API thật trong codebase (`material-groups`, `styles`) + nhóm quyền hệ thống dùng cho SA/IT. Các module khác (BOM, PO, production, documents) sẽ bổ sung permission ở sprint sau khi API tương ứng được bảo vệ.

| Mã quyền | Mô tả (tiếng Việt) |
|---|---|
| `system.users.manage` | Quản lý tài khoản người dùng (tạo, sửa, khoá/mở khoá, gán vai trò) |
| `system.roles.manage` | Quản lý vai trò và gán quyền cho vai trò |
| `system.audit.view` | Xem nhật ký hoạt động hệ thống (audit log) |
| `master_data.material_groups.view` | Xem danh mục nhóm vật tư |
| `master_data.material_groups.manage` | Tạo, sửa, xoá nhóm vật tư |
| `master_data.styles.view` | Xem danh mục kiểu dáng / mã hàng |
| `master_data.styles.manage` | Tạo, sửa, xoá kiểu dáng / mã hàng |

Bảng gán vai trò — quyền (mỗi tài khoản test chỉ có đúng 1 vai trò, đúng theo ràng buộc `uq_user_single_role` đã có sẵn trong schema):

| Vai trò (code) | Tên vai trò | Quyền được gán |
|---|---|---|
| `SA` | Quản trị hệ thống | Toàn bộ 7 quyền trên |
| `IT` | Công nghệ thông tin | `system.users.manage`, `system.audit.view` |
| `TPKH` | Trưởng phòng Kinh doanh | `master_data.material_groups.view`, `master_data.material_groups.manage`, `master_data.styles.view`, `master_data.styles.manage` |
| `NVKH` | Nhân viên Kinh doanh | `master_data.material_groups.view`, `master_data.styles.view` |
| `RD` | Nghiên cứu và Phát triển | `master_data.material_groups.view`, `master_data.styles.view`, `master_data.styles.manage` |
| `ACCOUNTING` | Kế toán | `master_data.material_groups.view`, `master_data.styles.view` |

---

## Task 1 — S2-AUTH-01: Dữ liệu tài khoản, vai trò, quyền

### Hiện trạng (đã xác minh trong codebase)
- Bảng `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_sessions` **đã tồn tại đầy đủ** trong `db/database-schema-postgresql15.sql` và đã được migrate qua `CreateCanonicalSchema1730000000000`. Cột đã có sẵn cho account lockout: `login_failed_count`, `lockout_until`, `status`, `must_change_password`, `row_version`.
- Ràng buộc `uq_user_single_role` (unique index trên `user_roles.user_id`) đã tồn tại → tự động enforce "mỗi tài khoản chỉ 1 vai trò", không cần thêm constraint mới.
- Entity TypeORM (`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserSession`) đã có sẵn ở `src/features/auth/entities/`, dạng cột phẳng, chưa khai báo relation.
- **Chưa có seed script nào** trong repo. Đây là phần cần xây từ đầu.

→ Vì vậy "hoàn thiện bảng" ở đây **không phải tạo schema mới** mà là: (1) seed dữ liệu tĩnh roles/permissions qua migration, (2) viết script tạo 6 tài khoản test.

### Thiết kế: tách rõ 2 loại dữ liệu
- **Reference data (roles, permissions, role_permissions)** → đưa vào **migration** (`INSERT ... ON CONFLICT DO NOTHING`), vì đây là dữ liệu bắt buộc phải có ở MỌI môi trường (dev/staging/prod).
- **Test accounts (6 tài khoản)** → đưa vào **script riêng** (`npm run seed:auth`), **KHÔNG** chạy tự động và **KHÔNG** đưa vào migration, vì prod không được có tài khoản test.

### File cần tạo
1. `src/database/migrations/1740000000006-SeedAuthRolesAndPermissions.ts`
   - ⚠️ Timestamp `1740000000006` là ước lượng dựa trên báo cáo khảo sát (5 migration cuối là `1740000000000`–`1740000000005`). **Chạy `npm run migration:show` để xác nhận số chính xác trước khi tạo file thật.**
   - `up()`: `INSERT INTO roles (id, code, name, description, is_system) VALUES (gen_random_uuid(), 'SA', 'Quản trị hệ thống', ..., true), ... ON CONFLICT (code) DO NOTHING;` tương tự cho `permissions` (theo bảng mã quyền ở trên) và `role_permissions` (join theo code, dùng subquery `SELECT id FROM roles WHERE code = ...`).
   - `down()`: xoá theo code (`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code IN (...))`, rồi `DELETE FROM permissions WHERE code IN (...)`, `DELETE FROM roles WHERE code IN (...)`).
2. `src/database/seeds/seed-auth-test-accounts.ts`
   - Là 1 script TypeORM standalone (khởi tạo `DataSource` giống `src/database/data-source.ts`, không bootstrap toàn bộ Nest app — cho nhanh và đơn giản).
   - Đọc mật khẩu từ `process.env.SEED_TEST_ACCOUNT_PASSWORD`. **Nếu biến này không tồn tại → throw ngay, không dùng giá trị mặc định hardcode.**
   - Với mỗi trong 6 role: `upsert` user theo `email` (unique) — nếu đã tồn tại thì cập nhật `password_hash`/`full_name`/`status`, nếu chưa có thì tạo mới với `password_hash = bcryptjs.hashSync(password, 10)`, `must_change_password = false`, `status = 'active'`.
   - Sau khi có `user.id`, xoá toàn bộ `user_roles` hiện tại của user đó rồi insert đúng 1 dòng role tương ứng (đảm bảo idempotent + tôn trọng `uq_user_single_role`).
   - Toàn bộ nằm trong 1 transaction, log ra console email + role đã seed (không log mật khẩu).
3. `package.json`: thêm script `"seed:auth": "ts-node -r tsconfig-paths/register src/database/seeds/seed-auth-test-accounts.ts"`.
4. `.env.example`: thêm dòng `SEED_TEST_ACCOUNT_PASSWORD=` (để trống, kèm comment "chỉ set ở .env local/CI secret, không commit giá trị thật").
5. `.gitignore`: xác nhận lại `.env` đã bị ignore (đã có sẵn theo khảo sát) — không cần sửa, chỉ note để double-check khi PR.
6. Cập nhật `src/database/entities.metadata.spec.ts` — **không cần sửa** vì không thêm entity mới, chỉ thêm dữ liệu.

### Danh sách 6 tài khoản test

| Role code | Email | Họ tên |
|---|---|---|
| `SA` | `sa@tami.test` | Quản trị hệ thống |
| `TPKH` | `tpkh@tami.test` | Trưởng phòng Kinh doanh |
| `NVKH` | `nvkh@tami.test` | Nhân viên Kinh doanh |
| `RD` | `rd@tami.test` | Nghiên cứu và Phát triển |
| `ACCOUNTING` | `accounting@tami.test` | Kế toán |
| `IT` | `it@tami.test` | Công nghệ thông tin |

Mật khẩu: dùng chung 1 giá trị từ `SEED_TEST_ACCOUNT_PASSWORD` (đủ cho môi trường dev/test nội bộ; không áp dụng cho tài khoản thật).

### Acceptance checklist
- [ ] `npm run migration:run` chạy sạch trên DB mới tinh (từ `docker-compose up` postgres trống) → có đủ 6 role, 7 permission, đúng số role_permissions theo bảng mapping.
- [ ] Chạy `npm run migration:run` **2 lần liên tiếp** không lỗi, không tạo trùng dữ liệu (idempotent nhờ `ON CONFLICT DO NOTHING`).
- [ ] `npm run seed:auth` chạy lần đầu tạo đủ 6 user, mỗi user đúng 1 role.
- [ ] Chạy `npm run seed:auth` **lần thứ 2** không tạo trùng user/role, không lỗi (update tại chỗ).
- [ ] Chạy `npm run seed:auth` khi thiếu `SEED_TEST_ACCOUNT_PASSWORD` → script fail rõ ràng, không tạo user với mật khẩu rỗng/mặc định.
- [ ] `git log` / PR diff không chứa mật khẩu thật ở bất kỳ đâu (chỉ có tên biến env).
- [ ] `npm run test` (unit) pass, `entities.metadata.spec.ts` vẫn pass (không đổi số lượng entity).

### Kiểm thử cần viết trong task này
- Unit test cho seed script: mock `DataSource`, assert đúng logic upsert (tạo mới nếu chưa có, update nếu đã có, xoá role cũ trước khi gán role mới).

---

## Task 2 — S2-AUTH-02: API đăng nhập & duy trì phiên

### Endpoints

**`POST /auth/login`**
- Body (DTO + class-validator): `{ email: string (IsEmail), password: string (IsString, MinLength(1)) }`.
- Luồng: tìm user theo email → không thấy hoặc `status !== 'active'` → phân biệt rõ (xem bảng lỗi) → nếu có `lockout_until` còn hiệu lực → 403 `ACCOUNT_LOCKED` → `bcryptjs.compare(password, user.password_hash)`:
  - Sai → tăng `login_failed_count`; nếu đạt ngưỡng (đề xuất 5 lần) → set `lockout_until = now() + 15 phút`; trả 401 `INVALID_CREDENTIALS` (không tiết lộ email hay sai mật khẩu, message chung chung).
  - Đúng → reset `login_failed_count = 0`, `lockout_until = null`, `last_login_at = now()`; sinh access token (JWT, payload `{ sub: userId, email, roleCode, permissions: string[] }`, exp 15 phút, ký bằng `JWT_SECRET`); sinh refresh token (`crypto.randomBytes(64).toString('hex')`), lưu `sha256(refreshToken)` vào `user_sessions.refresh_token_hash` cùng `expires_at` (đề xuất 7 ngày), `user_agent`, `ip_address`; set cookie `refresh_token` (`httpOnly`, `secure` khi `NODE_ENV=production`, `sameSite=lax`, `path=/auth`, `maxAge` = 7 ngày).
- Response 200: `{ accessToken, user: { id, email, fullName, roleCode, roleName, permissions } }`. **Không bao giờ trả `password_hash` hay refresh token trong body.**

**`POST /auth/refresh`**
- Đọc refresh token từ cookie (không nhận qua body). Hash SHA-256 → tìm `user_sessions` theo `refresh_token_hash`.
- Không tìm thấy / đã `revoked_at` / đã hết `expires_at` → 401 `UNAUTHORIZED`, xoá cookie.
- Hợp lệ → **rotate**: revoke session hiện tại (`revoked_at = now()`, `revoke_reason = 'rotated'`), tạo session mới + refresh token mới + set cookie mới, sinh access token mới. Trả về giống response của `/auth/login`.

**`POST /auth/logout`**
- Đọc refresh cookie → nếu có session tương ứng và chưa revoke → set `revoked_at = now()`, `revoke_reason = 'logout'`. Xoá cookie (`res.clearCookie`). Trả 204.
- Idempotent: gọi logout khi không có cookie / session đã revoke vẫn trả 204 (không lỗi).
- **Giới hạn cần ghi rõ trong PR description**: access token hiện có (JWT, còn hạn ≤15 phút) vẫn hợp lệ về mặt chữ ký cho tới khi tự hết hạn — logout chỉ đảm bảo **không refresh được nữa**, đây là đánh đổi chuẩn khi dùng JWT access token stateless với TTL ngắn (không cần blacklist thêm ở Sprint này).

**`GET /auth/me`**
- Bảo vệ bởi `JwtAuthGuard`. Lấy `req.user.id` (từ `JwtStrategy.validate`) → **query lại DB** (không chỉ đọc từ JWT claim) để trả thông tin mới nhất: `{ id, email, fullName, roleCode, roleName, permissions }`. Query lại DB để tránh trả dữ liệu cũ nếu quyền/role bị đổi giữa chừng.

### JwtStrategy (mới, chưa tồn tại)
`src/features/auth/strategies/jwt.strategy.ts` — implement `PassportStrategy(Strategy)`, extract từ `Authorization: Bearer <token>` header, verify bằng `JWT_SECRET`. `validate(payload)`:
- Query `users` theo `payload.sub`. Không tồn tại, hoặc `status !== 'active'`, hoặc đang bị `lockout_until` → throw `UnauthorizedException` (chặn ngay cả khi chữ ký JWT còn hợp lệ nhưng tài khoản đã bị khoá/vô hiệu hoá sau khi token được cấp).
- Trả về `{ id, email, roleCode: payload.roleCode, permissions: payload.permissions }` → Nest gắn vào `req.user`.

Đăng ký `JwtModule.registerAsync` (đọc `JWT_SECRET`, `JWT_EXPIRY` đã có sẵn trong `.env`) + `PassportModule` trong `auth.module.ts`.

### Mã lỗi (dùng đúng `ErrorCode` enum hiện có, bổ sung 2 mã mới)
| Tình huống | HTTP | Code |
|---|---|---|
| Body sai định dạng | 400 | `VALIDATION_ERROR` |
| Sai email hoặc sai mật khẩu | 401 | `INVALID_CREDENTIALS` |
| Token thiếu/sai/hết hạn (guard) | 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` |
| Tài khoản bị khoá tạm thời (đăng nhập sai nhiều lần) | 403 | `ACCOUNT_LOCKED` **(mã mới, cần thêm vào `error-code.enum.ts`)** |
| Tài khoản bị vô hiệu hoá (`status = inactive`) | 403 | `ACCOUNT_INACTIVE` **(mã mới)** |

Cả 2 mã mới đi qua `HttpExceptionFilter` sẵn có (`mapStatusToCode`) — chỉ cần throw `new ForbiddenException({ code: ErrorCode.ACCOUNT_LOCKED, message: '...' })` theo đúng convention hiện tại của filter.

### Dependency mới cần thêm
`npm install bcryptjs && npm install -D @types/bcryptjs`.

### Bảo mật / hygiene
- Redact thêm `password`, `refreshToken` trong `logger.module.ts` (hiện chỉ redact header `authorization`/`cookie`) — bổ sung path redact cho request body của `/auth/login`.
- Không log payload chứa mật khẩu ở bất kỳ interceptor/log nào.

### Acceptance checklist
- [ ] Login đúng → trả `accessToken` hợp lệ (decode được, đúng claims) + cookie `refresh_token` httpOnly được set.
- [ ] `/auth/refresh` bằng cookie hợp lệ → access token mới, cookie mới (refresh token cũ dùng lại → 401).
- [ ] `/auth/logout` → gọi lại `/auth/refresh` bằng cookie cũ → 401.
- [ ] `/auth/me` trả đúng user + role + permissions, không có trường password/hash nào trong response.
- [ ] Sai mật khẩu 5 lần liên tiếp → lần thứ 6 dù đúng mật khẩu vẫn 403 `ACCOUNT_LOCKED` cho tới khi hết `lockout_until`.
- [ ] Tài khoản `status = inactive` → login trả 403 `ACCOUNT_INACTIVE` dù đúng mật khẩu.

---

## Task 3 — S2-AUTH-03: Bảo vệ API theo quyền

### Việc cần làm
1. Áp dụng decorator `@Auth()` (đăng nhập bắt buộc, không cần quyền cụ thể) cho toàn bộ endpoint GET/list của `material-groups` và `styles`.
2. Áp dụng `@Auth('master_data.material_groups.manage')` / `@Auth('master_data.styles.manage')` cho các endpoint create/update/delete tương ứng.
3. Rà soát toàn bộ `*.service.ts` hiện có — đảm bảo **không có bất kỳ điều kiện nào so sánh tên vai trò trực tiếp** (`if (user.role === 'SA')` kiểu vậy). Toàn bộ authorization phải nằm ở tầng guard/decorator, service chỉ nhận `req.user` nếu cần cho mục đích khác (audit log), không tự quyết định quyền.
4. Kiểm tra `PermissionGuard` hiện có (`src/common/guards/permission.guard.ts`) — bổ sung xử lý phòng thủ: nếu `request.user` không tồn tại (trường hợp lý thuyết không nên xảy ra vì `JwtAuthGuard` chạy trước) → throw `ForbiddenException` thay vì để lỗi runtime (`Cannot read property of undefined`).

### Test matrix bắt buộc (unit + e2e)
| Case | Input | Kỳ vọng |
|---|---|---|
| Không có token | Không gửi `Authorization` | 401 |
| Token sai định dạng/chữ ký sai | Token random string | 401 |
| Token hợp lệ nhưng tài khoản đã bị vô hiệu hoá sau khi cấp token | Token của user vừa bị set `status=inactive` | 401 (JwtStrategy chặn) |
| Có token, không đủ quyền | User role `NVKH` gọi API cần `master_data.material_groups.manage` | 403 |
| Có token, đủ quyền | User role `TPKH` gọi API cần `master_data.material_groups.manage` | 200 |

### Acceptance checklist
- [ ] Toàn bộ endpoint `material-groups`, `styles` yêu cầu đăng nhập (test bằng cách gọi không token → 401).
- [ ] Endpoint mutate yêu cầu đúng permission (test role thiếu quyền → 403).
- [ ] `grep -rn "role ===" src/features` không còn match nào ngoài phần định nghĩa enum/entity.
- [ ] Test guard (unit) pass đủ 5 case ở bảng trên.

---

## Task 4 — S2-AUTH-05 (phần Backend): Kiểm thử & nghiệm thu

### Unit test
- `bcryptjs` hash/compare wrapper (nếu tách thành helper riêng `src/common/security/password.util.ts`).
- `AuthService.login`: thành công, sai mật khẩu (tăng failed count), khoá sau ngưỡng, tài khoản inactive, tài khoản đang bị khoá.
- `AuthService.refresh`: rotate thành công, token hết hạn, token đã revoke, dùng lại token cũ sau khi rotate → fail.
- `AuthService.logout`: revoke đúng session, gọi logout 2 lần không lỗi.
- `PermissionGuard` / `JwtStrategy`: theo test matrix ở Task 3.

### API E2E (`test/auth.e2e-spec.ts`, theo pattern `material-groups.e2e-spec.ts` đã có — mock service ở tầng HTTP contract)
- Email sai → 401.
- Mật khẩu sai → 401.
- Tài khoản bị khoá → 403.
- Gọi API cần đăng nhập mà không có token → 401.

Nếu cần test ràng buộc DB thật (unique email, `uq_user_single_role`), thêm `test/auth.database.e2e-spec.ts` theo pattern `material-groups.database.e2e-spec.ts` (chạy trên Postgres thật qua `docker-compose`).

### Rà soát bảo mật thủ công (checklist, không phải test tự động)
- [ ] Response của `/auth/login`, `/auth/refresh`, `/auth/me` **không chứa** `password`, `password_hash`, hay refresh token thô ở bất kỳ trường nào.
- [ ] CORS config (kiểm tra `main.ts`) chỉ cho phép origin cụ thể của FE + `credentials: true` (không dùng `origin: '*'` vì cookie yêu cầu origin tường minh).
- [ ] Cookie `refresh_token`: `httpOnly=true`, `secure=true` khi `NODE_ENV=production`, `sameSite=lax`.
- [ ] Xác nhận refresh token rotation hoạt động đúng (token cũ không dùng lại được).

### Acceptance checklist
- [ ] `npm run lint && npm run test && npm run test:e2e` đều pass.
- [ ] Có báo cáo kết quả test (đính kèm vào PR description hoặc `docs/review-pr<N>-auth-be.md` theo đúng convention review doc hiện có của repo).

---

## PR Links

| Task | Branch | PR |
|---|---|---|
| S2-AUTH-01 | `feat/Nguyen_S2-AUTH-01-user-role-permission-seed` | https://github.com/ERP-TAMI/Erp-BE/pull/21 |
| S2-AUTH-02 | `feat/Nguyen_S2-AUTH-02-login-session-api` | _(điền sau khi tạo)_ |
| S2-AUTH-03 | `feat/Nguyen_S2-AUTH-03-permission-guard` | _(điền sau khi tạo)_ |
| S2-AUTH-05 (BE) | `feat/Nguyen_S2-AUTH-05-be-auth-tests` | _(điền sau khi tạo)_ |

## Giả định nghiệp vụ cần xác nhận
1. Mapping role → permission ở mục "Danh mục quyền" là suy luận, chưa có xác nhận chính thức từ Product Owner.
2. Ngưỡng khoá tài khoản: 5 lần sai / khoá 15 phút — có thể điều chỉnh theo yêu cầu bảo mật thật của tổ chức.
3. `SameSite=Lax` cho cookie giả định FE và BE cùng site (qua reverse proxy) ở production. Nếu FE/BE nằm ở 2 subdomain khác nhau, cần đổi sang `SameSite=None; Secure` và kiểm tra lại CORS.
4. Access token TTL 15 phút, refresh token TTL 7 ngày — theo khuyến nghị OWASP, có thể điều chỉnh.

## Nguồn tham khảo (best practice refresh token)
- JWT Refresh Token: Rotation, Revocation, and Secure Storage — https://jsonic.io/guides/jwt-refresh-token
- JWT Best Practices: Security, Expiry, and Storage — https://jsonic.io/guides/jwt-best-practices
- JWT Authentication (Access Tokens & Refresh Tokens) — https://medium.com/@akgupta241004/jwt-authentication-access-tokens-refresh-tokens-fbc64e74e640

## Related Files
- `db/database-schema-postgresql15.sql`, `db/database-architecture.md`
- `src/features/auth/**`
- `src/common/guards/**`, `src/common/decorators/**`
- `src/database/migrations/**`, `src/database/data-source.ts`
- `docs/INIT-ENTITIES-INFRASTRUCTURE-PLAN.md` (tài liệu tiền nhiệm, có ghi rõ auth là phần bị deferred từ đó)
- `docs/COMMIT-WORKFLOW.md` (quy ước branch/commit đang áp dụng lại ở đây)
