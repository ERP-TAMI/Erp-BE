# Tài khoản mặc định (admin và IT)

Migration chỉ tạo role và permission, không tạo user. Database mới sẽ không có ai đăng nhập được, nên cần tạo 2 tài khoản đầu tiên:

| Biến môi trường | Role |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | SA (Quản trị hệ thống) |
| `BOOTSTRAP_IT_EMAIL` / `BOOTSTRAP_IT_PASSWORD` | IT |

Chạy bằng `npm run bootstrap:accounts` (local) hoặc tự động ngay sau `migration:run` trong bước migrate của deploy.

## Quy tắc

- Không có email hay mật khẩu nào nằm trong code. Mỗi môi trường tự cấp giá trị.
- Idempotent: email đã tồn tại thì giữ nguyên, không ghi đè mật khẩu hay role.
- Mỗi tài khoản cần đủ cả email lẫn mật khẩu; mật khẩu tối thiểu 12 ký tự; hai email phải khác nhau.
- Không đặt biến nào thì bỏ qua, không lỗi (deploy vẫn chạy).
- Không log mật khẩu.

## Trên AWS

Hai tài khoản đọc từ SSM SecureString `/<project>/<env>/bootstrap/accounts` (JSON `admin_email`, `admin_password`, `it_email`, `it_password`), chỉ được nạp cho container migrate, không đưa vào container API. Sau khi đăng nhập và đổi mật khẩu, có thể xóa parameter này; lần deploy sau sẽ tự bỏ qua.
