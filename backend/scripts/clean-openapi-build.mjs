import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Swagger's TypeScript plugin emits decorator metadata during compilation.
// Reusing incremental metadata after dist/ was removed can therefore make the
// generated contract depend on artifacts left by a previous local build.
for (const buildArtifact of ['dist', 'tsconfig.build.tsbuildinfo']) {
  rmSync(resolve(backendRoot, buildArtifact), {
    recursive: true,
    force: true,
  });
}
