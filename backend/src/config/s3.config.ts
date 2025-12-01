import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

export const getS3Config = (configService: ConfigService): S3Client => {
  return new S3Client({
    region: configService.get<string>('AWS_REGION', 'us-east-1'),
    endpoint: configService.get<string>('S3_ENDPOINT', 'http://localhost:9000'),
    credentials: {
      accessKeyId: configService.get<string>('S3_ACCESS_KEY', 'minioadmin'),
      secretAccessKey: configService.get<string>('S3_SECRET_KEY', 'minioadmin'),
    },
    forcePathStyle: true, // Required for MinIO
  });
};

export const S3_BUCKET_NAME = 'rent-documents';
