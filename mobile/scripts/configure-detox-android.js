#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(process.env.MOBILE_ROOT || process.cwd());
const appJsonPath = path.join(mobileRoot, 'app.json');
const packageJsonPath = path.join(mobileRoot, 'package.json');
const buildGradlePath = path.join(mobileRoot, 'android/app/build.gradle');
const androidTestRoot = path.join(mobileRoot, 'android/app/src/androidTest');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertDefaultConfigLine(gradle, line) {
  if (gradle.includes(line)) {
    return gradle;
  }

  const defaultConfigMatch = gradle.match(/defaultConfig\s*\{/);
  if (!defaultConfigMatch) {
    throw new Error(
      'Could not find android.defaultConfig in android/app/build.gradle',
    );
  }

  const insertAfter = gradle.indexOf(
    '\n',
    defaultConfigMatch.index + defaultConfigMatch[0].length,
  );
  return `${gradle.slice(0, insertAfter + 1)}        ${line}\n${gradle.slice(insertAfter + 1)}`;
}

function upsertDependency(gradle, dependency) {
  const dependencyRegex = new RegExp(
    `\\s*androidTestImplementation\\("${escapeRegExp(dependency.split(':').slice(0, 2).join(':'))}:[^"]+"\\)`,
    'g',
  );

  gradle = gradle.replace(dependencyRegex, '');
  const dependenciesMatch = gradle.match(/dependencies\s*\{/);
  if (!dependenciesMatch) {
    throw new Error(
      'Could not find dependencies block in android/app/build.gradle',
    );
  }

  const insertAfter = gradle.indexOf(
    '\n',
    dependenciesMatch.index + dependenciesMatch[0].length,
  );
  return `${gradle.slice(0, insertAfter + 1)}    androidTestImplementation("${dependency}")\n${gradle.slice(insertAfter + 1)}`;
}

function writeAndroidTestManifest() {
  const manifestPath = path.join(androidTestRoot, 'AndroidManifest.xml');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools">

  <application>
    <activity
      android:name="androidx.test.core.app.InstrumentationActivityInvoker$BootstrapActivity"
      android:exported="true"
      tools:replace="android:exported" />
    <activity
      android:name="androidx.test.core.app.InstrumentationActivityInvoker$EmptyActivity"
      android:exported="true"
      tools:replace="android:exported" />
    <activity
      android:name="androidx.test.core.app.InstrumentationActivityInvoker$EmptyFloatingActivity"
      android:exported="true"
      tools:replace="android:exported" />
  </application>
</manifest>
`,
  );
}

function removeGeneratedDetoxTests(javaRoot) {
  if (!fs.existsSync(javaRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(javaRoot, { withFileTypes: true })) {
    const entryPath = path.join(javaRoot, entry.name);
    if (entry.isDirectory()) {
      removeGeneratedDetoxTests(entryPath);
      continue;
    }

    if (entry.name === 'DetoxTest.java') {
      const contents = fs.readFileSync(entryPath, 'utf8');
      if (contents.includes('com.wix.detox.Detox')) {
        fs.rmSync(entryPath);
      }
    }
  }
}

function writeDetoxTest(androidPackage) {
  const javaRoot = path.join(androidTestRoot, 'java');
  removeGeneratedDetoxTests(javaRoot);

  const packagePath = androidPackage.split('.').join(path.sep);
  const detoxTestPath = path.join(javaRoot, packagePath, 'DetoxTest.java');
  fs.mkdirSync(path.dirname(detoxTestPath), { recursive: true });
  fs.writeFileSync(
    detoxTestPath,
    `package ${androidPackage};

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
  @Rule
  public ActivityTestRule<MainActivity> activityRule =
      new ActivityTestRule<>(MainActivity.class, false, false);

  @Test
  public void runDetoxTests() {
    DetoxConfig config = new DetoxConfig();
    config.rnContextLoadTimeoutSec = 180;
    Detox.runTests(activityRule, config);
  }
}
`,
  );
}

function configureBuildGradle(detoxVersion) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');

  gradle = gradle.replace(/\n\s*testInstrumentationRunner\s+"[^"]+"/g, '');
  gradle = gradle.replace(/\n\s*testBuildType\s+.+/g, '');

  gradle = upsertDefaultConfigLine(
    gradle,
    'testInstrumentationRunner "com.wix.detox.DetoxJUnitRunner"',
  );
  gradle = upsertDefaultConfigLine(
    gradle,
    "testBuildType System.getProperty('testBuildType', 'debug')",
  );

  for (const dependency of [
    `com.wix:detox:${detoxVersion}`,
    'androidx.test:runner:1.6.2',
    'androidx.test:rules:1.6.1',
    'androidx.test.ext:junit:1.2.1',
  ]) {
    gradle = upsertDependency(gradle, dependency);
  }

  fs.writeFileSync(buildGradlePath, gradle);
}

const appConfig = readJson(appJsonPath);
const packageJson = readJson(packageJsonPath);
const androidPackage =
  appConfig.expo && appConfig.expo.android && appConfig.expo.android.package;
const detoxRange =
  (packageJson.devDependencies && packageJson.devDependencies.detox) ||
  (packageJson.dependencies && packageJson.dependencies.detox);
const detoxVersion = require(
  path.join(mobileRoot, 'node_modules/detox/package.json'),
).version;

if (!androidPackage) {
  throw new Error('Missing expo.android.package in app.json');
}

if (!detoxRange) {
  throw new Error('Missing detox dependency in package.json');
}

configureBuildGradle(detoxVersion);
writeAndroidTestManifest();
writeDetoxTest(androidPackage);

console.log(
  `Configured Detox Android test runner for ${androidPackage} using Detox ${detoxVersion}`,
);
