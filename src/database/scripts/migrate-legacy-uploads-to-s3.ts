import 'dotenv/config';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AppDataSource } from '../data-source';

/**
 * Đẩy các tệp còn sót trên ổ đĩa server lên S3 rồi cập nhật `storage_key`.
 *
 * Bối cảnh: trước đây bốn endpoint upload của PO ghi tệp xuống thư mục
 * `uploads/` và lưu `storage_key` dạng `/uploads/po-documents/<tên tệp>`, trong
 * khi đường đọc luôn ký URL S3. Hệ quả là mọi tệp đi qua các endpoint đó đều
 * không mở xem được — S3 trả AccessDenied (chứ không phải 404, vì IAM user
 * không có quyền s3:ListBucket nên AWS che giấu việc key không tồn tại).
 *
 * Các endpoint đó đã bị gỡ; script này dọn nốt dữ liệu cũ.
 *
 * Chạy thử:  npm run migrate:legacy-uploads -- --dry-run
 * Chạy thật: npm run migrate:legacy-uploads
 */

type LegacyRow = {
  id: string;
  storage_key: string;
  mime_type: string;
  original_file_name: string;
  purchase_order_id: string | null;
  purpose: string | null;
};

const isDryRun = process.argv.includes('--dry-run');

/** Thư mục `uploads/` nằm ở gốc dự án, cạnh `src/`. */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function buildObjectKey(row: LegacyRow): string {
  const ext =
    path.extname(row.storage_key) || path.extname(row.original_file_name);
  if (row.purchase_order_id) {
    const purpose = row.purpose || 'other';
    return `purchase-orders/${row.purchase_order_id}/documents/${purpose}/${randomUUID()}${ext}`;
  }
  // Bản ghi không còn gắn với PO nào — vẫn đưa lên S3 để không còn key trỏ ổ đĩa.
  return `legacy/documents/${randomUUID()}${ext}`;
}

/** `/uploads/po-documents/x.pdf` -> đường dẫn tuyệt đối trên máy. */
function resolveLocalPath(storageKey: string): string {
  return path.join(PROJECT_ROOT, storageKey.replace(/^[/\\]+/, ''));
}

async function main(): Promise<void> {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_S3_REGION;
  const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Thiếu cấu hình S3. Cần AWS_S3_BUCKET, AWS_S3_REGION, AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY trong .env',
    );
  }

  const endpoint = process.env.AWS_S3_ENDPOINT;
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  await AppDataSource.initialize();
  console.log(isDryRun ? '— CHẠY THỬ, không ghi gì —' : '— CHẠY THẬT —');

  try {
    const rows: LegacyRow[] = await AppDataSource.query(`
      SELECT dv.id,
             dv.storage_key,
             dv.mime_type,
             dv.original_file_name,
             pod.purchase_order_id,
             pod.purpose::text AS purpose
      FROM document_versions dv
      JOIN documents d ON d.id = dv.document_id
      LEFT JOIN purchase_order_documents pod ON pod.document_id = d.id
      WHERE dv.storage_key LIKE '/uploads/%'
         OR dv.storage_key LIKE 'uploads/%'
      ORDER BY dv.uploaded_at
    `);

    if (rows.length === 0) {
      console.log('Không còn bản ghi nào trỏ vào ổ đĩa. Không cần làm gì.');
      return;
    }

    console.log(`Tìm thấy ${rows.length} bản ghi cần chuyển.\n`);

    let migrated = 0;
    const skipped: string[] = [];

    for (const row of rows) {
      const localPath = resolveLocalPath(row.storage_key);
      const label = `${row.original_file_name} (${row.id})`;

      let buffer: Buffer;
      try {
        buffer = await fsPromises.readFile(localPath);
      } catch {
        // Tệp đã mất khỏi ổ đĩa — không thể khôi phục. Giữ nguyên storage_key
        // để còn dấu vết truy nguyên, thay vì trỏ tới một key S3 rỗng.
        skipped.push(`${label} — không thấy tệp tại ${localPath}`);
        continue;
      }

      const objectKey = buildObjectKey(row);
      console.log(`  ${label}`);
      console.log(`    ${row.storage_key}`);
      console.log(`    -> ${objectKey}  (${buffer.byteLength} bytes)`);

      if (isDryRun) {
        migrated += 1;
        continue;
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: row.mime_type,
        }),
      );

      await AppDataSource.query(
        'UPDATE document_versions SET storage_key = $1 WHERE id = $2',
        [objectKey, row.id],
      );
      migrated += 1;
    }

    console.log(
      `\nXong: ${migrated} chuyển thành công, ${skipped.length} bỏ qua.`,
    );
    if (skipped.length > 0) {
      console.log('\nBỏ qua:');
      for (const s of skipped) console.log(`  - ${s}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Lỗi khi chuyển dữ liệu:', err);
  process.exit(1);
});
