# S2-AUTH-05 (Backend): Báo cáo kiểm thử & nghiệm thu

Phạm vi: toàn bộ luồng auth đã build ở S2-AUTH-01 (#21, merged) và S2-AUTH-02 (#22, merged) — băm mật khẩu, seed roles/permissions, login/refresh/logout/me, `PermissionGuard`. S2-AUTH-03 (gắn guard vào API nghiệp vụ) đang hoãn — xem lý do ở `docs/S2-AUTH-PLAN.md`.

## 1. Kết quả chạy test tự động

| Bộ test | Số lượng | Kết quả |
|---|---|---|
| Unit — `password.util.spec.ts` | 4 | ✅ pass |
| Unit — `seed-auth-test-accounts.spec.ts` | 4 | ✅ pass |
| Unit — `auth.service.spec.ts` (login/refresh/logout/getMe) | 15 | ✅ pass |
| Unit — `jwt.strategy.spec.ts` | 4 | ✅ pass |
| Unit — `permission.guard.spec.ts` (**mới, S2-AUTH-05**) | 5 | ✅ pass |
| Unit — các module khác (material-groups, styles) không đổi | 25 | ✅ pass |
| `entities.metadata.spec.ts` (đếm entity, không đổi) | 1 | ✅ pass |
| E2E — `auth.e2e-spec.ts` | 7 | ✅ pass |
| E2E — `material-groups.e2e-spec.ts`, `styles.e2e-spec.ts` | 12 | ✅ pass |
| `npm run lint` | — | ✅ sạch trên toàn bộ file liên quan đến auth |
| `npm run build` (tsc) | — | ✅ sạch |

**Tổng: 57 unit test + 19 e2e test (1 e2e DB-integration có sẵn bị skip, không liên quan auth), tất cả pass.**

## 2. Kiểm thử tay trên server thật (không chỉ mock)

Chạy `npm run start:dev` với DB dev thật (docker-compose Postgres), gọi trực tiếp qua `curl` và qua Vite proxy của FE:

- [x] Login đúng/sai với cả 6 tài khoản test.
- [x] Refresh xoay vòng (rotate): token cũ dùng lại → 401.
- [x] Logout: revoke session, dùng lại refresh cookie cũ → 401; gọi logout không có cookie vẫn 204 (idempotent).
- [x] Khoá tài khoản sau 5 lần sai mật khẩu liên tiếp; lần thứ 6 dù đúng mật khẩu vẫn 403 `ACCOUNT_LOCKED`.
- [x] Tài khoản `status=inactive` → 403 `ACCOUNT_INACTIVE`.
- [x] `GET /auth/me` không token → 401; có token hợp lệ → trả đúng user/role/permissions.
- [x] Test qua đúng đường FE gọi thật (Vite proxy `/api/*`) bằng Playwright (browser Chromium thật) — xem `FE-TAMI/docs/S2-AUTH-05-FE-TEST-REPORT.md`.

## 3. Danh sách lỗi phát hiện trong quá trình kiểm thử

| # | Mô tả | Mức độ | Trạng thái |
|---|---|---|---|
| 1 | Cookie `refresh_token` set `Path=/auth`, nhưng FE gọi API qua reverse proxy ở path `/api/auth/refresh` — không khớp path theo RFC 6265 nên trình duyệt không gửi lại cookie → **mất phiên đăng nhập mỗi lần F5**. Phát hiện khi test tay qua đúng đường FE gọi (không phải gọi thẳng BE). | Cao (chức năng cốt lõi hỏng) | ✅ Đã fix — đổi `REFRESH_COOKIE_PATH` thành `/` (commit trong PR #22 trước khi merge). Verify lại bằng Playwright, pass. |
| 2 | CORS cấu hình `origin: true` phản chiếu **bất kỳ origin nào** gửi lên, kết hợp `credentials: true`. | Trung bình (rủi ro bảo mật, không phải bug chức năng) | ⚠️ Chưa fix — xem mục 4, để lại quyết định. |

## 4. Rà soát bảo mật (theo yêu cầu "kiểm tra response không lộ mật khẩu, CORS, cookie/header, chính sách refresh token")

### 4.1 Response không lộ mật khẩu
- ✅ Verify bằng test tự động (`auth.e2e-spec.ts`: check `response.body` không chứa `refreshToken`, không chứa chuỗi `"password"`) và bằng tay (`grep` log server sau khi gọi login thật — không thấy mật khẩu hay `password_hash` xuất hiện, nhờ redact `req.body.password` đã thêm ở `logger.module.ts`).

### 4.2 CORS
- **Hiện trạng**: `main.ts` dùng `app.enableCors({ origin: true, credentials: true, ... })`. Test preflight thật bằng `curl -H "Origin: http://evil-site.example"` → server trả `Access-Control-Allow-Origin: http://evil-site.example` — tức **chấp nhận mọi origin**.
- **Đánh giá rủi ro thực tế**: rủi ro bị giảm nhẹ bởi 2 lớp khác:
  1. Cookie `refresh_token` có `SameSite=Lax` → trình duyệt **không** gửi cookie này kèm theo request cross-site dạng `fetch`/`XHR` (chỉ gửi khi điều hướng top-level GET) — nên một trang web lạ không thể lợi dụng CORS để tự động refresh/logout thay người dùng bằng cookie.
  2. Các API cần đăng nhập dùng `Authorization: Bearer <token>` (không tự động gửi kèm bởi trình duyệt) — trang web lạ không đọc được access token đang nằm trong memory của tab khác nên không giả mạo được header này.
- **Kết luận**: `origin: true` không tạo lỗ hổng khai thác được ngay lập tức nhờ 2 lớp trên, nhưng **không phải cấu hình production-ready** (đây là setting có sẵn từ trước S2-AUTH, áp dụng cho toàn bộ app chứ không riêng auth). 
- **Khuyến nghị (chưa làm trong task này vì ảnh hưởng toàn app, cần quyết định riêng)**: trước khi lên production, đổi `origin: true` thành danh sách domain FE thật (hoặc đọc từ biến môi trường `CORS_ALLOWED_ORIGINS`).

### 4.3 Cookie / header
- `refresh_token`: `httpOnly` ✅ (JS không đọc được), `SameSite=Lax` ✅, `Secure` chỉ bật khi `NODE_ENV=production` ✅ (đúng vì dev chạy qua HTTP), `Path=/` ✅ (đã fix lỗi #1 ở trên), `Max-Age` = 7 ngày khớp `REFRESH_TOKEN_TTL_DAYS`.
- Access token: không set cookie, chỉ trả trong body — đúng thiết kế (FE giữ trong memory).
- Log redact: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `res.headers["set-cookie"]` — đã verify không lộ qua log thật.

### 4.4 Chính sách refresh token
- Refresh token là chuỗi ngẫu nhiên 64 byte (`crypto.randomBytes`), **không phải JWT** → không đoán được, không tự giải mã được nội dung.
- Lưu trong DB dưới dạng **hash SHA-256**, không lưu token thô — kể cả lộ DB cũng không dùng lại được token.
- **Rotate mỗi lần refresh**: token cũ bị revoke (`revoked_at`, `revoke_reason='rotated'`) ngay khi cấp token mới — verify bằng test: dùng lại token cũ sau khi rotate → 401.
- **Revoke khi logout**: verify bằng test — dùng lại sau logout → 401.
- **Giới hạn đã biết** (ghi nhận, không phải bug): access token JWT còn hạn (≤15 phút) vẫn hợp lệ về chữ ký cho tới khi tự hết hạn, kể cả sau khi logout — đánh đổi chuẩn cho JWT access token stateless với TTL ngắn, không cần blacklist thêm ở sprint này.

## 5. Việc hoãn có chủ đích (không phải thiếu sót)
- **S2-AUTH-03** (gắn `@Auth()`/`@Permission()` vào API nghiệp vụ thật): hoãn để không chặn các tính năng khác đang code song song (FE cũng đang tắt `AUTH_GUARD_ENABLED`). Làm cùng lúc khi bật lại guard FE.

## 6. Kết luận
Toàn bộ acceptance của S2-AUTH-05 (phần BE) đạt: lint/build/unit/e2e đều pass, có báo cáo test này, danh sách lỗi đã cập nhật (1 lỗi cao đã fix, 1 rủi ro trung bình đã ghi nhận + khuyến nghị).
