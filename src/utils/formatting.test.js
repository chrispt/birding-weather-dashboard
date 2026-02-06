import {
  convertTemperature,
  formatTemperature,
  convertWindSpeed,
  formatWindDirection,
  formatCountdown
} from './formatting.js';

describe('formatting utilities', () => {
  test('convertTemperature converts C to F correctly', () => {
    expect(convertTemperature(0, 'F')).toBe(32);
    expect(convertTemperature(10, 'F')).toBe(50);
  });

  test('formatTemperature appends unit symbol', () => {
    const formatted = formatTemperature(10, 'C');
    expect(formatted.endsWith('°C')).toBe(true);
  });

  test('convertWindSpeed converts km/h to mph', () => {
    expect(convertWindSpeed(10, 'mph')).toBe(6);
  });

  test('formatWindDirection returns label and degrees', () => {
    const formatted = formatWindDirection(90);
    expect(formatted).toContain('E');
    expect(formatted).toContain('90°');
  });

  test('formatCountdown renders mm:ss', () => {
    expect(formatCountdown(65)).toBe('1:05');
  });
});

