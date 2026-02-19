const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.spec.tsx',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coveragePathIgnorePatterns: [
    '<rootDir>/src/app/.*/layout\\.tsx$',
    '<rootDir>/src/app/.*/page\\.tsx$',
  ],
  coverageThreshold: {
    './src/lib/': {
      statements: 80,
      functions: 80,
    },
    './src/hooks/': {
      statements: 80,
      branches: 80,
    },
    './src/components/': {
      statements: 70,
    },
    './src/app/': {
      statements: 60,
    },
  },
};

module.exports = createJestConfig(config);
