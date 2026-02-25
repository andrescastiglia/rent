/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
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
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build:
        'cd android && EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_E2E_MODE=true ./gradlew app:assembleDebug app:assembleDebugAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Medium_Phone_API_36.1',
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
  },
};
