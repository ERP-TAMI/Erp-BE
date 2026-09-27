import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

export const DEFAULT_UPLOAD_MIME_ALLOWLIST: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
};

export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

export interface AssertAllowedFileOptions {
  allowlist?: Record<string, string[]>;
  maxSizeBytes?: number;
}

export function assertAllowedFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  opts: AssertAllowedFileOptions = {},
): void {
  const allowlist = opts.allowlist ?? DEFAULT_UPLOAD_MIME_ALLOWLIST;
  const maxSizeBytes = opts.maxSizeBytes ?? DEFAULT_MAX_UPLOAD_SIZE_BYTES;

  const ext = extname(fileName || '').toLowerCase();
  const allowedMimes = allowlist[ext];
  if (!allowedMimes) {
    throw new BadRequestException(
      `Định dạng phần mở rộng "${ext || 'không có'}" không được hỗ trợ. Chỉ chấp nhận: ${Object.keys(allowlist).join(', ')}.`,
    );
  }

  const cleanMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (!allowedMimes.includes(cleanMime)) {
    throw new BadRequestException(
      `Định dạng tệp không khớp phần mở rộng "${ext}". Vui lòng kiểm tra lại tệp.`,
    );
  }

  if (sizeBytes > maxSizeBytes) {
    throw new BadRequestException(
      `Dung lượng tệp vượt quá giới hạn ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`,
    );
  }
}
