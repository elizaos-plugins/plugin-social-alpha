import { describe, expect, it, vi, beforeEach } from "vitest";
import { CommunityInvestorService } from '../service';
import { IAgentRuntime, UUID } from '@elizaos/core';
import { ServiceType, SupportedChain, Conviction } from '../types';

// Mock the clients
vi.mock('../clients', () => ({
  BirdeyeClient: {
    createFromRuntime: vi.fn(() => ({
      fetchTokenOverview: vi.fn().mockResolvedValue({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 9,
        price: 1.5,
        marketCap: 1000000,
        liquidity: 500000,
        volume: 100000,
      }),
      fetchPrice: vi.fn().mockResolvedValue(1.5),
      fetchTokenTradeData: vi.fn().mockResolvedValue({
        price: 1.5,
        volume_24h: 100000,
        volume_24h_usd: 100000,
        unique_wallet_30m_change_percent: 5,
        unique_wallet_1h_change_percent: 5,
        unique_wallet_2h_change_percent: 5,
        unique_wallet_4h_change_percent: 5,
        unique_wallet_8h_change_percent: 5,
        unique_wallet_24h_change_percent: 5,
      }),
      fetchTokenSecurity: vi.fn().mockResolvedValue({
        top10HolderPercent: 50,
        ownerPercent: 0,
        creatorPercent: 0,
      }),
    })),
  },
  DexscreenerClient: {
    createFromRuntime: vi.fn(() => ({
      searchForHighestLiquidityPair: vi.fn().mockResolvedValue({
        baseToken: { name: 'Test Token', symbol: 'TEST' },
        priceUsd: '1.5',
        liquidity: { usd: 500000 },
        volume: { h24: 100000 },
        priceChange: { h24: 5 },
        marketCap: 1000000,
        fdv: 1000000,
      }),
      search: vi.fn().mockResolvedValue({
        pairs: [
          {
            baseToken: {
              symbol: 'TEST',
              address: 'test-token-address',
              name: 'Test Token',
            },
            liquidity: { usd: 500000 },
            volume: { h24: 100000 },
            marketCap: 1000000,
            fdv: 1000000,
            priceChange: { h24: 5 },
            boosts: { active: 0 },
          },
        ],
      }),
    })),
  },
  HeliusClient: {
    createFromRuntime: vi.fn(() => ({
      getTokenHolders: vi.fn().mockResolvedValue([]),
    })),
  },
}));

// Mock the balanced trust calculator
vi.mock('../services/balancedTrustScoreCalculator', () => ({
  BalancedTrustScoreCalculator: vi.fn().mockImplementation(() => ({
    calculateBalancedTrustScore: vi.fn().mockReturnValue(75),
  })),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

// Mock createUniqueUuid
vi.mock('@elizaos/core', async () => {
  const actual = await vi.importActual('@elizaos/core');
  return {
    ...actual,
    createUniqueUuid: vi.fn(() => 'mock-component-id'),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('CommunityInvestorService', () => {
  let service: CommunityInvestorService;
  let mockRuntime: IAgentRuntime;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock runtime
    mockRuntime = {
      getSetting: vi.fn().mockReturnValue('test-api-key'),
      getCache: vi.fn().mockResolvedValue(null),
      setCache: vi.fn().mockResolvedValue(undefined),
      getMemory: vi.fn().mockResolvedValue(null),
      setMemory: vi.fn().mockResolvedValue(undefined),
      getMemories: vi.fn().mockResolvedValue([]),
      getService: vi.fn(),
      registerService: vi.fn(),
      registerTaskWorker: vi.fn(),
      createComponent: vi.fn().mockResolvedValue(undefined),
      getComponent: vi.fn().mockResolvedValue(null),
      setComponent: vi.fn().mockResolvedValue(undefined),
      getComponents: vi.fn().mockResolvedValue([]),
      agentId: 'test-agent' as UUID,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    } as any;

    service = new CommunityInvestorService(mockRuntime);
  });

  describe('initialization', () => {
    it('should create service instance with correct type', () => {
      expect(service).toBeDefined();
      expect(CommunityInvestorService.serviceType).toBe(ServiceType.COMMUNITY_INVESTOR);
    });

    it('should initialize with proper configuration', () => {
      expect(service.tradingConfig).toBeDefined();
      expect(service.capabilityDescription).toBe(
        'Manages community-driven investment trust scores and recommendations.'
      );
    });

    it('should create consistent component world ID', () => {
      expect(service.componentWorldId).toBeDefined();
      expect(service.componentRoomId).toBe(service.componentWorldId);
    });
  });

  describe('getTokenOverview', () => {
    it('should fetch token overview data', async () => {
      const tokenData = await service.getTokenOverview(
        SupportedChain.SOLANA,
        'test-token-address'
      );

      expect(tokenData).toBeDefined();
      expect(tokenData.name).toBe('Test Token');
      expect(tokenData.symbol).toBe('TEST');
      expect(tokenData.price).toBe(1.5);
      expect(tokenData.marketCap).toBe(1000000);
    });
  });

  describe('getCurrentPrice', () => {
    it('should fetch current price for a token', async () => {
      const price = await service.getCurrentPrice(SupportedChain.SOLANA, 'test-token-address');

      expect(price).toBe(1.5);
    });

    it('should return 0 for invalid tokens', async () => {
      const birdeyeClient = (service as any).birdeyeClient;
      birdeyeClient.fetchPrice = vi.fn().mockRejectedValue(new Error('Token not found'));

      const price = await service.getCurrentPrice(SupportedChain.SOLANA, 'invalid-token');

      expect(price).toBe(0);
    });
  });

  describe('shouldTradeToken', () => {
    it('should validate tokens based on trading criteria', async () => {
      const shouldTrade = await service.shouldTradeToken(
        SupportedChain.SOLANA,
        'test-token-address'
      );

      expect(shouldTrade).toBe(true);
    });
  });

  describe('calculateUserTrustScore', () => {
    it('should return default score for new users', async () => {
      const userId = 'new-user' as UUID;

      mockRuntime.getComponent = vi.fn().mockResolvedValue(null);

      const score = await service.calculateUserTrustScore(userId, mockRuntime);

      expect(score).toBe(0); // New users start with 0 trust score
    });
  });

  describe('hasWallet', () => {
    it('should return true for supported chains', () => {
      expect(service.hasWallet('solana')).toBe(true);
      expect(service.hasWallet('SOLANA')).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(service.hasWallet('ethereum')).toBe(false);
      expect(service.hasWallet('bitcoin')).toBe(false);
    });
  });
});
