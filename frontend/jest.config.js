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
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/generated/**',
    '!src/**/*.d.ts',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: { statements: 85, branches: 80, functions: 85, lines: 85 },
  },
};

module.exports = createJestConfig(config);
