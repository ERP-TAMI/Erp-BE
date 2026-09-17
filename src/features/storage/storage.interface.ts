export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export const PRESIGN_PUT_EXPIRY_SECONDS = 300;
export const PRESIGN_GET_EXPIRY_SECONDS = 3600;

export interface HeadObjectResult {
  exists: boolean;
  sizeBytes?: number;
}

export interface StorageService {
  getPresignedPutUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<string>;

  getPresignedGetUrl(
    objectKey: string,
    expiresInSeconds?: number,
    downloadFileName?: string,
  ): Promise<string>;

  deleteObject(objectKey: string): Promise<void>;

  /**
   * Sao chép object sang một key mới trong cùng bucket, không tải file về
   * client. Dùng khi cần bản lưu trữ độc lập thật sự (không chỉ metadata) —
   * ví dụ import tài liệu từ Style vào Product: `document_versions.storage_key`
   * có unique constraint, hai `DocumentVersion` không thể cùng trỏ một key.
   */
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;

  headObject(objectKey: string): Promise<HeadObjectResult>;

  /** Downloads the full object into memory. Only for server-side processing
   * (embedding images into a generated file) — never for serving a file to a
   * client, use getPresignedGetUrl for that. */
  getObjectBuffer(objectKey: string): Promise<Buffer>;

  /**
   * Downloads only the first `length` bytes, via a ranged GET.
   *
   * Use this when a few leading bytes are enough — magic-byte checks, say.
   * Pulling a whole object for that dominates the request: confirming a 5 MB
   * upload spent 17.9s of its 19s total re-downloading the file the browser
   * had just sent to S3 in under a second.
   *
   * Returns fewer bytes than asked when the object is smaller.
   */
  getObjectHead(objectKey: string, length: number): Promise<Buffer>;
}
