import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrustScoreOptimizer } from '../services/trustScoreOptimizer';
import { UUID } from '@elizaos/core';
import { SupportedChain, Conviction } from '../types';

// Create mock simulation data
const createMockSimulationData = () => {
  const actors = [
    { id: 'elite-1', username: 'EliteTrader', archetype: 'elite_analyst' },
    { id: 'rug-1', username: 'RugPromotoor', archetype: 'rug_promoter' },
  ];

  const calls = [
    // Elite analyst calls
    {
      callId: 'call-1' as UUID,
      originalMessageId: 'msg-1',
      userId: 'elite-1',
      username: 'EliteTrader',
      timestamp: Date.now(),
      content: 'This token looks solid',
      tokenMentioned: 'GOOD',
      chain: SupportedChain.SOLANA,
      sentiment: 'positive' as const,
      conviction: Conviction.HIGH,
      llmReasoning: 'Good fundamentals',
      certainty: 'high' as const,
      fileSource: 'simulation',
      simulationMetadata: {
        tokenScenario: 'successful' as any,
        actorArchetype: 'elite_analyst',
        priceAtCall: 0.001,
        marketCapAtCall: 100000,
        liquidityAtCall: 50000,
        expectedOutcome: 'profit' as const,
        actualProfit: 150,
      },
    },
    // Rug promoter calls
    {
      callId: 'call-2' as UUID,
      originalMessageId: 'msg-2',
      userId: 'rug-1',
      username: 'RugPromotoor',
      timestamp: Date.now(),
      content: 'TO THE MOON!',
      tokenMentioned: 'RUG',
      chain: SupportedChain.SOLANA,
      sentiment: 'positive' as const,
      conviction: Conviction.VERY_HIGH,
      llmReasoning: 'Shilling rug',
      certainty: 'high' as const,
      fileSource: 'simulation',
      simulationMetadata: {
        tokenScenario: 'rug_fast' as any,
        actorArchetype: 'rug_promoter',
        priceAtCall: 0.0001,
        marketCapAtCall: 10000,
        liquidityAtCall: 1000,
        expectedOutcome: 'loss' as const,
        actualProfit: -95,
      },
    },
  ];

  const actorPerformance = new Map([
    ['elite-1', { totalCalls: 1, profitableCalls: 1, totalProfit: 150, averageProfit: 150 }],
    ['rug-1', { totalCalls: 1, profitableCalls: 0, totalProfit: -95, averageProfit: -95 }],
  ]);

  const priceHistory = new Map([
    ['token-1', [{ timestamp: new Date(), price: 0.001, volume: 10000, liquidity: 50000, marketCap: 100000 }]],
    ['token-2', [{ timestamp: new Date(), price: 0.0001, volume: 1000, liquidity: 1000, marketCap: 10000 }]],
  ]);

  return {
    calls,
    tokens: new Map(),
    priceHistory,
    actorPerformance,
  };
};

// Mock dependencies
vi.mock('../services/simulationRunner', () => ({
  SimulationRunner: vi.fn().mockImplementation(() => ({
    runSimulation: vi.fn().mockResolvedValue(createMockSimulationData()),
    loadCachedSimulation: vi.fn().mockResolvedValue(null),
  })),
  TokenScenario: {
    SUCCESSFUL: 'successful',
    RUNNER_MOON: 'runner_moon',
    BLUE_CHIP: 'blue_chip',
    RUNNER_STEADY: 'runner_steady',
    PUMP_AND_DUMP: 'pump_dump',
    RUG_PULL_FAST: 'rug_fast',
    RUG_PULL_SLOW: 'rug_slow',
    SCAM_TOKEN: 'scam',
    MEDIOCRE: 'mediocre',
    STAGNANT: 'stagnant',
    SLOW_BLEED: 'slow_bleed',
  },
}));

