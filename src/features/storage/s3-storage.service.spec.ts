import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3StorageService } from './s3-storage.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  GetObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  HeadObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

function buildConfig(): ConfigService {
  const values: Record<string, string> = {
    AWS_S3_BUCKET: 'erp-tami-storage-dev',
    AWS_S3_REGION: 'us-east-1',
    AWS_S3_ACCESS_KEY_ID: 'AKIA_TEST',
    AWS_S3_SECRET_ACCESS_KEY: 'secret_test',
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!values[key]) throw new Error(`Missing config value: ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('S3StorageService', () => {
  const mockedGetSignedUrl = getSignedUrl as jest.Mock;
  let service: S3StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new S3StorageService(buildConfig());
  });

  it('presigns a PUT url with the given key and content type', async () => {
    mockedGetSignedUrl.mockResolvedValue('https://signed-put');

    const url = await service.getPresignedPutUrl(
      'styles/x/documents/tech_pack/f.pdf',
      'application/pdf',
      120,
    );

    expect(url).toBe('https://signed-put');
    const [, command, options] = mockedGetSignedUrl.mock.calls[0];
    expect(command.input).toEqual({
      Bucket: 'erp-tami-storage-dev',
      Key: 'styles/x/documents/tech_pack/f.pdf',
      ContentType: 'application/pdf',
    });
    expect(options).toEqual({ expiresIn: 120 });
  });

  it('presigns a GET url with an inline disposition when no download filename is given', async () => {
    mockedGetSignedUrl.mockResolvedValue('https://signed-get');

    await service.getPresignedGetUrl('k', 60);

    const [, command] = mockedGetSignedUrl.mock.calls[0];
    expect(command.input.ResponseContentDisposition).toBe('inline');
  });

  it('presigns a GET url with an attachment disposition when a download filename is given', async () => {
    mockedGetSignedUrl.mockResolvedValue('https://signed-get');

    await service.getPresignedGetUrl('k', 60, 'tên gốc.pdf');

    const [, command] = mockedGetSignedUrl.mock.calls[0];
    expect(command.input.ResponseContentDisposition).toContain('attachment');
  });

  it('deletes an object through the S3 client', async () => {
    mockSend.mockResolvedValue({});

    await service.deleteObject('k');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: 'erp-tami-storage-dev', Key: 'k' },
      }),
    );
  });

  it('reports exists=true with the object size when found', async () => {
    mockSend.mockResolvedValue({ ContentLength: 42 });

    const result = await service.headObject('k');

    expect(result).toEqual({ exists: true, sizeBytes: 42 });
  });

  it('reports exists=false when S3 responds NotFound', async () => {
    mockSend.mockRejectedValue({ name: 'NotFound' });

    const result = await service.headObject('missing-key');

    expect(result).toEqual({ exists: false });
  });

  it('rethrows unexpected S3 errors', async () => {
    mockSend.mockRejectedValue(new Error('boom'));

    await expect(service.headObject('k')).rejects.toThrow('boom');
  });
});
