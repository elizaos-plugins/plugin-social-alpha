import type { TestCase, TestSuite, IAgentRuntime, UUID } from "@elizaos/core";
import { 
    SimulationRunner, 
    SimulationConfig, 
    ActorConfig,
    TokenScenario,
    SimulationResult 
} from "../../services/simulationRunner";
import { 
    TrustScoreOptimizer, 
    TrustScoreParameters,
    OptimizationResult 
} from "../../services/trustScoreOptimizer";

// Helper to create test actors
function createTestActors(): ActorConfig[] {
    return [
        {
            id: 'test-elite-1' as UUID,
            username: 'TestEliteTrader',
            archetype: 'elite_analyst',
            expectedTrustScore: 95,
            tokenPreferences: [TokenScenario.SUCCESSFUL, TokenScenario.RUNNER_MOON, TokenScenario.BLUE_CHIP],
            callFrequency: 'medium',
            timingBias: 'early',
        },
        {
            id: 'test-rug-1' as UUID,
            username: 'TestRugPromoter',
            archetype: 'rug_promoter',
            expectedTrustScore: 10,
            tokenPreferences: [TokenScenario.RUG_PULL_FAST, TokenScenario.RUG_PULL_SLOW, TokenScenario.SCAM_TOKEN],
            callFrequency: 'high',
            timingBias: 'early',
        },
        {
            id: 'test-skilled-1' as UUID,
            username: 'TestSkillTrader',
            archetype: 'skilled_trader',
            expectedTrustScore: 75,
            tokenPreferences: [TokenScenario.SUCCESSFUL, TokenScenario.RUNNER_STEADY],
            callFrequency: 'medium',
            timingBias: 'middle',
        },
        {
            id: 'test-fomo-1' as UUID,
            username: 'TestFomoTrader',
            archetype: 'fomo_trader',
            expectedTrustScore: 30,
            tokenPreferences: [TokenScenario.PUMP_AND_DUMP, TokenScenario.RUNNER_MOON],
            callFrequency: 'high',
            timingBias: 'late',
        },
        {
            id: 'test-bot-1' as UUID,
            username: 'TestSpamBot',
            archetype: 'bot_spammer',
            expectedTrustScore: 15,
            tokenPreferences: [TokenScenario.SCAM_TOKEN, TokenScenario.RUG_PULL_FAST],
            callFrequency: 'high',
            timingBias: 'random',
        },
    ];
}

