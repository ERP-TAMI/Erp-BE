/**
 * Chống HTML/script chèn vào các trường ghi chú tự do (rdNote, note...).
 * React tự escape khi render nên hiện chưa có nơi nào bị khai thác qua UI,
 * nhưng đây là dữ liệu lưu lâu dài — nếu sau này có chỗ khác render bằng
 * innerHTML (export, email, tool nội bộ khác...) thì phải chặn ngay tại nguồn.
 */
export function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}
