# Database Architecture — ERP May Mặc

> Thiết kế mục tiêu PostgreSQL 15 cho toàn bộ Module 1–7. Nguồn nghiệp vụ: `research-docs/module-1` đến `module-7`; code demo chỉ dùng để đối chiếu hiện trạng. ERD: import `database-erd.dbml` vào dbdiagram.io.

## Mục lục

- [Tổng quan](#tổng-quan)
- [Verify business logic](#verify-business-logic)
- [Danh sách bảng](#danh-sách-bảng)
- [Chi tiết từng bảng](#chi-tiết-từng-bảng)
- [Quan hệ giữa các bảng](#quan-hệ-giữa-các-bảng)
- [Enum Types](#enum-types)
- [Indexes](#indexes)
- [Quyết định thiết kế](#quyết-định-thiết-kế)
- [Gap cần xác nhận](#gap-cần-xác-nhận)

## Tổng quan

Schema được chuẩn hoá theo aggregate Style, PurchaseOrder, PurchaseOrderProduct, BillOfMaterials và Document. Dashboard không có bảng nguồn riêng; đọc từ các module nghiệp vụ và audit. File bytes đặt tại object storage, database chỉ lưu metadata/version. Tổng cộng **61 bảng**, **12 enum**, **117 FK inline**.

## Verify business logic

| Module | Kết luận đưa vào database |
|---|---|
| 1 | Style có thể tạo với 0 tài liệu/ảnh; AS3B, mẫu, tài liệu SX và NPL dự thảo là các aggregate con; draft BOM có version và không giá/duyệt. |
| 2 | PO và Product dùng trạng thái kết thúc `closed` (Chốt); Product chứa nhiều màu; import Style là snapshot một lần; tài liệu có version. |
| 3 | Một BOM duy nhất theo ProductColor; vật tư chọn Master và lưu snapshot; R&D nhập định mức, KT nhập giá; SA Chốt; sửa sau Chốt không tạo version BOM. |
| 4 | Master không xoá cứng khi đã dùng; mã unique; inactive không xuất hiện cho dữ liệu mới; giữ MaterialSize, StageGroup, Workshop, SizeChart. |
| 5 | Dashboard read-only, tính KPI từ PO/BOM/plan/audit; không tạo bảng dashboard hay lưu số tổng hợp giả. |
| 6 | User/RBAC, session revoke, notification catalog/preference/inbox/delivery; IT không được gán SA. |
| 7 | Một audit model tập trung, diff-only, append-only; reason bắt buộc trừ Create; actor role là snapshot. |

## Ma trận tài liệu nguồn

| Module | File đã đọc | Phạm vi được ánh xạ |
|---|---|---|

| module-1 | `1.1-Chuan-bi-tai-lieu-truoc-khi-tao-mau-fit.docx` | Kho tài liệu, folder, upload và quyền gán |
| module-1 | `1.2-Tao-va-sua-mau-fit.docx` | Style identity, tạo/sửa, tài liệu và ảnh optional |
| module-1 | `2.1-Thong-tin-chung.docx` | Style detail và metadata |
| module-1 | `2.2-Phan-bo-cong-doan-va-tinh-KIM.docx` | Style operation steps, order, KIM inputs |
| module-1 | `2.3-Anh-mau.docx` | Style sample rounds/images |
| module-1 | `2.4-Kho-tai-lieu-cua-mau-fit.docx` | Style-document junction và repository |
| module-1 | `2.5-Tai-lieu-san-xuat-tieng-Viet.docx` | Production document/sections/sizes/images/revisions |
| module-1 | `3.1-Tao-nguyen-phu-lieu-du-thao.docx` | Draft BOM family/version/lines |
| module-1 | `3.2-Quan-ly-danh-sach-NPL-du-thao.docx` | Immutable draft versions |
| module-1 | `3.3-Gui-NPL-du-thao.docx` | Không tạo approval state cho draft BOM |
| module-2 | `1.1-Tao-PO.docx` | PO header/customer/date |
| module-2 | `1.2-Tai-lieu-PO.docx` | PO document/version |
| module-2 | `1.3-Trang-thai-PO.docx` | PO state machine và history |
| module-2 | `2.1-Tao-va-sua-san-pham-PO.docx` | Product và Style snapshot provenance |
| module-2 | `2.2-Gan-tai-lieu-cho-san-pham.docx` | Product-document junction |
| module-2 | `2.3-Nhap-mau-size-va-so-luong.docx` | Product colors/sizes/quantities |
| module-2 | `3.1-Thong-tin-va-trang-thai-san-pham.docx` | Product state/history/lock |
| module-2 | `3.2-Phan-bo-cong-doan-san-pham.docx` | Product operation snapshot |
| module-2 | `3.3-May-mau-san-pham.docx` | Product sample rounds/images |
| module-2 | `3.4-Quan-ly-bang-mau.docx` | Color card immutable versions |
| module-2 | `3.5-Tai-lieu-san-xuat-tieng-Viet-san-pham.docx` | Product production document |
| module-3 | `1.1-tao-bang-nguyen-phu-lieu.md` | Official BOM root, ProductColor uniqueness/snapshots |
| module-3 | `2.1-nhap-danh-sach-nguyen-phu-lieu.md` | Master material + snapshot fields |
| module-3 | `2.2-nhap-dinh-muc.md` | R&D consumption/readiness |
| module-3 | `2.3-nhap-gia.md` | Accounting unit cost and sensitive data |
| module-3 | `2.4-duyet-va-chot.md` | BOM lifecycle/reject/reapproval |
| module-3 | `DEPENDENCY-module-2-mo-hinh-mau.md` | BOM belongs to a product color, not scalar legacy line color |
| module-4 | `Module4-Master-Data.md` | Material/group/size, stage/group, workshop, size chart |
| module-5 | `ADMINDashboard.md` | Query-only KPI and production plan dependency |
| module-6 | `6.1-Quan-tri-nguoi-dung.md` | User/role/security status |
| module-6 | `6.2-Cai-dat-tai-khoan.md` | Profile/session/notification |
| module-6 | `[Module 6] IT.md` | Module scope |
| module-7 | `7.1-ghi-nhan-lich-su-thay-doi.md` | Central append-only diff audit |
| module-7 | `7.2-xem-lai-lich-su.md` | Audit query/index/security |

## Conflict và cách xử lý

| Conflict | Quyết định target |
|---|---|
| `Final/PO_Final` trong code/dashboard cũ vs thuật ngữ Chốt | Schema dùng `closed`; legacy chỉ xuất hiện trong migration mapping. |
| Product hiện hành từng có một màu scalar, Module 2 yêu cầu nhiều màu, Module 3 cần BOM theo màu | Product 1–N ProductColor; BOM unique theo ProductColor. |
| Draft BOM Module 1 có version; BOM chính thức Module 3 quyết định không version | Giữ hai aggregate riêng, không gộp lifecycle. |
| Module 3 sửa sau Chốt nhưng không tạo bản mới | Update cùng BOM bằng transaction; audit diff và status history bảo toàn truy vết. |
| SizeChart sửa sau khi dùng có thể phá lịch sử | Product lưu size label snapshot; SizeChart có revision/supersedes cho dữ liệu mới. |
| Production Planning ngoài scope nhưng Dashboard cần progress | Chỉ mô hình hoá dependency tối thiểu, đánh dấu không mở rộng nghiệp vụ sản xuất. |

## Danh sách bảng

| # | Tên bảng | Nhóm / Module | Mô tả ngắn |
|---:|---|---|---|

| 1 | `users` | Module 6 - IT/IAM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 2 | `roles` | Module 6 - IT/IAM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 3 | `permissions` | Module 6 - IT/IAM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 4 | `user_roles` | Module 6 - IT/IAM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 5 | `role_permissions` | Module 6 - IT/IAM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 6 | `customers` | Module 2 - PO | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 7 | `material_groups` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 8 | `units` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 9 | `materials` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 10 | `stages` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 11 | `documents` | Document dùng chung | Định danh logic của một tài liệu xuyên suốt các phiên bản. |
| 12 | `document_versions` | Document dùng chung | Metadata file bất biến của từng phiên bản trong object storage. |
| 13 | `document_folders` | Document dùng chung | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 14 | `folder_documents` | Document dùng chung | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 15 | `styles` | Module 1 - Mẫu fit | Hồ sơ mẫu fit dùng lại làm nguồn kỹ thuật. |
| 16 | `style_documents` | Module 1 - Mẫu fit | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 17 | `style_operation_steps` | Module 1 - Mẫu fit | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 18 | `style_sample_rounds` | Module 1 - Mẫu fit | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 19 | `style_sample_images` | Module 1 - Mẫu fit | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 20 | `draft_bom_families` | Module 1 - NPL dự thảo | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 21 | `draft_bom_versions` | Module 1 - NPL dự thảo | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 22 | `draft_bom_lines` | Module 1 - NPL dự thảo | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 23 | `purchase_orders` | Module 2 - PO | Đơn hàng khách hàng và trạng thái tổng. |
| 24 | `purchase_order_status_history` | Module 2 - PO | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 25 | `purchase_order_documents` | Module 2 - PO | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 26 | `purchase_order_products` | Module 2 - Sản phẩm | Sản phẩm thuộc PO, có thể kế thừa snapshot từ mẫu fit. |
| 27 | `purchase_order_product_status_history` | Module 2 - Sản phẩm | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 28 | `purchase_order_product_documents` | Module 2 - Sản phẩm | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 29 | `purchase_order_product_colors` | Module 2 - Sản phẩm | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 30 | `purchase_order_product_color_sizes` | Module 2 - Sản phẩm | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 31 | `purchase_order_product_operation_steps` | Module 2 - Sản phẩm | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 32 | `purchase_order_product_sample_rounds` | Module 2 - May mẫu | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 33 | `purchase_order_product_sample_images` | Module 2 - May mẫu | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 34 | `product_color_cards` | Module 2 - Bảng màu | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 35 | `product_color_card_versions` | Module 2 - Bảng màu | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 36 | `production_documents` | Module 1/2 - Tài liệu SX | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 37 | `production_document_sections` | Module 1/2 - Tài liệu SX | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 38 | `production_document_size_rows` | Module 1/2 - Tài liệu SX | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 39 | `production_document_images` | Module 1/2 - Tài liệu SX | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 40 | `production_document_revisions` | Module 1/2 - Tài liệu SX | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 41 | `idempotency_keys` | Platform | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 42 | `material_sizes` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 43 | `stage_groups` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 44 | `stage_group_items` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 45 | `workshops` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 46 | `size_charts` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 47 | `size_chart_items` | Module 4 - Master Data | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 48 | `bills_of_materials` | Module 3 - BOM | Một bảng NPL chính thức duy nhất cho mỗi màu của sản phẩm. |
| 49 | `bill_of_material_lines` | Module 3 - BOM | Dòng vật tư, định mức và đơn giá theo phân quyền nghiệp vụ. |
| 50 | `bill_of_material_status_history` | Module 3 - BOM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 51 | `production_plans` | Module 5 - Dashboard dependency | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 52 | `production_plan_days` | Module 5 - Dashboard dependency | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 53 | `user_sessions` | Module 6 - IT/IAM | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 54 | `notification_catalog` | Module 6 - Notification | Danh mục sự kiện và mặc định kênh nhận. |
| 55 | `notification_catalog_roles` | Module 6 - Notification | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 56 | `notification_preferences` | Module 6 - Notification | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 57 | `notifications` | Module 6 - Notification | In-app inbox của từng người dùng. |
| 58 | `notification_deliveries` | Module 6 - Notification | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 59 | `outbox_events` | Platform/Notification | Lưu dữ liệu chuẩn hoá của domain và các ràng buộc liên quan. |
| 60 | `audit_events` | Module 7 - Audit | Sự kiện audit tập trung, append-only cho toàn hệ thống. |
| 61 | `audit_event_changes` | Module 7 - Audit | Diff field trước/sau của một sự kiện cập nhật. |

## Chi tiết từng bảng


### `users`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - IT/IAM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `email` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `password_hash` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `full_name` | `varchar(200)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `phone` | `varchar(20)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `avatar_url` | `varchar(500)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `must_change_password` | `boolean` | not null, default: `true` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `login_failed_count` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `lockout_until` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `last_login_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `roles`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - IT/IAM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `code` | `varchar(30)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `name` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_system` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `permissions`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - IT/IAM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `code` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `user_roles`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - IT/IAM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `user_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `role_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `assigned_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `assigned_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `role_permissions`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - IT/IAM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `role_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `permission_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `customers`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - PO.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `customer_code` | `varchar(50)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `customer_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `material_groups`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `code` | `varchar(50)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `name` | `varchar(150)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `units`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `code` | `varchar(30)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `name` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `decimal_scale` | `smallint` | not null, default: `4` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `materials`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `material_code` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_group_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `default_unit_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `stages`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `stage_code` | `varchar(50)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `stage_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `default_ssv` | `numeric(12` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `documents`

**Mục đích:** Định danh logic của một tài liệu xuyên suốt các phiên bản.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `document_code` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `title` | `varchar(500)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `current_version_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `archived_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `document_versions`

**Mục đích:** Metadata file bất biến của từng phiên bản trong object storage.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `version_no` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `original_file_name` | `varchar(500)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `storage_key` | `varchar(1000)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `mime_type` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `byte_size` | `bigint` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `sha256` | `char(64)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `upload_status` | not null, default: `'pending'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `change_reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `uploaded_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `uploaded_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `document_folders`

**Mục đích:** Thành phần chuẩn hoá thuộc Document dùng chung.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `parent_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `folder_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `folder_documents`

**Mục đích:** Thành phần chuẩn hoá thuộc Document dùng chung.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `folder_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `styles`

**Mục đích:** Hồ sơ mẫu fit dùng lại làm nguồn kỹ thuật.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `style_code` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `style_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `category` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `style_status` | not null, default: `'draft'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `base_image_version_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `as3b_cm_base_days` | `integer` | not null, default: `30` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `style_documents`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - Mẫu fit.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `style_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `purpose` | `document_purpose` | not null, default: `'other'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `style_operation_steps`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - Mẫu fit.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `style_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `parent_step_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `stage_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `step_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `time_per_piece` | `numeric(12` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `ssv` | `numeric(12` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `target_total` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_group` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `style_sample_rounds`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - Mẫu fit.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `style_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `round_no` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `sample_date` | `date` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `feedback` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `sample_status` | not null, default: `'working'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `reviewed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reviewed_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `style_sample_images`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - Mẫu fit.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `sample_round_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_version_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `color_name` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `draft_bom_families`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - NPL dự thảo.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `style_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `bom_code` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `draft_bom_versions`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - NPL dự thảo.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `family_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `parent_version_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `version_no` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `change_reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_current` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `draft_bom_lines`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1 - NPL dự thảo.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `version_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_name_snapshot` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_group_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `unit_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `consumption` | `numeric(18` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_orders`

**Mục đích:** Đơn hàng khách hàng và trạng thái tổng.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `po_code` | `varchar(50)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `customer_po_code` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `customer_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `customer_name_snapshot` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `received_date` | `date` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `po_status` | not null, default: `'draft'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `cancellation_reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `closed_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `closed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |
| `archived_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_status_history`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - PO.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `purchase_order_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `old_status` | `po_status` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `new_status` | `po_status` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `action` | `varchar(50)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `changed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `changed_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_documents`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - PO.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `purchase_order_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `purpose` | `document_purpose` | not null, default: `'other'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_products`

**Mục đích:** Sản phẩm thuộc PO, có thể kế thừa snapshot từ mẫu fit.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `purchase_order_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `source_style_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_code` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `category` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `deadline` | `date` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `structure_image_version_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `product_status` | not null, default: `'draft'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `previous_status` | `product_status` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `cancellation_reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `closed_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `closed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `as3b_cm_base_days` | `integer` | not null, default: `30` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `imported_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `imported_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `purchase_order_product_status_history`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Sản phẩm.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `old_status` | `product_status` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `new_status` | `product_status` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `action` | `varchar(50)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `changed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `changed_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_product_documents`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Sản phẩm.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `product_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `source_po_document` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `purpose` | `document_purpose` | not null, default: `'other'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `linked_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_product_colors`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Sản phẩm.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `color_name` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `color_code` | `varchar(50)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_product_color_sizes`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Sản phẩm.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_color_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `size_label` | `varchar(30)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `quantity` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_product_operation_steps`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Sản phẩm.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `source_style_step_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `parent_step_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `stage_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `step_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `time_per_piece` | `numeric(12` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `ssv` | `numeric(12` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `target_total` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_group` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_product_sample_rounds`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - May mẫu.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `source_style_sample_round_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `round_no` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `sample_date` | `date` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `feedback` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `sample_status` | not null, default: `'working'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `reviewed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reviewed_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `purchase_order_product_sample_images`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - May mẫu.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `sample_round_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_color_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_version_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `color_name_snapshot` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `product_color_cards`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Bảng màu.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_color_id` | `uuid` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `current_version_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `product_color_card_versions`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 2 - Bảng màu.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `color_card_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `version_no` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_version_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `replacement_reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `uploaded_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `uploaded_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `production_documents`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1/2 - Tài liệu SX.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `style_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `production_doc_status` | not null, default: `'draft'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `source_document_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `production_document_sections`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1/2 - Tài liệu SX.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `production_document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `section_code` | `varchar(40)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `title` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `content` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_fixed` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `production_document_size_rows`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1/2 - Tài liệu SX.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `production_document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `size_label` | `varchar(30)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `measurement_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `measurement_value` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `tolerance` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `production_document_images`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1/2 - Tài liệu SX.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `section_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `group_heading` | `varchar(255)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `heading_color` | `varchar(30)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `document_version_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `group_order` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `image_order` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `production_document_revisions`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 1/2 - Tài liệu SX.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `production_document_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `revision_no` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `action` | `varchar(30)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `source_document_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `idempotency_keys`

**Mục đích:** Thành phần chuẩn hoá thuộc Platform.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `scope` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `idempotency_key` | `varchar(200)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `request_hash` | `char(64)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `response_code` | `integer` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `resource_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `expires_at` | `timestamptz` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `material_sizes`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `material_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `size_code` | `varchar(20)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `barcode` | `varchar(50)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `unit_cost` | `numeric(18` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `current_stock` | `numeric(18` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `low_stock_threshold` | `numeric(18` | not null, default: `10` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `stage_groups`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `group_code` | `varchar(50)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `group_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `stage_group_items`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `stage_group_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `stage_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `name_snapshot` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `description_snapshot` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `ssv_snapshot` | `numeric(12` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `workshops`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `workshop_code` | `varchar(50)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `manager` | `varchar(200)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `location` | `varchar(255)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `daily_capacity` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `size_charts`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `name` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `record_status` | not null, default: `'active'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `revision_no` | `integer` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `supersedes_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `size_chart_items`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 4 - Master Data.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `size_chart_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `size_label` | `varchar(30)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `bills_of_materials`

**Mục đích:** Một bảng NPL chính thức duy nhất cho mỗi màu của sản phẩm.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `bom_code` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_color_id` | `uuid` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_code_snapshot` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `product_name_snapshot` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `color_name_snapshot` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `po_code_snapshot` | `varchar(50)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_quantity_snapshot` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `deadline` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `bom_status` | not null, default: `'draft'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `rd_note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `approved_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `approved_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `row_version` | `bigint` | not null, default: `1` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `bill_of_material_lines`

**Mục đích:** Dòng vật tư, định mức và đơn giá theo phân quyền nghiệp vụ.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `bill_of_material_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_name_snapshot` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `material_group_snapshot` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `unit_snapshot` | `varchar(50)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `consumption_per_unit` | `numeric(18` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `unit_cost` | `numeric(18` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `order_index` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `bill_of_material_status_history`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 3 - BOM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `bill_of_material_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `old_status` | `bom_status` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `new_status` | `bom_status` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `action` | `varchar(50)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `changed_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `changed_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `production_plans`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 5 - Dashboard dependency.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `product_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `workshop_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `plan_month` | `smallint` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `plan_year` | `smallint` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `planned_quantity` | `integer` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `start_date` | `date` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `end_date` | `date` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `note` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_by` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `production_plan_days`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 5 - Dashboard dependency.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `production_plan_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `plan_date` | `date` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `planned_quantity` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `actual_quantity` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_manual_override` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `user_sessions`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - IT/IAM.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `user_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `refresh_token_hash` | `char(64)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `user_agent` | `varchar(500)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `ip_address` | `inet` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `expires_at` | `timestamptz` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `revoked_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `revoke_reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `notification_catalog`

**Mục đích:** Danh mục sự kiện và mặc định kênh nhận.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `event_code` | `varchar(100)` | not null, unique | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `event_group` | `varchar(50)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `display_name` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `default_in_app` | `boolean` | not null, default: `true` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `default_email` | `boolean` | not null, default: `false` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `is_active` | `boolean` | not null, default: `true` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `notification_catalog_roles`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - Notification.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `notification_catalog_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `role_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `notification_preferences`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - Notification.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `user_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `notification_catalog_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `in_app_enabled` | `boolean` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `email_enabled` | `boolean` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `updated_at` | `timestamptz` | not null, default: `now()` | Thời điểm cập nhật gần nhất. |

### `notifications`

**Mục đích:** In-app inbox của từng người dùng.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `recipient_user_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `notification_catalog_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `title` | `varchar(255)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `body` | `text` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `entity_type` | `varchar(80)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `entity_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |
| `read_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `notification_deliveries`

**Mục đích:** Thành phần chuẩn hoá thuộc Module 6 - Notification.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `notification_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `channel` | `notification_channel` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `status` | `notification_delivery_status` | not null, default: `'pending'` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `attempt_count` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `last_error` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `next_attempt_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `sent_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `created_at` | `timestamptz` | not null, default: `now()` | Thời điểm tạo bản ghi. |

### `outbox_events`

**Mục đích:** Thành phần chuẩn hoá thuộc Platform/Notification.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `aggregate_type` | `varchar(80)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `aggregate_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `event_type` | `varchar(100)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `payload` | `jsonb` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `occurred_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `published_at` | `timestamptz` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `attempt_count` | `integer` | not null, default: `0` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `last_error` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `audit_events`

**Mục đích:** Sự kiện audit tập trung, append-only cho toàn hệ thống.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `uuid` | pk, default: `gen_random_uuid()` | Khoá định danh. |
| `occurred_at` | `timestamptz` | not null, default: `now()` | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `actor_user_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `actor_identifier` | `varchar(255)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `aggregate_type` | `varchar(80)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `aggregate_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `parent_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `event_type` | `audit_event_type` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `actor_role` | `varchar(30)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `target_label` | `varchar(500)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `reason` | `text` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `correlation_id` | `uuid` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `request_id` | `varchar(100)` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

### `audit_event_changes`

**Mục đích:** Diff field trước/sau của một sự kiện cập nhật.

| Field | Type | Constraint | Mô tả |
|---|---|---|---|

| `id` | `bigint` | pk | Khoá định danh. |
| `audit_event_id` | `uuid` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `field_name` | `varchar(150)` | not null | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `old_value` | `jsonb` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |
| `new_value` | `jsonb` | Nullable theo nghiệp vụ | Thuộc tính nghiệp vụ/kiểm soát của bảng. |

## Quan hệ giữa các bảng

| Từ bảng | Field | Đến bảng | Loại | ON DELETE |
|---|---|---|---|---|

| `user_roles` | `user_id` | `users.id` | N–1 | CASCADE |
| `user_roles` | `role_id` | `roles.id` | N–1 | RESTRICT |
| `user_roles` | `assigned_by` | `users.id` | N–1 | SET NULL |
| `role_permissions` | `role_id` | `roles.id` | N–1 | CASCADE |
| `role_permissions` | `permission_id` | `permissions.id` | N–1 | CASCADE |
| `materials` | `material_group_id` | `material_groups.id` | N–1 | RESTRICT |
| `materials` | `default_unit_id` | `units.id` | N–1 | RESTRICT |
| `documents` | `created_by` | `users.id` | N–1 | SET NULL |
| `document_versions` | `document_id` | `documents.id` | N–1 | RESTRICT |
| `document_versions` | `uploaded_by` | `users.id` | N–1 | SET NULL |
| `document_folders` | `parent_id` | `document_folders.id` | N–1 | RESTRICT |
| `document_folders` | `created_by` | `users.id` | N–1 | SET NULL |
| `folder_documents` | `folder_id` | `document_folders.id` | N–1 | CASCADE |
| `folder_documents` | `document_id` | `documents.id` | N–1 | RESTRICT |
| `folder_documents` | `linked_by` | `users.id` | N–1 | SET NULL |
| `styles` | `base_image_version_id` | `document_versions.id` | N–1 | SET NULL |
| `styles` | `created_by` | `users.id` | N–1 | SET NULL |
| `styles` | `updated_by` | `users.id` | N–1 | SET NULL |
| `style_documents` | `style_id` | `styles.id` | N–1 | CASCADE |
| `style_documents` | `document_id` | `documents.id` | N–1 | RESTRICT |
| `style_documents` | `linked_by` | `users.id` | N–1 | SET NULL |
| `style_operation_steps` | `style_id` | `styles.id` | N–1 | CASCADE |
| `style_operation_steps` | `parent_step_id` | `style_operation_steps.id` | N–1 | RESTRICT |
| `style_operation_steps` | `stage_id` | `stages.id` | N–1 | RESTRICT |
| `style_sample_rounds` | `style_id` | `styles.id` | N–1 | CASCADE |
| `style_sample_rounds` | `created_by` | `users.id` | N–1 | SET NULL |
| `style_sample_rounds` | `reviewed_by` | `users.id` | N–1 | SET NULL |
| `style_sample_images` | `sample_round_id` | `style_sample_rounds.id` | N–1 | CASCADE |
| `style_sample_images` | `document_version_id` | `document_versions.id` | N–1 | RESTRICT |
| `draft_bom_families` | `style_id` | `styles.id` | N–1 | CASCADE |
| `draft_bom_families` | `created_by` | `users.id` | N–1 | SET NULL |
| `draft_bom_versions` | `family_id` | `draft_bom_families.id` | N–1 | CASCADE |
| `draft_bom_versions` | `parent_version_id` | `draft_bom_versions.id` | N–1 | RESTRICT |
| `draft_bom_versions` | `created_by` | `users.id` | N–1 | SET NULL |
| `draft_bom_lines` | `version_id` | `draft_bom_versions.id` | N–1 | CASCADE |
| `draft_bom_lines` | `material_id` | `materials.id` | N–1 | RESTRICT |
| `draft_bom_lines` | `material_group_id` | `material_groups.id` | N–1 | RESTRICT |
| `draft_bom_lines` | `unit_id` | `units.id` | N–1 | RESTRICT |
| `purchase_orders` | `customer_id` | `customers.id` | N–1 | RESTRICT |
| `purchase_orders` | `closed_by` | `users.id` | N–1 | SET NULL |
| `purchase_orders` | `created_by` | `users.id` | N–1 | SET NULL |
| `purchase_orders` | `updated_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_status_history` | `purchase_order_id` | `purchase_orders.id` | N–1 | RESTRICT |
| `purchase_order_status_history` | `changed_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_documents` | `purchase_order_id` | `purchase_orders.id` | N–1 | CASCADE |
| `purchase_order_documents` | `document_id` | `documents.id` | N–1 | RESTRICT |
| `purchase_order_documents` | `linked_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_products` | `purchase_order_id` | `purchase_orders.id` | N–1 | RESTRICT |
| `purchase_order_products` | `source_style_id` | `styles.id` | N–1 | SET NULL |
| `purchase_order_products` | `structure_image_version_id` | `document_versions.id` | N–1 | SET NULL |
| `purchase_order_products` | `closed_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_products` | `imported_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_products` | `created_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_products` | `updated_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_product_status_history` | `product_id` | `purchase_order_products.id` | N–1 | RESTRICT |
| `purchase_order_product_status_history` | `changed_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_product_documents` | `product_id` | `purchase_order_products.id` | N–1 | CASCADE |
| `purchase_order_product_documents` | `document_id` | `documents.id` | N–1 | RESTRICT |
| `purchase_order_product_documents` | `linked_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_product_colors` | `product_id` | `purchase_order_products.id` | N–1 | CASCADE |
| `purchase_order_product_color_sizes` | `product_color_id` | `purchase_order_product_colors.id` | N–1 | CASCADE |
| `purchase_order_product_operation_steps` | `product_id` | `purchase_order_products.id` | N–1 | CASCADE |
| `purchase_order_product_operation_steps` | `source_style_step_id` | `style_operation_steps.id` | N–1 | SET NULL |
| `purchase_order_product_operation_steps` | `parent_step_id` | `purchase_order_product_operation_steps.id` | N–1 | RESTRICT |
| `purchase_order_product_operation_steps` | `stage_id` | `stages.id` | N–1 | RESTRICT |
| `purchase_order_product_sample_rounds` | `product_id` | `purchase_order_products.id` | N–1 | CASCADE |
| `purchase_order_product_sample_rounds` | `source_style_sample_round_id` | `style_sample_rounds.id` | N–1 | SET NULL |
| `purchase_order_product_sample_rounds` | `created_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_product_sample_rounds` | `reviewed_by` | `users.id` | N–1 | SET NULL |
| `purchase_order_product_sample_images` | `sample_round_id` | `purchase_order_product_sample_rounds.id` | N–1 | CASCADE |
| `purchase_order_product_sample_images` | `product_color_id` | `purchase_order_product_colors.id` | N–1 | RESTRICT |
| `purchase_order_product_sample_images` | `document_version_id` | `document_versions.id` | N–1 | RESTRICT |
| `product_color_cards` | `product_color_id` | `purchase_order_product_colors.id` | N–1 | CASCADE |
| `product_color_card_versions` | `color_card_id` | `product_color_cards.id` | N–1 | CASCADE |
| `product_color_card_versions` | `document_version_id` | `document_versions.id` | N–1 | RESTRICT |
| `product_color_card_versions` | `uploaded_by` | `users.id` | N–1 | SET NULL |
| `production_documents` | `style_id` | `styles.id` | N–1 | CASCADE |
| `production_documents` | `product_id` | `purchase_order_products.id` | N–1 | CASCADE |
| `production_documents` | `source_document_id` | `production_documents.id` | N–1 | SET NULL |
| `production_documents` | `created_by` | `users.id` | N–1 | SET NULL |
| `production_documents` | `updated_by` | `users.id` | N–1 | SET NULL |
| `production_document_sections` | `production_document_id` | `production_documents.id` | N–1 | CASCADE |
| `production_document_size_rows` | `production_document_id` | `production_documents.id` | N–1 | CASCADE |
| `production_document_images` | `section_id` | `production_document_sections.id` | N–1 | CASCADE |
| `production_document_images` | `document_version_id` | `document_versions.id` | N–1 | RESTRICT |
| `production_document_revisions` | `production_document_id` | `production_documents.id` | N–1 | RESTRICT |
| `production_document_revisions` | `source_document_id` | `production_documents.id` | N–1 | SET NULL |
| `production_document_revisions` | `created_by` | `users.id` | N–1 | SET NULL |
| `material_sizes` | `material_id` | `materials.id` | N–1 | RESTRICT |
| `stage_group_items` | `stage_group_id` | `stage_groups.id` | N–1 | CASCADE |
| `stage_group_items` | `stage_id` | `stages.id` | N–1 | RESTRICT |
| `size_charts` | `supersedes_id` | `size_charts.id` | N–1 | RESTRICT |
| `size_chart_items` | `size_chart_id` | `size_charts.id` | N–1 | CASCADE |
| `bills_of_materials` | `product_color_id` | `purchase_order_product_colors.id` | N–1 | RESTRICT |
| `bills_of_materials` | `approved_by` | `users.id` | N–1 | SET NULL |
| `bills_of_materials` | `created_by` | `users.id` | N–1 | SET NULL |
| `bills_of_materials` | `updated_by` | `users.id` | N–1 | SET NULL |
| `bill_of_material_lines` | `bill_of_material_id` | `bills_of_materials.id` | N–1 | CASCADE |
| `bill_of_material_lines` | `material_id` | `materials.id` | N–1 | RESTRICT |
| `bill_of_material_status_history` | `bill_of_material_id` | `bills_of_materials.id` | N–1 | RESTRICT |
| `bill_of_material_status_history` | `changed_by` | `users.id` | N–1 | SET NULL |
| `production_plans` | `product_id` | `purchase_order_products.id` | N–1 | RESTRICT |
| `production_plans` | `workshop_id` | `workshops.id` | N–1 | RESTRICT |
| `production_plans` | `created_by` | `users.id` | N–1 | SET NULL |
| `production_plan_days` | `production_plan_id` | `production_plans.id` | N–1 | CASCADE |
| `user_sessions` | `user_id` | `users.id` | N–1 | CASCADE |
| `notification_catalog_roles` | `notification_catalog_id` | `notification_catalog.id` | N–1 | CASCADE |
| `notification_catalog_roles` | `role_id` | `roles.id` | N–1 | CASCADE |
| `notification_preferences` | `user_id` | `users.id` | N–1 | CASCADE |
| `notification_preferences` | `notification_catalog_id` | `notification_catalog.id` | N–1 | CASCADE |
| `notifications` | `recipient_user_id` | `users.id` | N–1 | CASCADE |
| `notifications` | `notification_catalog_id` | `notification_catalog.id` | N–1 | RESTRICT |
| `notification_deliveries` | `notification_id` | `notifications.id` | N–1 | CASCADE |
| `audit_events` | `actor_user_id` | `users.id` | N–1 | SET NULL |
| `audit_event_changes` | `audit_event_id` | `audit_events.id` | N–1 | CASCADE |
| `documents` | `current_version_id` | `document_versions.id` | N–1 | RESTRICT |
| `product_color_cards` | `current_version_id` | `product_color_card_versions.id` | N–1 | RESTRICT |

## Enum Types

| Enum | Giá trị | Dùng ở |
|---|---|---|

| `record_status` | `active`, `inactive` | users, customers, material_groups, units, materials, stages, material_sizes, stage_groups, workshops, size_charts |
| `po_status` | `draft`, `pending_rd`, `in_progress`, `closed`, `cancelled` | purchase_orders, purchase_order_status_history |
| `product_status` | `draft`, `in_review`, `sampling`, `closed`, `cancelled` | purchase_order_products, purchase_order_product_status_history |
| `style_status` | `draft`, `active` | styles |
| `sample_status` | `working`, `needs_revision`, `approved` | style_sample_rounds, purchase_order_product_sample_rounds |
| `production_doc_status` | `draft`, `in_progress`, `completed` | production_documents |
| `upload_status` | `pending`, `ready`, `failed`, `quarantined` | document_versions |
| `document_purpose` | `po_original`, `tech_pack`, `material_pdf`, `sample_image`, `translation`, `color_card`, `production_doc`, `avatar`, `other` | style_documents, purchase_order_documents, purchase_order_product_documents |
| `bom_status` | `draft`, `wait_rd`, `wait_tpkh_confirm`, `wait_accounting`, `wait_sa_approve`, `closed` | bills_of_materials, bill_of_material_status_history |
| `notification_channel` | `in_app`, `email` | notification_deliveries |
| `notification_delivery_status` | `pending`, `sent`, `failed`, `skipped` | notification_deliveries |
| `audit_event_type` | `created`, `updated`, `deleted`, `status_changed`, `approved`, `rejected`, `document_linked`, `document_unlinked`, `document_version_added`, `copied`, `synced`, `login`, `password_changed`, `role_changed` | audit_events |

## Indexes

| Bảng/Index | Field(s) | Lý do |
|---|---|---|

| `draft_bom_versions` / `uq_draft_bom_one_current` | `family_id` | Phục vụ list/filter/history/queue theo query pattern; partial: is_current. |
| `production_documents` / `uq_style_prod_doc` | `style_id` | Phục vụ list/filter/history/queue theo query pattern; partial: style_id IS NOT NULL. |
| `production_documents` / `uq_product_prod_doc` | `product_id` | Phục vụ list/filter/history/queue theo query pattern; partial: product_id IS NOT NULL. |
| `purchase_orders` / `ix_po_list` | `status,created_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; partial: archived_at IS NULL. |
| `purchase_orders` / `ix_po_customer_date` | `customer_id,received_date DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; partial: archived_at IS NULL. |
| `purchase_order_products` / `ix_product_po_status` | `purchase_order_id,status,created_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `document_versions` / `ix_doc_version_latest` | `document_id,version_no DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `style_documents` / `ix_style_docs_document` | `document_id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `purchase_order_documents` / `ix_po_docs_document` | `document_id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `purchase_order_product_documents` / `ix_product_docs_document` | `document_id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `style_operation_steps` / `ix_style_steps_export` | `style_id,order_index` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `purchase_order_product_operation_steps` / `ix_product_steps_export` | `product_id,order_index` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `style_sample_rounds` / `ix_style_sample_history` | `style_id,round_no DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `purchase_order_product_sample_rounds` / `ix_product_sample_history` | `product_id,round_no DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `purchase_order_status_history` / `ix_po_status_history` | `purchase_order_id,changed_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `purchase_order_product_status_history` / `ix_product_status_history` | `product_id,changed_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `audit_events` / `ix_audit_aggregate` | `aggregate_type,aggregate_id,occurred_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `audit_events` / `ix_audit_time` | `occurred_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `idempotency_keys` / `ix_idempotency_expiry` | `expires_at` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `user_roles` / `uq_user_single_role` | `user_id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `materials` / `ix_material_active_lookup` | `status,material_name,id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `material_sizes` / `ix_material_size_lookup` | `material_id,status,size_code` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `stages` / `ix_stage_active_lookup` | `status,stage_name,id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `workshops` / `ix_workshop_active_lookup` | `status,name,id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `bills_of_materials` / `ix_bom_pipeline` | `status,deadline,id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `bills_of_materials` / `ix_bom_product_color` | `product_color_id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `bill_of_material_status_history` / `ix_bom_status_history` | `bill_of_material_id,changed_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `production_plans` / `ix_plan_period` | `plan_year,plan_month,workshop_id,id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `production_plan_days` / `ix_plan_day_date` | `plan_date,production_plan_id` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `user_sessions` / `ix_active_sessions` | `user_id,expires_at DESC` | Phục vụ list/filter/history/queue theo query pattern; partial: revoked_at IS NULL. |
| `notifications` / `ix_notification_inbox` | `recipient_user_id,created_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; full index. |
| `notifications` / `ix_notification_unread` | `recipient_user_id,created_at DESC,id DESC` | Phục vụ list/filter/history/queue theo query pattern; partial: read_at IS NULL. |
| `notification_deliveries` / `ix_delivery_queue` | `status,next_attempt_at,id` | Phục vụ list/filter/history/queue theo query pattern; partial: status IN ('pending','failed'). |
| `outbox_events` / `ix_outbox_unpublished` | `occurred_at,id` | Phục vụ list/filter/history/queue theo query pattern; partial: published_at IS NULL. |

## Quyết định thiết kế

- **UUID:** giữ tương thích code hiện tại; ứng dụng nên sinh UUIDv7, `gen_random_uuid()` là fallback PostgreSQL 15.
- **Document dùng chung:** một logical document có nhiều immutable version; junction riêng theo owner để mọi FK đều kiểm chứng được.
- **BOM chính thức không version:** đúng quyết định Module 3; lịch sử thay đổi nằm ở audit diff và status history.
- **Snapshot:** PO/Product/BOM line lưu nhãn cần thiết để Master đổi sau này không sửa lịch sử.
- **Không JSON cho business structure:** section, size, ảnh, color, BOM line đều là bảng; JSONB chỉ dùng payload outbox và audit value động.
- **Chốt:** vocabulary mục tiêu là `closed`; `Final/PO_Final/Approved` trong code cũ chỉ là dữ liệu migration.
- **Dashboard:** tính từ source tables; chỉ cân nhắc materialized view sau khi đo query thực tế.


## Gap cần xác nhận

1. Công thức KIM và việc áp dụng hao hụt 3% vào số lượng mua/thành tiền.
2. Định mức BOM có tách theo size hay dùng chung theo màu/sản phẩm.
3. Yêu cầu sửa BOM sau Chốt có cần entity/form theo dõi riêng hay là quy trình ngoài hệ thống.
4. Cơ chế tạo/gán role SA và ma trận permission chi tiết.
5. Retention của audit, document version và notification.
6. Production Planning đang ngoài scope build nhưng Dashboard cần dữ liệu; hai bảng plan được đánh dấu dependency tối thiểu.
