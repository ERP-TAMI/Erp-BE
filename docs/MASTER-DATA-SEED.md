# Master Data sample catalog

Tài liệu này hướng dẫn tạo và reset dữ liệu mẫu của task `S2-MASTER-08` cho local/staging. Catalog dùng cho màn hình Master Data, selector của Mẫu Fit và contract/integration test.

## Chuẩn bị

1. Checkout đúng branch/release có task `S2-MASTER-08`.
2. Cấu hình `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` trong môi trường.
3. Chạy migration trước:

```bash
npm run migration:run
```

Không chạy seed khi migration còn lỗi. Seed không tự sửa schema và không thay thế migration.

## Hai lệnh sử dụng

### Bổ sung dữ liệu còn thiếu

```bash
npm run seed:master-data
```

Lệnh này an toàn để chạy lại:

- insert theo mã/tên chuẩn hóa;
- dòng đã tồn tại được bỏ qua và không bị cập nhật;
- toàn bộ thao tác chạy trong một transaction;
- đơn vị, nhóm cha và các dependency được resolve từ database hiện tại.

Dùng lệnh này khi local/staging đã có dữ liệu cần giữ lại.

### Xóa và tạo lại catalog mẫu

Local trên PowerShell:

```powershell
$env:NODE_ENV = 'local'
npm run seed:master-data:reset
```

Local trên Linux/macOS:

```bash
NODE_ENV=local npm run seed:master-data:reset
```

Staging trên PowerShell:

```powershell
$env:NODE_ENV = 'staging'
npm run seed:master-data:reset
```

Staging trên Linux/macOS:

```bash
NODE_ENV=staging npm run seed:master-data:reset
```

Reset chỉ được phép khi `NODE_ENV` được đặt rõ ràng là `local`, `development`, `test` hoặc `staging`. Giá trị rỗng, `production` và giá trị ngoài allowlist bị chặn trước khi kết nối/xóa.

Reset không truncate bảng. Nó chỉ xóa các dòng có natural key thuộc catalog bên dưới rồi tạo lại trong cùng transaction. Nếu PO, BOM, Material Size, revision Size Chart hoặc dữ liệu nghiệp vụ khác đang tham chiếu một dòng mẫu, PostgreSQL trả `23503`; toàn bộ transaction rollback và không có catalog dở dang.

Trước khi reset staging:

1. backup database;
2. dừng job/test đang ghi Master Data;
3. kiểm tra fixture nghiệp vụ không tham chiếu catalog mẫu;
4. chạy reset;
5. chạy smoke test API hoặc E2E bên dưới.

## Catalog được quản lý

| Loại | Số lượng | Nguồn |
|---|---:|---|
| Đơn vị dependency | 2 | `Cái`, `Mét` |
| Nhóm vật tư | 14 | `be-demo/seed-all.ts` |
| Vật tư | 16 | Catalog đại diện từ demo, phủ đủ 14 nhóm |
| Giai đoạn/công đoạn | 34 | Tái sử dụng `seed-stages.ts` hiện hành |
| Nhóm công đoạn | 3 nhóm / 54 item | Tái sử dụng `seed-stage-groups.ts` hiện hành |
| Xưởng | 9 | Giữ `BM-01`, thêm `X-01` đến `X-08` từ demo |
| Bảng Size | 3 bảng / 24 size | Size chữ, size số nữ, size trẻ em |

Catalog vật tư đại diện gồm `FUS-BLK`, `FUS-WHT`, `TAPE-001`, `ML-001`, `SL-001`, `CL-001`, `HT-001`, `HT-020`, `JK-001`, `SA-001`, `HG-001`, `SP-001`, `ZP-001`, `ZT-001`, `ZP-P001`, `BT-001`.

Ba bảng Size:

- `Size chữ tiêu chuẩn`: `XS, S, M, L, XL, 2XL, 3XL`;
- `Size số nữ`: `0, 2, 4, 6, 8, 10, 12, 14, 16, 18`;
- `Size trẻ em`: `2Y, 4Y, 6Y, 8Y, 10Y, 12Y, 14Y`.

Task không tạo Style/Mẫu Fit. Catalog trên cung cấp dữ liệu active để luồng Fit và integration test tạo fixture của riêng nó.

## Hợp đồng ID ổn định

File `src/database/seeds/sample-master-data.ts` xuất:

- `stableSampleId(namespace, naturalKey)`;
- `STABLE_SAMPLE_IDS`;
- các catalog `*_SEEDS`.

ID được tạo xác định bằng SHA-256 từ `tami:s2-master-08:<namespace>:<natural-key>`, sau đó đặt bit version/variant UUID. ID không phụ thuộc vị trí trong mảng nên thêm hoặc sắp xếp lại catalog không làm đổi contract cũ.

Ví dụ test TypeScript:

```ts
import { STABLE_SAMPLE_IDS } from '../src/database/seeds/sample-master-data';

const fusibleGroupId = STABLE_SAMPLE_IDS.materialGroups.FUSIBLE;
const fusibleBlackId = STABLE_SAMPLE_IDS.materials['FUS-BLK'];
const standardSizeChartId =
  STABLE_SAMPLE_IDS.sizeCharts['Size chữ tiêu chuẩn'];
```

Lưu ý: seed thường giữ ID của dòng đã có. Chỉ reset mới đảm bảo mọi dòng thuộc catalog được tạo lại bằng ID contract. Vì vậy contract test cần database test riêng và phải chạy reset trước suite.

## Chạy test

Unit test catalog và transaction:

```bash
npm test -- --runInBand sample-master-data.spec.ts
```

API/database E2E trên database test có thể reset:

PowerShell:

```powershell
$env:RUN_DATABASE_E2E = 'true'
npm run test:e2e -- --runInBand master-data-seed.database.e2e-spec.ts
```

Linux/macOS:

```bash
RUN_DATABASE_E2E=true npm run test:e2e -- --runInBand master-data-seed.database.e2e-spec.ts
```

E2E kiểm tra:

- cả sáu API Master yêu cầu JWT (`401` khi không đăng nhập);
- Material Group, Material và Size Chart trả đúng ID contract;
- vật tư resolve đúng nhóm và đơn vị;
- xóa nhóm đang được vật tư tham chiếu trả `409`;
- xóa Size Chart đang được revision tham chiếu trả `409`;
- số dòng catalog sau reset đúng kỳ vọng.

Không bật `RUN_DATABASE_E2E=true` trên database dùng chung hoặc production vì suite chủ động reset catalog mẫu.

## Xử lý sự cố

### Reset báo dữ liệu đang được tham chiếu

Lệnh đã rollback an toàn. Xóa fixture nghiệp vụ phụ thuộc hoặc dùng một database test sạch, sau đó chạy lại. Không đổi FK sang cascade để né lỗi.

### Migration báo cột đã tồn tại

Đây là migration-history drift: schema và bảng `migrations` không đồng bộ. Không sửa/xóa migration cũ và không tự insert record migration nếu chưa kiểm chứng. So sánh schema, lịch sử deploy và backup; xử lý drift bằng quy trình database riêng rồi mới seed.

### Seed thường chạy thành công nhưng ID khác `STABLE_SAMPLE_IDS`

Dòng đó đã tồn tại trước seed và được giữ lại đúng theo hợp đồng “không ghi đè”. Dùng database test sạch hoặc reset sau khi đã gỡ các tham chiếu nghiệp vụ.

### Seed dừng giữa chừng

Mọi bước nằm trong một transaction nên database tự rollback. Sửa nguyên nhân và chạy lại cùng lệnh.
