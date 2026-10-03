import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HeadObjectResult, StorageService } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly trustedHosts: string[];

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET');
    const region = config.getOrThrow<string>('AWS_S3_REGION');
    const endpoint = config.get<string>('AWS_S3_ENDPOINT');
    const accessKeyId = config.get<string>('AWS_S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_S3_SECRET_ACCESS_KEY');

    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new Error(
        'AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY must be set together',
      );
    }

    this.client = new S3Client({
      region,
      // Local development can use explicit credentials; AWS production uses
      // the EC2 instance role through the SDK's default credential provider.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    // Every host a presigned URL from this service could ever use — virtual
    // hosted-style S3 (with and without the region segment, us-east-1 signs
    // both ways depending on SDK version) and, for local/dev, the configured
    // custom endpoint (path-style).
    this.trustedHosts = [
      `${this.bucket}.s3.${region}.amazonaws.com`,
      `${this.bucket}.s3.amazonaws.com`,
      ...(endpoint ? [this.safeHostname(endpoint)].filter(Boolean) : []),
    ] as string[];
  }

  private safeHostname(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  isTrustedObjectHost(urlString: string): boolean {
    const hostname = this.safeHostname(urlString);
    return hostname !== null && this.trustedHosts.includes(hostname);
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

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
      }),
    );
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

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async getObjectHead(objectKey: string, length: number): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        // S3 trả 206 kèm đúng khúc yêu cầu; object nhỏ hơn thì trả phần có thật.
        Range: `bytes=0-${Math.max(0, length - 1)}`,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  private parseTotalSizeFromContentRange(
    contentRange?: string,
  ): number | undefined {
    const match = contentRange?.match(/\/(\d+)$/);
    return match ? Number(match[1]) : undefined;
  }
}
