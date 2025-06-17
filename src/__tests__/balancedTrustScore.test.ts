import { describe, it, expect } from 'vitest';
import { BalancedTrustScoreCalculator } from '../services/balancedTrustScoreCalculator';
import { TrustScoreResult } from '../services/trustScoreOptimizer';

describe('BalancedTrustScoreCalculator', () => {
  const calculator = new BalancedTrustScoreCalculator();

  describe('Full trust score calculation', () => {
    it('should calculate trust score for elite analyst correctly', () => {
      const metrics: TrustScoreResult['metrics'] = {
        totalCalls: 50,
        profitableCalls: 45,
        averageProfit: 35,
        winRate: 0.9,
        sharpeRatio: 2.5,
        alpha: 30,
        volumePenalty: 0,
        consistency: 0.85,
      };

      const score = calculator.calculateBalancedTrustScore(
        metrics,
        'elite_analyst',
        0, // no rug promotions
        20, // many good calls
        50 // total calls
      );

      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThan(100);
    });

    it('should heavily penalize rug promoters', () => {
      const metrics: TrustScoreResult['metrics'] = {
        totalCalls: 100,
        profitableCalls: 20,
        averageProfit: -45,
        winRate: 0.2,
        sharpeRatio: -1.5,
        alpha: -40,
        volumePenalty: 0,
        consistency: 0.3,
      };

      const score = calculator.calculateBalancedTrustScore(
        metrics,
        'rug_promoter',
        50, // many rug promotions
        5, // few good calls
        100 // total calls
      );

      expect(score).toBeLessThan(10);
    });

    it('should give moderate scores to newbies with few calls', () => {
      const metrics: TrustScoreResult['metrics'] = {
        totalCalls: 5,
        profitableCalls: 3,
        averageProfit: 5,
        winRate: 0.6,
        sharpeRatio: 0.5,
        alpha: 3,
        volumePenalty: 0,
        consistency: 0.7,
      };

      const score = calculator.calculateBalancedTrustScore(metrics, 'newbie', 0, 1, 5);

      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThan(60);
    });

    it('should handle edge cases gracefully', () => {
      const zeroMetrics: TrustScoreResult['metrics'] = {
        totalCalls: 0,
        profitableCalls: 0,
        averageProfit: 0,
        winRate: 0,
        sharpeRatio: 0,
        alpha: 0,
        volumePenalty: 0,
        consistency: 0,
      };

      const score = calculator.calculateBalancedTrustScore(zeroMetrics, 'newbie', 0, 0, 0);

      // With zero metrics, should still get base quality score (50) * volume multiplier
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(50);
    });
  });

  describe('Component weights', () => {
    it('should apply correct weights to components', () => {
      const metrics: TrustScoreResult['metrics'] = {
        totalCalls: 20,
        profitableCalls: 20,
        averageProfit: 100,
        winRate: 1.0,
        sharpeRatio: 3.0,
        alpha: 50,
        volumePenalty: 0,
        consistency: 1.0,
      };

      const score = calculator.calculateBalancedTrustScore(metrics, 'skilled_trader', 0, 20, 20);

      // With perfect metrics, score should be very high
      expect(score).toBeGreaterThan(90);
    });
  });
});
