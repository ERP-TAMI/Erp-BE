import { BadRequestException } from '@nestjs/common';
import {
  assertAllowedFile,
  DEFAULT_MAX_UPLOAD_SIZE_BYTES,
} from './file-validation';

describe('assertAllowedFile', () => {
  it('does not throw for a valid PDF within the size limit', () => {
    expect(() =>
      assertAllowedFile('report.pdf', 'application/pdf', 1024),
    ).not.toThrow();
  });

  it('throws when the extension is not in the allowlist', () => {
    expect(() =>
      assertAllowedFile('script.exe', 'application/octet-stream', 1024),
    ).toThrow(BadRequestException);
  });

  it('throws when the mimetype does not match the extension', () => {
    expect(() => assertAllowedFile('report.pdf', 'image/png', 1024)).toThrow(
      BadRequestException,
    );
  });

  it('throws when the file exceeds the default max size', () => {
    expect(() =>
      assertAllowedFile(
        'report.pdf',
        'application/pdf',
        DEFAULT_MAX_UPLOAD_SIZE_BYTES + 1,
      ),
    ).toThrow(BadRequestException);
  });

  it('honors a custom allowlist and max size passed via opts', () => {
    expect(() =>
      assertAllowedFile('data.csv', 'text/csv', 5 * 1024 * 1024, {
        allowlist: { '.csv': ['text/csv'] },
        maxSizeBytes: 10 * 1024 * 1024,
      }),
    ).not.toThrow();

    expect(() =>
      assertAllowedFile('report.pdf', 'application/pdf', 1024, {
        allowlist: { '.csv': ['text/csv'] },
      }),
    ).toThrow(BadRequestException);
  });
});
