/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/integration/**/*.integration.test.ts"],
  // Integration tests are slow — each test can take up to 30s
  testTimeout: 30000,
  // Run serially: rules store is an in-memory singleton on the server
  maxWorkers: 1,
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.json",
    },
  },
};
