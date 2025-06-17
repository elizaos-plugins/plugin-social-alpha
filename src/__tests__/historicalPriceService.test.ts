import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistoricalPriceService } from '../services/historicalPriceService';
import { SupportedChain } from '../types';
import type { IAgentRuntime } from '@elizaos/core';

// Create mock clients as simple objects
const mockBirdeyeClient = {
  request: vi.fn(),
  fetchPrice: vi.fn(),
};

const mockDexscreenerClient = {
  search: vi.fn(),
};

// Mock the clients module
vi.mock('../clients', () => ({
  BirdeyeClient: {
    createFromRuntime: vi.fn(() => mockBirdeyeClient),
  },
  DexscreenerClient: {
    createFromRuntime: vi.fn(() => mockDexscreenerClient),
  },
}));

describe('HistoricalPriceService', () => {
  let service: HistoricalPriceService;
  let mockRuntime: IAgentRuntime;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRuntime = {
      getSetting: vi.fn().mockReturnValue('test-api-key'),
    } as any;

    service = new HistoricalPriceService(mockRuntime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchBirdeyeHistoricalPrices', () => {
    it('should fetch and format historical prices correctly', async () => {
      const mockOHLCVData = {
        items: [
          { unixTime: 1640995200, o: 1.0, h: 1.1, l: 0.9, c: 1.0, v: 50000 },
          { unixTime: 1641081600, o: 1.0, h: 1.2, l: 1.0, c: 1.1, v: 60000 },
          { unixTime: 1641168000, o: 1.1, h: 1.15, l: 1.0, c: 1.05, v: 55000 },
        ],
      };

      mockBirdeyeClient.request.mockResolvedValueOnce(mockOHLCVData);

      const result = await service.fetchBirdeyeHistoricalPrices(
        'token-address',
        new Date('2022-01-01').getTime(),
        new Date('2022-01-03').getTime()
      );

      expect(result).toBeDefined();
      expect(result!.priceHistory).toHaveLength(3);
      expect(result!.firstPrice).toBe(1.0);
      expect(result!.lastPrice).toBe(1.05);
      expect(result!.minPrice).toBe(1.0);
      expect(result!.maxPrice).toBe(1.1);
    });

    it('should fallback to current price when OHLCV fails', async () => {
      mockBirdeyeClient.request.mockRejectedValueOnce(new Error('OHLCV not available'));
      mockBirdeyeClient.fetchPrice.mockResolvedValueOnce(2.5);

      const result = await service.fetchBirdeyeHistoricalPrices(
        'token-address',
        Date.now() - 86400000,
        Date.now()
      );

      expect(result).toBeDefined();
      expect(result!.priceHistory).toHaveLength(1);
      expect(result!.firstPrice).toBe(2.5);
      expect(result!.lastPrice).toBe(2.5);
    });

    it('should return null when no price data is available', async () => {
      mockBirdeyeClient.request.mockRejectedValueOnce(new Error('API Error'));
      mockBirdeyeClient.fetchPrice.mockRejectedValueOnce(new Error('No price'));

      const result = await service.fetchBirdeyeHistoricalPrices(
        'invalid-token',
        Date.now() - 86400000,
        Date.now()
      );

      expect(result).toBeNull();
    });
  });

  describe('getPriceAtTimestamp', () => {
    it('should interpolate price at specific timestamp', () => {
      const historicalData = {
        address: 'token-address',
        chain: SupportedChain.SOLANA,
        priceHistory: [
          { timestamp: 1640995200000, price: 1.0 },
          { timestamp: 1641081600000, price: 1.5 },
          { timestamp: 1641168000000, price: 2.0 },
        ],
        firstPrice: 1.0,
        lastPrice: 2.0,
        minPrice: 1.0,
        maxPrice: 2.0,
        fetchedAt: Date.now(),
      };

      // Test exact timestamp
      expect(service.getPriceAtTimestamp(historicalData, 1641081600000)).toBe(1.5);

      // Test interpolation
      const midpoint = 1641038400000; // Halfway between first two points
      const interpolated = service.getPriceAtTimestamp(historicalData, midpoint);
      expect(interpolated).toBeCloseTo(1.25, 2);

      // Test before first point
      expect(service.getPriceAtTimestamp(historicalData, 1640000000000)).toBe(1.0);

      // Test after last point
      expect(service.getPriceAtTimestamp(historicalData, 1642000000000)).toBe(2.0);
    });

    it('should return null for empty price history', () => {
      const historicalData = {
        address: 'token-address',
        chain: SupportedChain.SOLANA,
        priceHistory: [],
        fetchedAt: Date.now(),
      };

      expect(service.getPriceAtTimestamp(historicalData, Date.now())).toBeNull();
    });
  });

  describe('getMaxPriceInWindow', () => {
    it('should find max price in time window', () => {
      const historicalData = {
        address: 'token-address',
        chain: SupportedChain.SOLANA,
        priceHistory: [
          { timestamp: 1640995200000, price: 1.0 },
          { timestamp: 1641081600000, price: 2.5 }, // Max
          { timestamp: 1641168000000, price: 1.8 },
        ],
        fetchedAt: Date.now(),
      };

      const result = service.getMaxPriceInWindow(historicalData, 1640995200000, 1641168000000);

      expect(result).toBeDefined();
      expect(result?.price).toBe(2.5);
      expect(result?.timestamp).toBe(1641081600000);
    });
  });

  describe('findBestTokenMatch', () => {
    it('should find best token match by symbol', async () => {
      const mockSearchResults = {
        pairs: [
          {
            chainId: 'solana',
            baseToken: {
              symbol: 'TEST',
              address: 'test-address-1',
              name: 'Test Token',
            },
            liquidity: { usd: 100000 },
            volume: { h24: 50000 },
            fdv: 1000000,
            pairCreatedAt: Date.now(),
          },
          {
            chainId: 'solana',
            baseToken: {
              symbol: 'TEST',
              address: 'test-address-2',
              name: 'Test Token 2',
            },
            liquidity: { usd: 50000 },
            volume: { h24: 25000 },
            fdv: 500000,
          },
        ],
      };

      mockDexscreenerClient.search.mockResolvedValueOnce(mockSearchResults);

      const result = await service.findBestTokenMatch('TEST', SupportedChain.SOLANA);

      expect(result).toBeDefined();
      expect(result?.address).toBe('test-address-1'); // Higher liquidity
      expect(result?.liquidity).toBe(100000);
    });
  });
});
