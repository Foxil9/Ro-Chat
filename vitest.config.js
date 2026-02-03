import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Make test functions available globally (describe, it, expect)
    globals: true,

    // Run this file before each test
    setupFiles: './test/setup.js',

    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        'build/',
        '*.config.js',
        'src/preload/**',
      ],
    },

    // Test timeout
    testTimeout: 10000,

    // Allow different environments for different test files
    environmentMatchGlobs: [
      // Renderer tests need JSDOM (browser environment)
      ['test/renderer/**', 'jsdom'],
      // Main process tests need Node environment
      ['test/main/**', 'node'],
      // Server tests need Node environment
      ['test/server/**', 'node'],
      // Shared/utility tests use Node
      ['test/shared/**', 'node'],
    ],
  },
});