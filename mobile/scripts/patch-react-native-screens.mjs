#!/usr/bin/env node
// Backport upstream react-native-screens #4498 while Rent pins 4.25.2.
// https://github.com/software-mansion/react-native-screens/pull/4498
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageFile = fileURLToPath(
  import.meta.resolve('react-native-screens/package.json'),
);
const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
assert.equal(
  version,
  '4.25.2',
  'Review/remove the native header patch when upgrading react-native-screens',
);
const source = path.join(
  path.dirname(packageFile),
  'android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt',
);
const previous =
  '        val stack = screenStack\n        val isTop = stack == null || stack.topScreen == parent';
const corrected =
  '        val stack = screenStack ?: return\n        val isTop = stack.topScreen == parent';
const content = fs.readFileSync(source, 'utf8');
if (content.includes(corrected) && !content.includes(previous)) {
  console.log('react-native-screens: detached header guard already applied');
} else {
  assert.equal(
    content.split(previous).length,
    2,
    'Unexpected native header source; refusing to apply an unverified patch',
  );
  fs.writeFileSync(source, content.replace(previous, corrected));
  console.log('react-native-screens: applied upstream detached header guard');
}
