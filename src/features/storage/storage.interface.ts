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

  headObject(objectKey: string): Promise<HeadObjectResult>;
}
