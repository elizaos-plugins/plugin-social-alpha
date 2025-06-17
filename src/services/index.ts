// Consolidated Services
export { SimulationService } from './SimulationService';
export { PriceDataService } from './PriceDataService';
export { TrustScoreService } from './TrustScoreService';

// Re-export types from consolidated services
export type {
  TokenScenario,
  SimulationConfig,
  SimulationResult,
  SimulatedCallData,
  ActorConfig,
  SimulationToken,
  TokenPrice,
  SimulatedCallV2,
  ActorArchetypeV2,
  SimulatedActorV2
} from './SimulationService';

export type {
  PricePoint,
  HistoricalPriceData,
  TokenResolution,
  TradingCall,
  EnrichedTradingCall,
  TrustScore
} from './PriceDataService';

export type {
  TrustScoreResult,
  OptimizationResult,
  TrustScoreParameters,
  BalancedTrustScoreParams
} from './TrustScoreService';

// Original Services (kept for backward compatibility during migration)
export { BalancedTrustScoreCalculator } from './balancedTrustScoreCalculator';
export { HistoricalPriceService } from './historicalPriceService';
export { PriceEnrichmentService } from './priceEnrichmentService';
export { SimulationActorsServiceV2 } from './simulationActorsV2';
export { SimulationRunner } from './simulationRunner';
export { TokenSimulationService } from './tokenSimulationService';
export { TrustScoreOptimizer } from './trustScoreOptimizer';

// Service instances for convenience
import { SimulationService } from './SimulationService';
import { PriceDataService } from './PriceDataService';
import { TrustScoreService } from './TrustScoreService';
import type { IAgentRuntime } from '@elizaos/core';

export function createServices(runtime?: IAgentRuntime) {
  return {
    simulation: new SimulationService(),
    priceData: runtime ? new PriceDataService(runtime) : null,
    trustScore: new TrustScoreService()
  };
} 