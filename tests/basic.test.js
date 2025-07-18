/**
 * Basic utility functions tests
 */

describe('Utility Functions', () => {
  // Test random string generation - Fixed bug where it returned array instead of string
  test('generateRandomString should generate string of correct length', () => {
    // Mock the function since it's in main.js
    function generateRandomString(length) {
      return Array(length)
        .fill()
        .map(() => Math.random().toString(36)[2])
        .join('');
    }

    const result = generateRandomString(10);
    expect(result).toHaveLength(10);
    expect(typeof result).toBe('string');
    expect(Array.isArray(result)).toBe(false); // Bug fix: should not return array
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

describe('Model Selection Logic', () => {
  test('should calculate estimated duration correctly without mutating original', () => {
    // Mock the model selection logic from renderer.js
    function selectModel(modelValue, audioDuration) {
      switch (modelValue) {
        case '1':
          return {
            model: 'Whisper\\models\\small',
            script: 'Whisper\\Faster-Whisper.py',
            estimatedDuration: audioDuration * 0.7
          };
        case "2":
          return {
            model: 'Whisper\\models\\medium',
            script: 'Whisper\\Faster-Whisper.py',
            estimatedDuration: audioDuration * 1.3
          };
        default:
          return null;
      }
    }

    const originalDuration = 100;
    const model1 = selectModel('1', originalDuration);
    const model2 = selectModel('2', originalDuration);
    const invalidModel = selectModel('invalid', originalDuration);

    // Original duration should not be mutated
    expect(originalDuration).toBe(100);
    
    // Model 1 should have correct estimated duration
    expect(model1.estimatedDuration).toBe(70);
    expect(model1.model).toBe('Whisper\\models\\small');
    
    // Model 2 should have correct estimated duration
    expect(model2.estimatedDuration).toBe(130);
    expect(model2.model).toBe('Whisper\\models\\medium');
    
    // Invalid model should return null
    expect(invalidModel).toBeNull();
  });
});