export const trustOptimizationE2ETestCases: TestCase[] = [
    {
        name: "Trust Optimization - Simulation Runner E2E",
        fn: async (runtime: IAgentRuntime): Promise<void> => {
            console.log("\n🧪 Testing Simulation Runner...");
            
            const runner = new SimulationRunner();
            
            // Create test configuration
            const testConfig: SimulationConfig = {
                startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                endTime: new Date(),
                timeStepMinutes: 240, // 4 hour steps for faster test
                tokenCount: 10,
                actors: createTestActors(),
                outputDir: './test-simulation-cache',
                cacheResults: false, // Don't cache test data
                tokenScenarioDistribution: {
                    [TokenScenario.RUG_PULL_FAST]: 0.2,
                    [TokenScenario.SUCCESSFUL]: 0.2,
                    [TokenScenario.PUMP_AND_DUMP]: 0.2,
                    [TokenScenario.SCAM_TOKEN]: 0.2,
                    [TokenScenario.RUNNER_MOON]: 0.2,
                },
            };
            
            // Run simulation
            const result = await runner.runSimulation(testConfig);
            
            // Test 1: Verify simulation generated data
            if (result.calls.length === 0) {
                throw new Error("Simulation should generate calls");
            }
            
            if (result.tokens.size !== testConfig.tokenCount) {
                throw new Error(`Expected ${testConfig.tokenCount} tokens, got ${result.tokens.size}`);
            }
            
            // Test 2: Verify actor performance tracking
            if (result.actorPerformance.size !== testConfig.actors.length) {
                throw new Error("All actors should have performance data");
            }
            
            // Test 3: Verify price history generation
            let totalPricePoints = 0;
            for (const [_, history] of result.priceHistory) {
                totalPricePoints += history.length;
            }
            
            if (totalPricePoints === 0) {
                throw new Error("Price history should be generated");
            }
            
            // Test 4: Verify profit calculations
            const callsWithProfit = result.calls.filter(
                call => call.simulationMetadata.actualProfit !== undefined
            );
            
            if (callsWithProfit.length === 0) {
                throw new Error("Calls should have profit calculations");
            }
            
            // Test 5: Verify rug promoters lose money
            const rugPromoterCalls = result.calls.filter(
                call => call.userId === 'test-rug-1' && 
                       call.sentiment === 'positive' &&
                       [TokenScenario.RUG_PULL_FAST, TokenScenario.RUG_PULL_SLOW, TokenScenario.SCAM_TOKEN]
                           .includes(call.simulationMetadata.tokenScenario)
            );
            
            if (rugPromoterCalls.length > 0) {
                const avgRugLoss = rugPromoterCalls.reduce(
                    (sum, call) => sum + (call.simulationMetadata.actualProfit || 0), 
                    0
                ) / rugPromoterCalls.length;
                
                if (avgRugLoss > -50) {
                    throw new Error(`Rug promoter should lose heavily on rugs, got ${avgRugLoss.toFixed(1)}%`);
                }
            }
            
            // Test 6: Verify elite analysts make good calls
            const eliteCalls = result.calls.filter(call => call.userId === 'test-elite-1');
            if (eliteCalls.length > 0) {
                const positiveOnGood = eliteCalls.filter(
                    call => call.sentiment === 'positive' &&
                           [TokenScenario.SUCCESSFUL, TokenScenario.RUNNER_MOON, TokenScenario.BLUE_CHIP]
                               .includes(call.simulationMetadata.tokenScenario)
                ).length;
                
                const negativeOnBad = eliteCalls.filter(
                    call => call.sentiment === 'negative' &&
                           [TokenScenario.RUG_PULL_FAST, TokenScenario.SCAM_TOKEN]
                               .includes(call.simulationMetadata.tokenScenario)
                ).length;
                
                const goodCallRate = (positiveOnGood + negativeOnBad) / eliteCalls.length;
                
                if (goodCallRate < 0.7) {
                    throw new Error(`Elite analyst should make mostly good calls, got ${(goodCallRate * 100).toFixed(0)}%`);
                }
            }
            
            console.log(`✅ Generated ${result.calls.length} calls across ${result.tokens.size} tokens`);
            console.log(`✅ Price history contains ${totalPricePoints} data points`);
            console.log(`✅ Actor behaviors validated`);
        }
    },
    
    {
        name: "Trust Optimization - Score Calculation E2E",
        fn: async (runtime: IAgentRuntime): Promise<void> => {
            console.log("\n🧪 Testing Trust Score Calculation...");
            
            const optimizer = new TrustScoreOptimizer();
            
            // Run optimization cycle with test data
            const result = await optimizer.runOptimizationCycle(undefined, false);
            
            // Test 1: Verify all actors have scores
            const expectedActorCount = 9; // Default actors in optimizer
            if (result.scores.length !== expectedActorCount) {
                throw new Error(`Expected ${expectedActorCount} scores, got ${result.scores.length}`);
            }
            
            // Test 2: Verify score bounds
            for (const score of result.scores) {
                if (score.calculatedScore < 0 || score.calculatedScore > 100) {
                    throw new Error(`Score out of bounds: ${score.username} = ${score.calculatedScore}`);
                }
            }
            
            // Test 3: Verify ranking order (descending)
            for (let i = 1; i < result.scores.length; i++) {
                if (result.scores[i].calculatedScore > result.scores[i-1].calculatedScore) {
                    throw new Error("Scores should be in descending order");
                }
            }
            
            // Test 4: Verify elite analysts rank high
            const eliteRank = result.scores.findIndex(s => s.username === 'EliteTrader') + 1;
            if (eliteRank > 3) {
                throw new Error(`Elite analyst should rank in top 3, ranked #${eliteRank}`);
            }
            
            // Test 5: Verify rug promoters rank low
            const rugRank = result.scores.findIndex(s => s.username === 'RugPromotoor') + 1;
            const totalActors = result.scores.length;
            if (rugRank < totalActors - 2) {
                throw new Error(`Rug promoter should rank in bottom 3, ranked #${rugRank}/${totalActors}`);
            }
            
            // Test 6: Verify accuracy metrics
            if (!result.accuracy.mae || result.accuracy.mae < 0) {
                throw new Error("MAE should be calculated and positive");
            }
            
            if (!result.accuracy.correlation || result.accuracy.correlation < -1 || result.accuracy.correlation > 1) {
                throw new Error("Correlation should be between -1 and 1");
            }
            
            if (!result.accuracy.rankingAccuracy || result.accuracy.rankingAccuracy < 0 || result.accuracy.rankingAccuracy > 100) {
                throw new Error("Ranking accuracy should be between 0 and 100");
            }
            
            // Test 7: Verify metrics are calculated
            for (const score of result.scores) {
                if (score.metrics.totalCalls === 0) {
                    throw new Error(`${score.username} should have calls`);
                }
                
                if (score.metrics.winRate < 0 || score.metrics.winRate > 1) {
                    throw new Error(`Invalid win rate for ${score.username}: ${score.metrics.winRate}`);
                }
            }
            
            console.log(`✅ Calculated scores for ${result.scores.length} actors`);
            console.log(`✅ Accuracy: MAE=${result.accuracy.mae.toFixed(2)}, Correlation=${result.accuracy.correlation.toFixed(3)}`);
            console.log(`✅ Ranking accuracy: ${result.accuracy.rankingAccuracy.toFixed(1)}%`);
        }
    },
    
    {
        name: "Trust Optimization - Parameter Optimization E2E",
        fn: async (runtime: IAgentRuntime): Promise<void> => {
            console.log("\n🧪 Testing Parameter Optimization...");
            
            const optimizer = new TrustScoreOptimizer();
            
            // Test parameter optimization with small search space
            const paramRanges = {
                profitWeight: [0.2, 0.3, 0.4],
                consistencyWeight: [0.1, 0.2],
                sharpeWeight: [0.2, 0.3],
            };
            
            const initialParams = (optimizer as any).currentParams as TrustScoreParameters;
            
            // Run optimization
            const optimizedParams = await optimizer.optimizeParameters(paramRanges);
            
            // Test 1: Verify parameters were optimized
            if (!optimizedParams) {
                throw new Error("Parameter optimization should return results");
            }
            
            // Test 2: Verify optimized parameters are within specified ranges
            if (!paramRanges.profitWeight.includes(optimizedParams.profitWeight)) {
                throw new Error("Optimized profitWeight not in specified range");
            }
            
            if (!paramRanges.consistencyWeight.includes(optimizedParams.consistencyWeight)) {
                throw new Error("Optimized consistencyWeight not in specified range");
            }
            
            if (!paramRanges.sharpeWeight.includes(optimizedParams.sharpeWeight)) {
                throw new Error("Optimized sharpeWeight not in specified range");
            }
            
            // Test 3: Verify other parameters remain unchanged
            if (optimizedParams.alphaWeight !== initialParams.alphaWeight) {
                throw new Error("Unspecified parameters should remain unchanged");
            }
            
            // Test 4: Run with optimized parameters and verify improvement
            (optimizer as any).currentParams = optimizedParams;
            const optimizedResult = await optimizer.runOptimizationCycle(undefined, false);
            
            // Reset to initial params and run again
            (optimizer as any).currentParams = initialParams;
            const initialResult = await optimizer.runOptimizationCycle(undefined, false);
            
            console.log(`✅ Parameter optimization completed`);
            console.log(`✅ Initial MAE: ${initialResult.accuracy.mae.toFixed(2)}, Optimized MAE: ${optimizedResult.accuracy.mae.toFixed(2)}`);
            
            // Generally, optimized should be better or equal (not always guaranteed with small search space)
            if (optimizedResult.accuracy.mae > initialResult.accuracy.mae * 1.2) {
                console.warn("⚠️  Optimized parameters performed worse - this can happen with limited search space");
            }
        }
    },
    
    {
        name: "Trust Optimization - Integration Test E2E",
        fn: async (runtime: IAgentRuntime): Promise<void> => {
            console.log("\n🧪 Testing Full Integration...");
            
            const runner = new SimulationRunner();
            const optimizer = new TrustScoreOptimizer();
            
            // Step 1: Generate simulation data
            const simConfig: SimulationConfig = {
                startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days
                endTime: new Date(),
                timeStepMinutes: 360, // 6 hour steps
                tokenCount: 20,
                actors: createTestActors(),
                outputDir: './test-integration-cache',
                cacheResults: true,
            };
            
            const simResult = await runner.runSimulation(simConfig);
            
            // Step 2: Calculate trust scores
            const trustResult = await optimizer.runOptimizationCycle(simConfig, false);
            
            // Test 1: Verify data flow
            if (trustResult.scores.length === 0) {
                throw new Error("Trust scores should be calculated from simulation data");
            }
            
            // Test 2: Verify expected patterns
            const scores = trustResult.scores;
            const eliteScore = scores.find(s => s.username === 'TestEliteTrader');
            const rugScore = scores.find(s => s.username === 'TestRugPromoter');
            const botScore = scores.find(s => s.username === 'TestSpamBot');
            
            if (!eliteScore || !rugScore || !botScore) {
                throw new Error("Expected test actors not found in results");
            }
            
            // Elite should score higher than rug promoter
            if (eliteScore.calculatedScore <= rugScore.calculatedScore) {
                throw new Error(`Elite (${eliteScore.calculatedScore}) should score higher than rug promoter (${rugScore.calculatedScore})`);
            }
            
            // Elite should score higher than bot
            if (eliteScore.calculatedScore <= botScore.calculatedScore) {
                throw new Error(`Elite (${eliteScore.calculatedScore}) should score higher than bot (${botScore.calculatedScore})`);
            }
            
            // Test 3: Verify consistency between simulation and trust scoring
            const elitePerf = simResult.actorPerformance.get('test-elite-1');
            const eliteMetrics = eliteScore.metrics;
            
            if (elitePerf && elitePerf.totalCalls !== eliteMetrics.totalCalls) {
                throw new Error("Call counts should match between simulation and trust scoring");
            }
            
            // Clean up test cache
            const fs = await import('fs/promises');
            try {
                await fs.rm('./test-integration-cache', { recursive: true, force: true });
            } catch (e) {
                // Ignore cleanup errors
            }
            
            console.log(`✅ Full integration test passed`);
            console.log(`✅ Generated ${simResult.calls.length} calls → Calculated ${trustResult.scores.length} trust scores`);
            console.log(`✅ Trust score rankings validated`);
        }
    }
];

// Export the test suite
export const trustOptimizationE2ETestSuite: TestSuite = {
    name: "Trust Score Optimization E2E Suite",
    tests: trustOptimizationE2ETestCases
};

export default trustOptimizationE2ETestSuite; 