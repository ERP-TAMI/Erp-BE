import {
  isLegacyLocalStorageKey,
  isResolvableObjectKey,
} from './storage-key.util';

describe('storage-key.util', () => {
  describe('isLegacyLocalStorageKey', () => {
    it.each([
      '/uploads/po-documents/abc.pdf',
      'uploads/style-images/abc.jpg',
      '/Uploads/po-documents/abc.pdf',
      '  /uploads/img-1.png  ',
    ])('nhận ra đường dẫn ổ đĩa cũ: %s', (key) => {
      expect(isLegacyLocalStorageKey(key)).toBe(true);
    });

    it.each([
      'purchase-orders/po-1/documents/other/abc.pdf',
      'styles/style-1/documents/sample_image/abc.jpeg',
      'legacy/documents/abc.pdf',
    ])('không nhầm khóa S3 hợp lệ: %s', (key) => {
      expect(isLegacyLocalStorageKey(key)).toBe(false);
    });

    it('coi null/undefined/rỗng là không phải khóa cũ', () => {
      expect(isLegacyLocalStorageKey(null)).toBe(false);
      expect(isLegacyLocalStorageKey(undefined)).toBe(false);
      expect(isLegacyLocalStorageKey('')).toBe(false);
    });

    it('không nhầm khóa chỉ tình cờ chứa chữ uploads ở giữa', () => {
      expect(isLegacyLocalStorageKey('styles/uploads-archive/a.jpg')).toBe(
        false,
      );
    });
  });

  describe('isResolvableObjectKey', () => {
    it('chỉ chấp nhận khóa S3 thật', () => {
      expect(
        isResolvableObjectKey('purchase-orders/po-1/documents/a.pdf'),
      ).toBe(true);
    });

    it('từ chối khóa rỗng và khóa ổ đĩa cũ', () => {
      expect(isResolvableObjectKey(null)).toBe(false);
      expect(isResolvableObjectKey('')).toBe(false);
      expect(isResolvableObjectKey('/uploads/img-1.png')).toBe(false);
    });
  });
});
