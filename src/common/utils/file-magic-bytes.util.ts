import { BadRequestException } from '@nestjs/common';

/** Đủ cho mọi chữ ký magic (dài nhất 12 byte) và cho mẫu 4096 byte của tệp văn bản. */
export const MAGIC_BYTES_SAMPLE_SIZE = 4096;

/** Các đuôi mà bộ kiểm tra quét toàn bộ nội dung, không chỉ phần đầu. */
export const TEXT_EXTENSIONS_SCANNED_IN_FULL = new Set(['.txt', '.csv']);

/**
 * Xác nhận nội dung thật của tệp (đọc từ S3 sau khi client PUT xong) khớp với
 * phần mở rộng đã khai báo — client tự khai `mimeType`/tên tệp, một tệp HTML/
 * script đổi tên đuôi `.pdf` vẫn qua được `assertAllowedFile()` vì hàm đó chỉ
 * so tên/mimeType, không đọc nội dung.
 */
export function validateFileMagicBytes(ext: string, buffer: Buffer): void {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Tệp rỗng hoặc không có dữ liệu.');
  }

  const normalizedExt = (ext || '').toLowerCase();

  switch (normalizedExt) {
    case '.pdf': {
      if (
        buffer.length < 4 ||
        buffer.subarray(0, 4).toString('ascii') !== '%PDF'
      ) {
        throw new BadRequestException(
          'Tệp không phải là định dạng PDF hợp lệ (chữ ký magic bytes không khớp).',
        );
      }
      break;
    }

    case '.png': {
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (
        buffer.length < 8 ||
        !pngSignature.every((byte, i) => buffer[i] === byte)
      ) {
        throw new BadRequestException(
          'Tệp không phải là định dạng PNG hợp lệ (chữ ký magic bytes không khớp).',
        );
      }
      break;
    }

    case '.jpg':
    case '.jpeg': {
      if (
        buffer.length < 3 ||
        buffer[0] !== 0xff ||
        buffer[1] !== 0xd8 ||
        buffer[2] !== 0xff
      ) {
        throw new BadRequestException(
          'Tệp không phải là định dạng JPEG/JPG hợp lệ (chữ ký magic bytes không khớp).',
        );
      }
      break;
    }

    case '.gif': {
      if (buffer.length < 6) {
        throw new BadRequestException(
          'Tệp không phải là định dạng GIF hợp lệ.',
        );
      }
      const header = buffer.subarray(0, 6).toString('ascii');
      if (header !== 'GIF87a' && header !== 'GIF89a') {
        throw new BadRequestException(
          'Tệp không phải là định dạng GIF hợp lệ (chữ ký magic bytes không khớp).',
        );
      }
      break;
    }

    case '.webp': {
      if (
        buffer.length < 12 ||
        buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
        buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
      ) {
        throw new BadRequestException(
          'Tệp không phải là định dạng WEBP hợp lệ (chữ ký magic bytes không khớp).',
        );
      }
      break;
    }

    case '.docx':
    case '.xlsx': {
      // Office Open XML (DOCX, XLSX) là ZIP archive: PK\x03\x04 (hex: 50 4B 03 04)
      if (
        buffer.length < 4 ||
        buffer[0] !== 0x50 ||
        buffer[1] !== 0x4b ||
        buffer[2] !== 0x03 ||
        buffer[3] !== 0x04
      ) {
        throw new BadRequestException(
          `Tệp không phải là định dạng ${normalizedExt.toUpperCase()} hợp lệ (chữ ký magic bytes không khớp).`,
        );
      }
      break;
    }

    case '.doc':
    case '.xls': {
      // OLE Compound File: D0 CF 11 E0 A1 B1 1A E1
      const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
      if (
        buffer.length < 8 ||
        !oleSignature.every((byte, i) => buffer[i] === byte)
      ) {
        throw new BadRequestException(
          `Tệp không phải là định dạng ${normalizedExt.toUpperCase()} hợp lệ (chữ ký magic bytes không khớp).`,
        );
      }
      break;
    }

    case '.csv':
    case '.txt': {
      // Với tệp văn bản: chặn NUL byte và HTML/script trá hình
      if (buffer.includes(0x00)) {
        throw new BadRequestException(
          `Tệp văn bản "${normalizedExt}" chứa ký tự nhị phân không hợp lệ.`,
        );
      }
      const textSample = buffer
        .subarray(0, Math.min(buffer.length, 4096))
        .toString('utf-8')
        .toLowerCase();
      if (
        textSample.includes('<script') ||
        textSample.includes('<html') ||
        textSample.includes('<!doctype') ||
        textSample.includes('<iframe') ||
        textSample.includes('<svg')
      ) {
        throw new BadRequestException(
          `Tệp văn bản "${normalizedExt}" chứa mã HTML/Script không được phép.`,
        );
      }
      break;
    }

    default:
      throw new BadRequestException(
        `Định dạng tệp "${normalizedExt}" không được hỗ trợ để tải lên.`,
      );
  }
}
