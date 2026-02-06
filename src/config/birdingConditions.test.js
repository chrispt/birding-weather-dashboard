import {
  scoreHawkWatch,
  scoreSongbirdActivity,
  analyzePressureTrend
} from './birdingConditions.js';

describe('birdingConditions scoring', () => {
  test('scoreHawkWatch prefers NW winds and good visibility', () => {
    const result = scoreHawkWatch(315, 15, 16093.4 * 10); // NW, 15 mph, 10 mi
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.rating === 'Excellent' || result.rating === 'Good').toBe(true);
  });

  test('scoreSongbirdActivity penalizes midday heat', () => {
    const result = scoreSongbirdActivity(90, 0, 5, 13); // hot midday
    expect(result.score).toBeLessThan(60);
  });

  test('analyzePressureTrend detects rising trend', () => {
    const history = [
      { time: new Date(Date.now() - 6 * 3600000), pressure: 1000 },
      { time: new Date(), pressure: 1004 }
    ];
    const trend = analyzePressureTrend(history);
    expect(trend.trend === 'rising' || trend.trend === 'rising-fast').toBe(true);
  });
});

