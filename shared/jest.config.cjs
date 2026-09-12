module.exports = {
  rootDir: __dirname,
  testMatch: ["**/*.spec.cjs"],
  testEnvironment: "node",
  collectCoverage: true,
  coverageReporters: ["text", ["lcov", { projectRoot: __dirname }]],
  collectCoverageFrom: ["database-tls.cjs"],
  coverageDirectory: "../backend/coverage/shared",
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
