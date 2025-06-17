import type { TokenAPIData, SupportedChain } from '../../types';

export interface SimulatedToken {
  address: string;
  symbol: string;
  name: string;
  chain: SupportedChain;
  performanceType: 'good' | 'bad' | 'neutral' | 'volatile'; // To categorize tokens
  priceTrajectory: (step: number) => number; // Function to determine price at a given step
  initialPrice: number;
  liquidity?: number;
  marketCap?: number;
}

export class MockPriceService {
  private tokens: Map<string, SimulatedToken> = new Map();
  private currentTimeStep: number = 0;
  private baseTimestamp: number = Date.now(); // Simulation start time
  private stepIncrementMs: number = 24 * 60 * 60 * 1000; // Each step is one day

  constructor(initialTokens: SimulatedToken[]) {
    initialTokens.forEach((token) => this.tokens.set(token.address, token));
  }

  public addToken(token: SimulatedToken): void {
    this.tokens.set(token.address, token);
  }

  public advanceTime(step: number): void {
    this.currentTimeStep = step;
  }

  public getCurrentTimestamp(step?: number): number {
    const effectiveStep = step !== undefined ? step : this.currentTimeStep;
    return this.baseTimestamp + effectiveStep * this.stepIncrementMs;
  }

  public getStepFromTimestamp(timestamp: number): number | null {
    if (timestamp < this.baseTimestamp) return null; // Timestamp is before simulation started
    const elapsedMs = timestamp - this.baseTimestamp;
    const step = Math.round(elapsedMs / this.stepIncrementMs);
    // Ensure the derived step isn't in the future relative to currentTimeStep if that's a constraint
    // For now, just return the calculated step based on baseTimestamp
    return step;
  }

  public async getTokenAPIData(
    tokenAddress: string,
    chain: SupportedChain, // Chain might be used if addresses are not unique across chains
    step?: number // Optional step, defaults to current simulation step
  ): Promise<TokenAPIData | null> {
    const token = this.tokens.get(tokenAddress);
    const effectiveStep = step !== undefined ? step : this.currentTimeStep;

    if (!token || token.chain !== chain) {
      return null;
    }

    const currentPrice = token.priceTrajectory(effectiveStep);
    const priceHistory: { timestamp: number; price: number }[] = [];
    for (let i = 0; i <= effectiveStep; i++) {
      priceHistory.push({
        timestamp: this.getCurrentTimestamp(i),
        price: token.priceTrajectory(i),
      });
    }

    // Generate some plausible ATH/ATL from the history available up to the current step
    const relevantHistoryPrices = priceHistory.map((p) => p.price);
    const ath =
      relevantHistoryPrices.length > 0 ? Math.max(...relevantHistoryPrices) : currentPrice;
    const atl =
      relevantHistoryPrices.length > 0 ? Math.min(...relevantHistoryPrices) : currentPrice;

    return {
      name: token.name,
      symbol: token.symbol,
      currentPrice: currentPrice,
      ath: ath,
      atl: atl,
      priceHistory: priceHistory,
      liquidity: token.liquidity || 100000, // Default mock liquidity
      marketCap: token.marketCap || currentPrice * 1000000, // Default mock market cap
      isKnownScam: token.performanceType === 'bad' && Math.random() < 0.3, // 30% chance a "bad" token is also flagged as scam
    };
  }

  /**
   * Calculates the All-Time High (ATH) for a token within a specified number of days (steps)
   * starting from a given step.
   */
  public getAthInWindow(
    tokenAddress: string,
    chain: SupportedChain,
    fromStep: number,
    windowDays: number // Number of days (steps) in the window
  ): number | null {
    const token = this.tokens.get(tokenAddress);
    if (!token || token.chain !== chain) {
      return null;
    }

    let maxPriceInWindow = -1;
    // Iterate through the steps within the window
    for (let i = 0; i < windowDays; i++) {
      const stepInWindow = fromStep + i;
      const price = token.priceTrajectory(stepInWindow);
      if (price > maxPriceInWindow) {
        maxPriceInWindow = price;
      }
    }
    return maxPriceInWindow === -1 ? null : maxPriceInWindow;
  }

  public getTokensByPerformanceType(type: SimulatedToken['performanceType']): SimulatedToken[] {
    return Array.from(this.tokens.values()).filter((token) => token.performanceType === type);
  }

  public getAllTokens(): SimulatedToken[] {
    return Array.from(this.tokens.values());
  }

  // Example price trajectories
  static goodTokenTrajectory =
    (initialPrice: number, growthFactor: number = 0.02) =>
    (step: number): number => {
      return initialPrice * (1 + growthFactor) ** step * (1 + (Math.random() - 0.45) * 0.1); // Steady growth with slight volatility
    };

  static badTokenTrajectory =
    (initialPrice: number, decayFactor: number = 0.03, rugStepMultiplier: number = 0.1) =>
    (step: number): number => {
      // Increasing chance of rugging after 5 steps
      // rugStepMultiplier determines how quickly the chance increases per step after step 5.
      const baseRugChance = 0.05; // Initial chance of rugging when step > 5
      if (step > 5 && Math.random() < baseRugChance + rugStepMultiplier * (step - 5)) {
        return initialPrice * 0.01 * Math.random();
      }
      return Math.max(
        0.001,
        initialPrice * (1 - decayFactor) ** step * (1 + (Math.random() - 0.4) * 0.15)
      ); // Steady decay with volatility
    };

  static neutralTokenTrajectory =
    (initialPrice: number, volatility: number = 0.05) =>
    (step: number): number => {
      let price = initialPrice;
      // Simulate a random walk for neutral tokens
      for (let i = 0; i < step; i++) {
        price *= 1 + (Math.random() - 0.5) * 2 * volatility;
        price = Math.max(initialPrice * 0.5, Math.min(initialPrice * 1.5, price)); // Keep it bounded somewhat
      }
      return Math.max(0.001, price); // Sideways with volatility
    };

  static volatileTokenTrajectory =
    (initialPrice: number, volatility: number = 0.2, pumpDumpChance: number = 0.1) =>
    (step: number): number => {
      let price = initialPrice;
      for (let i = 0; i < step; i++) {
        price *= 1 + (Math.random() - 0.5) * 2 * volatility;
        if (Math.random() < pumpDumpChance)
          price *= Math.random() > 0.5 ? 1.2 + Math.random() * 0.8 : 0.8 - Math.random() * 0.3; // Occasional larger pump/dump
        price = Math.max(0.001, price); // Price floor
      }
      return price;
    };
}
