/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 180000,
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      launchArgs: {
        detoxEnableSynchronization: '0',
      },
      build:
        'cd android && ./gradlew app:assembleDebug app:assembleDebugAndroidTest -DtestBuildType=debug -PreactNativeArchitectures=x86_64 --no-daemon',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      launchArgs: {
        detoxEnableSynchronization: '0',
      },
      build:
        'cd android && EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_E2E_MODE=true ./gradlew app:assembleRelease app:assembleReleaseAndroidTest -DtestBuildType=release -PreactNativeArchitectures=x86_64 -Pandroid.enableMinifyInReleaseBuilds=false --no-daemon',
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Medium_Phone_API_34',
      },
      bootArgs: '-no-snapshot-load -no-snapshot-save -no-boot-anim',
      readonly: false,
    },
  },
  configurations: {
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
  },
};
