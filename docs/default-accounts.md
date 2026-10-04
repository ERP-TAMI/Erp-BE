# Tài khoản mặc định

Migration chỉ tạo role và permission, không tạo user. Database mới sẽ không có ai đăng nhập được, nên cần tạo các tài khoản đầu tiên. Mỗi role có một cặp biến môi trường; role nào để trống thì bỏ qua.

| Biến môi trường | Role |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | SA (Quản trị hệ thống) |
| `BOOTSTRAP_IT_EMAIL` / `BOOTSTRAP_IT_PASSWORD` | IT |
| `BOOTSTRAP_TPKH_EMAIL` / `BOOTSTRAP_TPKH_PASSWORD` | TPKH (Trưởng phòng Kế hoạch) |
| `BOOTSTRAP_NVKH_EMAIL` / `BOOTSTRAP_NVKH_PASSWORD` | NVKH (Nhân viên Kế hoạch) |
| `BOOTSTRAP_RD_EMAIL` / `BOOTSTRAP_RD_PASSWORD` | RD (Nghiên cứu và Phát triển) |
| `BOOTSTRAP_ACCOUNTING_EMAIL` / `BOOTSTRAP_ACCOUNTING_PASSWORD` | ACCOUNTING (Kế toán) |

Chạy bằng `npm run bootstrap:accounts` (local) hoặc tự động ngay sau `migration:run` trong bước migrate của deploy.

## Quy tắc

- Không có email hay mật khẩu nào nằm trong code. Mỗi môi trường tự cấp giá trị.
- Idempotent: email đã tồn tại thì giữ nguyên, không ghi đè mật khẩu hay role.
- Mỗi tài khoản cần đủ cả email lẫn mật khẩu; mật khẩu tối thiểu 8 ký tự (bằng luật đặt mật khẩu của app); các email phải khác nhau.
- Không đặt biến nào thì bỏ qua, không lỗi (deploy vẫn chạy).
- Không log mật khẩu.

## Trên AWS

Các giá trị đọc từ SSM SecureString `/<project>/<env>/bootstrap/accounts`, JSON với khóa `<role>_email` và `<role>_password`, trong đó `<role>` là `admin`, `it`, `tpkh`, `nvkh`, `rd` hoặc `accounting`. Chỉ container migrate nhận chúng, container API thì không. Sau khi đăng nhập và đổi mật khẩu, có thể xóa parameter này; lần deploy sau sẽ tự bỏ qua.