vi.mock('../services/balancedTrustScoreCalculator', () => ({
  BalancedTrustScoreCalculator: vi.fn().mockImplementation(() => ({
    calculateBalancedTrustScore: vi.fn((metrics, archetype) => {
      // Return different scores based on archetype
      if (archetype === 'elite_analyst') return 90;
      if (archetype === 'rug_promoter') return 10;
      return 50;
    }),
    setParameters: vi.fn(),
    getParameters: vi.fn().mockReturnValue({
      profitWeight: 0.25,
      winRateWeight: 0.25,
      sharpeWeight: 0.15,
      alphaWeight: 0.1,
      consistencyWeight: 0.1,
      qualityWeight: 0.15,
      normalVolumeThreshold: 100,
      highVolumeThreshold: 300,
      extremeVolumeThreshold: 500,
      volumeToleranceByArchetype: {},
    }),
  })),
}));

describe('TrustScoreOptimizer', () => {
  let optimizer: TrustScoreOptimizer;

  beforeEach(() => {
    vi.clearAllMocks();
    optimizer = new TrustScoreOptimizer();
  });

  describe('initialization', () => {
    it('should create an instance', () => {
      expect(optimizer).toBeDefined();
      expect(optimizer).toBeInstanceOf(TrustScoreOptimizer);
    });
  });

  describe('runOptimizationCycle', () => {
    it('should run a full optimization cycle', async () => {
      const result = await optimizer.runOptimizationCycle(undefined, false);

      expect(result).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.scores.length).toBeGreaterThan(0);
      expect(result.accuracy).toBeDefined();
      expect(result.accuracy.mae).toBeLessThan(100); // Should have reasonable error
      expect(result.suggestions).toBeDefined();
    });
  });

  describe('calculateFinalTrustScore', () => {
    it('should calculate trust score with base metrics', () => {
      const metrics = {
        totalCalls: 10,
        profitableCalls: 7,
        averageProfit: 25,
        winRate: 0.7,
        sharpeRatio: 1.2,
        alpha: 15,
        volumePenalty: 0.8,
        consistency: 0.75,
      };

      const score = optimizer.calculateFinalTrustScore(metrics, 'skilled_trader');

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThan(60); // Should be higher than base due to good metrics
    });

    it('should apply archetype-specific calculations', () => {
      const metrics = {
        totalCalls: 50,
        profitableCalls: 45,
        averageProfit: 40,
        winRate: 0.9,
        sharpeRatio: 2.0,
        alpha: 30,
        volumePenalty: 0.9,
        consistency: 0.9,
      };

      const eliteScore = optimizer.calculateFinalTrustScore(metrics, 'elite_analyst');
      const newbieScore = optimizer.calculateFinalTrustScore(metrics, 'newbie');

      expect(eliteScore).toBeGreaterThan(newbieScore);
      expect(eliteScore).toBeGreaterThan(80); // Elite should score high
    });

    it('should apply penalties and bonuses', () => {
      const metrics = {
        totalCalls: 20,
        profitableCalls: 10,
        averageProfit: 0,
        winRate: 0.5,
        sharpeRatio: 0,
        alpha: 0,
        volumePenalty: 1,
        consistency: 0.5,
      };

      const baseScore = optimizer.calculateFinalTrustScore(metrics, 'average_trader');
      const penalizedScore = optimizer.calculateFinalTrustScore(metrics, 'average_trader', 20, 0);
      const bonusScore = optimizer.calculateFinalTrustScore(metrics, 'average_trader', 0, 20);

      expect(penalizedScore).toBeLessThan(baseScore);
      expect(bonusScore).toBeGreaterThan(baseScore);
    });
  });

  describe('optimizeParameters', () => {
    it('should optimize parameters with given ranges', async () => {
      const parameterRanges = {
        profitWeight: [0.2, 0.25, 0.3],
        consistencyWeight: [0.2, 0.25],
      };

      const optimized = await optimizer.optimizeParameters(parameterRanges);

      expect(optimized).toBeDefined();
      expect(optimized.profitWeight).toBeDefined();
      expect(optimized.consistencyWeight).toBeDefined();
      expect([0.2, 0.25, 0.3]).toContain(optimized.profitWeight);
      expect([0.2, 0.25]).toContain(optimized.consistencyWeight);
    });
  });
});
