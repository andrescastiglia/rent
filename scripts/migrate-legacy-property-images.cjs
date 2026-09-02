#!/usr/bin/env node

'use strict';

const { createHash } = require('node:crypto');
const { readFile, realpath } = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('../backend/node_modules/pg');

const LEGACY_MARKER = '/uploads/properties/';
function parseArguments(argv) {
  const args = new Set(argv);
  const rootArg = argv.find((value) => value.startsWith('--uploads-root='));
  if (!rootArg || !rootArg.slice('--uploads-root='.length)) {
    throw new Error(
      'Usage: migrate-legacy-property-images.cjs --uploads-root=/absolute/path [--apply]',
    );
  }
  return {
    apply: args.has('--apply'),
    uploadsRoot: rootArg.slice('--uploads-root='.length),
  };
}

function legacyRelativePath(reference) {
  if (typeof reference !== 'string') return null;
  const markerIndex = reference.indexOf(LEGACY_MARKER);
  if (markerIndex < 0) return null;

  const encoded = reference
    .slice(markerIndex + LEGACY_MARKER.length)
    .split(/[?#]/, 1)[0];
  const decoded = decodeURIComponent(encoded);
  const normalized = path.posix.normalize(decoded);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    throw new Error(`Unsafe legacy image reference: ${reference}`);
  }
  return normalized;
}

function detectMimeType(data, filename) {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  throw new Error(`Unsupported or spoofed image: ${filename}`);
}

async function loadLegacyImage(rootRealPath, reference) {
  const relativePath = legacyRelativePath(reference);
  if (!relativePath) return null;
  const candidate = path.resolve(rootRealPath, relativePath);
  const resolved = await realpath(candidate);
  if (resolved !== rootRealPath && !resolved.startsWith(`${rootRealPath}${path.sep}`)) {
    throw new Error(`Legacy image escapes uploads root: ${reference}`);
  }
  const data = await readFile(resolved);
  return {
    reference,
    relativePath,
    originalName: path.basename(relativePath),
    data,
    mimeType: detectMimeType(data, relativePath),
    checksum: createHash('sha256').update(data).digest('hex'),
  };
}

async function main() {
  const { apply, uploadsRoot } = parseArguments(process.argv.slice(2));
  const rootRealPath = await realpath(uploadsRoot);
  if (!path.isAbsolute(rootRealPath)) throw new Error('Uploads root must resolve to an absolute path');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const propertiesResult = await client.query(
      `SELECT id, company_id, images
         FROM properties
        WHERE deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(images, '[]'::jsonb)) image
             WHERE image LIKE '%' || $1 || '%'
          )
        ORDER BY company_id, id`,
      [LEGACY_MARKER],
    );

    const prepared = [];
    for (const property of propertiesResult.rows) {
      const images = Array.isArray(property.images) ? property.images : [];
      const loaded = new Map();
      for (const reference of images) {
        const image = await loadLegacyImage(rootRealPath, reference);
        if (image) loaded.set(reference, image);
      }
      prepared.push({ property, images, loaded });
    }

    const legacyCount = prepared.reduce((count, item) => count + item.loaded.size, 0);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', properties: prepared.length, legacyImages: legacyCount }));
    for (const item of prepared) {
      for (const image of item.loaded.values()) {
        console.log(JSON.stringify({ propertyId: item.property.id, reference: image.reference, bytes: image.data.length, sha256: image.checksum }));
      }
    }
    if (!apply || legacyCount === 0) return;

    await client.query('BEGIN');
    try {
      for (const item of prepared) {
        await client.query('SELECT id FROM properties WHERE id = $1 FOR UPDATE', [item.property.id]);
        const replacements = new Map();
        for (const image of item.loaded.values()) {
          const existing = await client.query(
            `SELECT id FROM property_images
              WHERE company_id = $1 AND property_id = $2 AND original_name = $3
                AND size_bytes = $4 AND data = $5
              LIMIT 1`,
            [item.property.company_id, item.property.id, image.originalName, image.data.length, image.data],
          );
          let imageId = existing.rows[0]?.id;
          if (!imageId) {
            const inserted = await client.query(
              `INSERT INTO property_images
                 (company_id, property_id, original_name, mime_type, size_bytes, data, is_temporary)
               VALUES ($1, $2, $3, $4, $5, $6, FALSE)
               RETURNING id`,
              [item.property.company_id, item.property.id, image.originalName, image.mimeType, image.data.length, image.data],
            );
            imageId = inserted.rows[0].id;
          }
          replacements.set(image.reference, `/properties/images/${imageId}`);
        }
        const migrated = item.images.map((reference) => replacements.get(reference) || reference);
        await client.query('UPDATE properties SET images = $2::jsonb, updated_at = NOW() WHERE id = $1', [item.property.id, JSON.stringify(migrated)]);
      }

      const remaining = await client.query(
        `SELECT COUNT(*)::integer AS count
           FROM properties
          WHERE EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(images, '[]'::jsonb)) image
             WHERE image LIKE '%' || $1 || '%'
          )`,
        [LEGACY_MARKER],
      );
      if (remaining.rows[0].count !== 0) throw new Error(`${remaining.rows[0].count} properties still contain legacy image references`);
      await client.query('COMMIT');
      console.log(JSON.stringify({ status: 'committed', properties: prepared.length, legacyImages: legacyCount }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  detectMimeType,
  legacyRelativePath,
  loadLegacyImage,
  main,
  parseArguments,
};
