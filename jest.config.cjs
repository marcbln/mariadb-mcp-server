/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Use the preset for ESM support
  preset: 'ts-jest', // Use standard preset for CJS
  testEnvironment: 'node',
testTimeout: 30000, // Increase timeout to 30 seconds
  testMatch: [
    "**/test/**/*.test.ts"
  ],
  // Define the transform using the recommended structure
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // useESM: true, // No longer needed for CJS
      },
    ],
  },
  // Add moduleNameMapper for ESM compatibility if needed (might be required depending on imports)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};