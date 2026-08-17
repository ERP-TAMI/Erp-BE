# Commit Workflow

## Branch

Mỗi task làm trên một branch riêng:

```text
feat/<owner>-<task-name>
fix/<owner>-<bug-name>
chore/<owner>-<maintenance-name>
```

Branch hiện tại:

```text
feat/Nguyen-init-entities-infrastructure
```

## Commit format

Dùng Conventional Commits:

```text
<type>: <short imperative description>
```

Các type được dùng:

- `feat`: thêm feature/entity/module/migration.
- `fix`: sửa lỗi.
- `refactor`: thay đổi code không đổi behavior.
- `test`: thêm hoặc sửa test.
- `chore`: cấu hình, dependency, tooling.
- `docs`: tài liệu/plan.

Không dùng prefix mơ hồ như `update`, `change`, `work`, `stuff`.

## Một task một commit

Mỗi task hoàn chỉnh tạo đúng một commit logic:

```text
feat: add auth and rbac entities
feat: add master data entities
feat: add style and document entities
feat: add purchase order entities
feat: add bom entities
feat: add production and notification entities
feat: add audit entities
feat: add typeorm migrations
feat: add pino logger infrastructure
test: verify entity metadata and migrations
```

Nếu task có lỗi trong quá trình làm, sửa lỗi trong cùng task bằng `--amend` hoặc squash trước khi chuyển sang task tiếp theo.

## Thứ tự triển khai và commit

1. `docs: add entities infrastructure plan`
2. `chore: prepare feature module structure`
3. `feat: add auth and rbac entities`
4. `feat: add master data entities`
5. `feat: add documents and styles entities`
6. `feat: add draft bom entities`
7. `feat: add purchase order entities`
8. `feat: add official bom entities`
9. `feat: add production entities`
10. `feat: add notification platform and audit entities`
11. `feat: add typeorm migrations`
12. `feat: add pino logger infrastructure`
13. `test: verify entities migrations and runtime`

## Trước mỗi commit

Chạy kiểm tra phù hợp:

```bash
npm run lint
npm run build
npm run test
```

Với migration:

```bash
npm run migration:show
npm run migration:run
```

Chỉ commit khi task tương ứng pass. Không gom thay đổi của nhiều task vào một commit.

## Commit cuối task hiện tại

Commit tổng chỉ dùng khi toàn bộ task hoàn tất và đã squash các commit trung gian:

```text
feat: initialize entities and infrastructure
```
