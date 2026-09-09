import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HeadObjectResult, StorageService } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET');
    const endpoint = config.get<string>('AWS_S3_ENDPOINT');

    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_S3_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('AWS_S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('AWS_S3_SECRET_ACCESS_KEY'),
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  async getPresignedPutUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getPresignedGetUrl(
    objectKey: string,
    expiresInSeconds = 3600,
    downloadFileName?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ResponseContentDisposition: downloadFileName
        ? `attachment; filename="${encodeURIComponent(downloadFileName)}"`
        : 'inline',
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async headObject(objectKey: string): Promise<HeadObjectResult> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Range: 'bytes=0-0',
        }),
      );
      const sizeBytes =
        this.parseTotalSizeFromContentRange(result.ContentRange) ??
        result.ContentLength;
      return { exists: true, sizeBytes };
    } catch (error) {
      const err = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      // GetObject used instead of HeadObject: HEAD has no body, so the SDK can't parse its error.
      const notFoundNames = ['NoSuchKey', 'NotFound', 'AccessDenied'];
      if (
        (err?.name && notFoundNames.includes(err.name)) ||
        err?.$metadata?.httpStatusCode === 404 ||
        err?.$metadata?.httpStatusCode === 403
      ) {
        return { exists: false };
      }
      throw error;
    }
  }

  private parseTotalSizeFromContentRange(
    contentRange?: string,
  ): number | undefined {
    const match = contentRange?.match(/\/(\d+)$/);
    return match ? Number(match[1]) : undefined;
  }
}
