#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_sha="${RELEASE_SHA:-$(git -C "$project_root" rev-parse HEAD)}"
output_dir="${RELEASE_OUTPUT_DIR:-$project_root/artifacts/release}"
stage_dir="$output_dir/server-$release_sha"
archive_path="$output_dir/rent-server-$release_sha.tar.gz"

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA must be a full Git SHA" >&2
  exit 1
fi

rm -rf "$stage_dir"
mkdir -p "$stage_dir/backend" "$stage_dir/batch" "$stage_dir/frontend" \
  "$stage_dir/deploy" "$stage_dir/migrations" "$stage_dir/scripts" "$stage_dir/sbom"

for app in backend batch frontend mobile; do
  (
    cd "$project_root/$app"
    npm sbom --omit=dev --package-lock-only --sbom-format=cyclonedx \
      > "$stage_dir/sbom/$app.cdx.json"
  )
done

cp -a "$project_root/backend/dist" "$stage_dir/backend/dist"
cp "$project_root/backend/package.json" "$project_root/backend/package-lock.json" \
  "$stage_dir/backend/"
cp -a "$project_root/backend/node_modules" "$stage_dir/backend/node_modules"

cp -a "$project_root/batch/dist" "$stage_dir/batch/dist"
cp "$project_root/batch/package.json" "$project_root/batch/package-lock.json" \
  "$stage_dir/batch/"
cp -a "$project_root/batch/node_modules" "$stage_dir/batch/node_modules"

cp -a "$project_root/frontend/.next/standalone/." "$stage_dir/frontend/"
mkdir -p "$stage_dir/frontend/.next"
cp -a "$project_root/frontend/.next/static" "$stage_dir/frontend/.next/static"
cp -a "$project_root/frontend/public" "$stage_dir/frontend/public"
cp "$project_root/frontend/newrelic.js" "$stage_dir/frontend/newrelic.js"

cp -a "$project_root/migrations/." "$stage_dir/migrations/"
cp "$project_root/scripts/healthcheck.sh" "$stage_dir/scripts/healthcheck.sh"
cp "$project_root/scripts/migrate-legacy-property-images.cjs" \
  "$stage_dir/scripts/migrate-legacy-property-images.cjs"
cp "$project_root/ansible/files/ecosystem.config.cjs" "$stage_dir/deploy/ecosystem.config.cjs"

printf '%s\n' "$release_sha" > "$stage_dir/RELEASE_SHA"
(
  cd "$stage_dir"
  find backend batch deploy frontend migrations scripts sbom -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS
)

tar -C "$output_dir" -czf "$archive_path" "server-$release_sha"
sha256sum "$archive_path" > "$archive_path.sha256"

printf '%s\n' "$archive_path"
