#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(process.env.MOBILE_ROOT || process.cwd());
const buildGradlePath = path.join(mobileRoot, 'android/app/build.gradle');
const versionName = process.env.ANDROID_VERSION_NAME;
const versionCode = Number(process.env.ANDROID_VERSION_CODE);

if (!/^\d+\.\d+\.\d+$/.test(versionName || '')) {
  throw new Error('ANDROID_VERSION_NAME must use MAJOR.MINOR.PATCH');
}
if (
  !Number.isSafeInteger(versionCode) ||
  versionCode <= 0 ||
  versionCode > 2100000000
) {
  throw new Error(
    'ANDROID_VERSION_CODE must be an integer from 1 to 2100000000',
  );
}

function replaceOnce(source, pattern, replacement, label) {
  const globalPattern = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  const matches = source.match(globalPattern);
  if (!matches || matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${label}; found ${matches?.length || 0}`,
    );
  }
  return source.replace(pattern, replacement);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let gradle = fs.readFileSync(buildGradlePath, 'utf8');
gradle = replaceOnce(
  gradle,
  /^(\s*)versionCode\s+\d+\s*$/m,
  `$1versionCode ${versionCode}`,
  'versionCode declaration',
);
gradle = replaceOnce(
  gradle,
  /^(\s*)versionName\s+"[^"]*"\s*$/m,
  `$1versionName "${versionName}"`,
  'versionName declaration',
);

const debugSigningBlock = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;
const releaseSigningBlock = `${debugSigningBlock}
        release {
            def releaseStoreFile = System.getenv('ANDROID_SIGNING_STORE_FILE')
            def releaseStorePassword = System.getenv('ANDROID_SIGNING_STORE_PASSWORD')
            def releaseKeyAlias = System.getenv('ANDROID_SIGNING_KEY_ALIAS')
            def releaseKeyPassword = System.getenv('ANDROID_SIGNING_KEY_PASSWORD')
            if (![releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword].every { it }) {
                throw new GradleException('Release signing environment is incomplete.')
            }
            storeFile file(releaseStoreFile)
            storePassword releaseStorePassword
            keyAlias releaseKeyAlias
            keyPassword releaseKeyPassword
        }`;
gradle = replaceOnce(
  gradle,
  new RegExp(escapeRegExp(debugSigningBlock)),
  releaseSigningBlock,
  'debug signing configuration',
);

const releaseBuildAnchor = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
gradle = replaceOnce(
  gradle,
  new RegExp(escapeRegExp(releaseBuildAnchor)),
  `        release {
            signingConfig signingConfigs.release`,
  'release build signing anchor',
);

fs.writeFileSync(buildGradlePath, gradle);
console.log(`Configured Android release ${versionName} (${versionCode}).`);
