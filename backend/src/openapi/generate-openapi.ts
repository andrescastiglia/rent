import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import { CAPABILITY_MANIFEST } from '../common/capabilities/capability-manifest';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Rent API')
    .setDescription(
      'Contrato canónico para backend, web, mobile e integraciones',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      createOperationId(controllerKey, methodKey),
  });
}

export function createOperationId(
  controllerKey: string,
  methodKey: string,
): string {
  const controller = controllerKey.replace(/Controller$/, '');
  const routeIndex = methodKey.match(/\[(\d+)]$/)?.[1];
  const method = methodKey.replace(/\[\d+]$/, '');

  if (routeIndex === '1') {
    return `${controller}_${method}Legacy`;
  }

  return `${controller}_${method}`;
}

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  try {
    const document = createOpenApiDocument(app);
    const outputPath = resolve(process.cwd(), '../docs/api/openapi.v1.json');
    const capabilitiesPath = resolve(
      process.cwd(),
      '../docs/api/capabilities.v1.json',
    );
    await mkdir(resolve(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
    await writeFile(
      capabilitiesPath,
      `${JSON.stringify(CAPABILITY_MANIFEST, null, 2)}\n`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void generate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
