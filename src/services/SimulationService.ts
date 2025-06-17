import { UUID } from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SupportedChain, Conviction } from '../types';

// Re-export types from the original services
export { 
  TokenScenario,
  SimulationConfig,
  SimulationResult,
  SimulatedCallData,
  ActorConfig,
  SimulationToken,
  TokenPrice
} from './simulationRunner';

export {
  SimulatedCallV2,
  ActorArchetypeV2,
  SimulatedActorV2
} from './simulationActorsV2';

export { TokenScenario as TokenScenarioInterface } from './tokenSimulationService';

// Import the original services
import { SimulationRunner } from './simulationRunner';
import { SimulationActorsServiceV2 } from './simulationActorsV2';
import { TokenSimulationService } from './tokenSimulationService';

/**
 * Consolidated Simulation Service that combines all simulation functionality
 */
export class SimulationService {
  private simulationRunner: SimulationRunner;
  private actorsService: SimulationActorsServiceV2;
  private tokenService: TokenSimulationService;

  constructor() {
    this.simulationRunner = new SimulationRunner();
    this.actorsService = new SimulationActorsServiceV2();
    this.tokenService = new TokenSimulationService();
  }

  // ========== Simulation Runner Methods ==========
  
  async runSimulation(config: any): Promise<any> {
    return this.simulationRunner.runSimulation(config);
  }

  async loadCachedSimulation(outputDir: string): Promise<any> {
    return this.simulationRunner.loadCachedSimulation(outputDir);
  }

  // ========== Actors Service Methods ==========

  generateCallsForActor(
    actor: any,
    token: any,
    tokenScenario: any,
    currentStep: number,
    priceHistory: any[]
  ): any {
    return this.actorsService.generateCallsForActor(
      actor,
      token,
      tokenScenario,
      currentStep,
      priceHistory
    );
  }

  getAllActors(): any[] {
    return this.actorsService.getAllActors();
  }

  getActorById(id: UUID): any {
    return this.actorsService.getActorById(id);
  }

  getExpectedRankings(): any[] {
    return this.actorsService.getExpectedRankings();
  }

  // ========== Token Service Methods ==========

  createTokenFromScenario(scenario: any): any {
    return this.tokenService.createTokenFromScenario(scenario);
  }

  getAllScenarios(): any[] {
    return this.tokenService.getAllScenarios();
  }

  getScenarioBySymbol(symbol: string): any {
    return this.tokenService.getScenarioBySymbol(symbol);
  }

  generateDiverseTokenSet(): any[] {
    return this.tokenService.generateDiverseTokenSet();
  }

  // ========== Convenience Methods ==========

  /**
   * Create default actors for testing
   */
  createDefaultActors(): any[] {
    return [
      {
        id: uuidv4() as UUID,
        username: 'EliteTrader',
        archetype: 'elite_analyst',
        expectedTrustScore: 95,
        tokenPreferences: ['SUCCESSFUL', 'RUNNER_MOON', 'BLUE_CHIP'],
        callFrequency: 'medium',
        timingBias: 'early',
      },
      {
        id: uuidv4() as UUID,
        username: 'RugPromotoor',
        archetype: 'rug_promoter',
        expectedTrustScore: 10,
        tokenPreferences: ['RUG_PULL_FAST', 'RUG_PULL_SLOW', 'SCAM_TOKEN'],
        callFrequency: 'high',
        timingBias: 'early',
      },
      // Add more default actors as needed
    ];
  }

  /**
   * Run a quick test simulation
   */
  async runTestSimulation(): Promise<any> {
    const config = {
      startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endTime: new Date(),
      timeStepMinutes: 60,
      tokenCount: 20,
      actors: this.createDefaultActors(),
      outputDir: './simulation-cache',
      cacheResults: true,
    };

    return this.runSimulation(config);
  }
} 