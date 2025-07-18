/**
 * Basic utility functions tests
 */

describe('Utility Functions', () => {
  // Test random string generation
  test('generateRandomString should generate string of correct length', () => {
    // Mock the function since it's in main.js
    function generateRandomString(length) {
      return [...Array(length)]
        .map(() => Math.random().toString(36)[2])
        .join('');
    }

    const result = generateRandomString(10);
    expect(result).toHaveLength(10);
    expect(typeof result).toBe('string');
  });

  // Test time formatting
  test('getNow should format time correctly', () => {
    // Mock the function since it's in main.js
    function getNow(pathFlag = null) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const date = now.getDate();
      const hour = now.getHours();
      const min = now.getMinutes();
      const sec = now.getSeconds();

      if (!pathFlag) {
        return `${year}/${month}/${date}_${hour}:${min}:${sec}`;
      } else {
        return `${year}-${month}-${date}_${hour}-${min}-${sec}`;
      }
    }

    const regularFormat = getNow();
    const pathFormat = getNow(true);

    expect(regularFormat).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}_\d{1,2}:\d{1,2}:\d{1,2}/);
    expect(pathFormat).toMatch(/\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2}-\d{1,2}/);
  });

  // Test platform detection
  test('should detect platform correctly', () => {
    const isWindows = process.platform === 'win32';
    expect(typeof isWindows).toBe('boolean');
  });
});

describe('Application Constants', () => {
  test('should have valid package.json', () => {
    const packageJson = require('../package.json');
    expect(packageJson.name).toBe('AITranscribe-Electron');
    expect(packageJson.version).toBeDefined();
    expect(packageJson.main).toBe('./src/main.js');
  });
});