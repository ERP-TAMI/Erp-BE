export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

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
