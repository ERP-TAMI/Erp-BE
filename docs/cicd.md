# CI/CD ứng dụng

PR vào `dev` → CI xanh → merge → **Deploy application** tự deploy dev. `main` dành cho prod ở account riêng. Thiết lập account mới là việc một lần của người quản trị infra.

## Điều kiện merge và deploy

- Lint, typecheck/build, unit test; BE thêm migration/E2E và production image scan.
- Trivy source kiểm tra mọi mức CVE, **cả devDependencies**, không bỏ qua lỗi chưa có bản vá.
- Trivy image BE kiểm tra OS/runtime và dependencies trong image thực tế.
- Gitleaks kiểm tra commit mới và toàn bộ tracked source.
- Required checks trên dev/main phải thành công; lỗi scanner không được coi là sạch.
- CI chạy lại trên commit merge trước CD. PR không có quyền deploy.

## Artifact và cấu hình

FE upload đúng dist đã build trong CI; release.json ghi commit, index upload cuối, giữ hashed assets cũ rồi invalidate và kiểm tra CloudFront.

BE build một image trong release job → scan → push tag bất biến → deploy digest qua SSM document Terraform quản lý. API lỗi readiness thì rollback image; migration không tự rollback DB.

GitHub environment dev chỉ branch dev; prod chỉ main. Mỗi environment có AWS_ROLE_ARN, AWS_REGION, DEPLOYMENT_CONFIG_PARAMETER. Dùng OIDC, không AWS access key. SSM metadata do Terraform công bố; script kiểm tra account/region/environment trước deploy. Prod chưa cấu hình sẽ fail thay vì deploy nhầm dev.

## Blocker 2026-10-04

Đã cập nhật các dependency có bản vá. Còn **braces 3.0.3 / CVE-2026-93687 (HIGH)** trong công cụ build/test, chưa có fixed version. CI giữ fail theo chính sách, không ignore CVE để lấy màu xanh.

Upstream: https://github.com/micromatch/braces/issues/70 (PR vá #72, #75 chưa merge). Ngoại lệ có hạn ở `.trivyignore.yaml`: chỉ source scan, chỉ CVE này, hết hạn 2026-11-03 thì CI đỏ lại để xem xét. Image scan production không dùng ngoại lệ. Scanner xanh chỉ phản ánh lỗ hổng đã biết.
