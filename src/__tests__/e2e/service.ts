// @ts-nocheck
import { describe, test, expect, vi } from 'vitest';
import { CommunityInvestorService } from '../../service';
import { ServiceType } from '../../types';
import { createMockRuntime } from './test.setup';

// Mock the dependencies that CommunityInvestorService uses
vi.mock('../constants.ts', () => ({
  KNOWN_TOKENS: {
    SOL: { address: 'So11111111111111111111111111111111111111112', chain: 'SOLANA', decimals: 9 },
  },
  TRUST_LEADERBOARD_WORLD_SEED: 'mock-seed-value',
}));

describe('CommunityInvestorService Tests', () => {

  const mockSettings = {
    BIRDEYE_API_KEY: 'test-key',
    HELIUS_API_KEY: 'test-key',
  };

  test('Service.calculateUserTrustScore: New user, score 0', async () => {
    const runtime = createMockRuntime(mockSettings);
    const service = new CommunityInvestorService(runtime);
    const userId = 'user-123';
    
    runtime.getComponent.mockResolvedValue(null);
    runtime.createComponent.mockResolvedValue({ id: 'comp-1', entityId: userId, type: 'UserTrustProfile', data: {} });

    const score = await service.calculateUserTrustScore(userId, runtime);
    
    expect(score).toBe(0);
    expect(runtime.createComponent).toHaveBeenCalled();
  });

  test('Service.resolveTicker: Known SOL ticker ($SOL)', async () => {
    const runtime = createMockRuntime(mockSettings);
    const service = new CommunityInvestorService(runtime);
    
    const result = await service.resolveTicker('$SOL', 'SOLANA', []);
    expect(result).toEqual({
      address: 'So11111111111111111111111111111111111111112',
      chain: 'SOLANA',
      ticker: 'SOL',
    });
  });

});
