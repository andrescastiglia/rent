module.exports = {
  rootDir: '..',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testRunner: 'jest-circus/runner',
  testTimeout: 180000,
  maxWorkers: 1,
  setupFilesAfterEnv: ['<rootDir>/e2e/setup.ts'],
  reporters: ['detox/runners/jest/reporter'],
  testMatch: ['<rootDir>/e2e/**/*.e2e.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/e2e/tsconfig.json',
      diagnostics: false,
      isolatedModules: true,
    },
  },
  verbose: true,
};
