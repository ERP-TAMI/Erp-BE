/**
 * Khóa dạng `/uploads/...` là di sản từ thời tệp được lưu trên ổ đĩa server.
 * Các tệp đó không nằm trên S3, nên đem đi ký URL sẽ tạo ra một link trỏ vào
 * key không tồn tại — S3 trả AccessDenied (chứ không phải 404, vì IAM user
 * không có quyền s3:ListBucket), khiến lỗi trông như thiếu quyền.
 *
 * Dùng hàm này để bỏ qua chúng thay vì sinh ra link hỏng.
 *
 * Xem `npm run migrate:legacy-uploads` để chuyển dữ liệu cũ lên S3.
 */
export function isLegacyLocalStorageKey(
  key: string | null | undefined,
): boolean {
  if (!key) return false;
  return /^\/?uploads\//i.test(key.trim());
}

/**
 * Khóa có dùng được với S3 không: có giá trị và không phải đường dẫn ổ đĩa cũ.
 */
export function isResolvableObjectKey(
  key: string | null | undefined,
): key is string {
  return Boolean(key) && !isLegacyLocalStorageKey(key);
}

/**
 * `confirm` chỉ nên chấp nhận objectKey nằm trong prefix mà chính endpoint đó
 * đã presign — nếu không check, client có thể confirm bất kỳ objectKey nào
 * đã tồn tại trên S3 (kể cả của một bản ghi khác) vào bản ghi hiện tại.
 */
export function isObjectKeyInScope(
  objectKey: string,
  expectedPrefix: string,
): boolean {
  return objectKey.startsWith(expectedPrefix);
}
