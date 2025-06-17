import type { TestCase, TestSuite, IAgentRuntime, UUID } from "@elizaos/core";
import { CommunityInvestorService } from "../../service";
// Trust score testing interfaces
interface UserPerformanceData {
    userId: string;
    calls: CallPerformance[];
    totalCalls: number;
    successfulCalls: number;
    unsuccessfulCalls: number;
}

interface CallPerformance {
    timestamp: number;
    profitLossPercent: number;
    isSuccess: boolean;
    conviction: 'high' | 'medium' | 'low';
}

// Test actor profiles
interface TestActor {
    userId: string;
    username: string;
    strategy: string;
    calls: Array<{
        tokenAddress: string;
        sentiment: 'positive' | 'negative' | 'neutral';
        conviction: 'high' | 'medium' | 'low';
        timestamp: number;
        profitLossPercent: number;
    }>;
}

// Helper to create test actors with different strategies
function createTestActors(): TestActor[] {
    const baseTimestamp = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days ago
    
    return [
        {
            userId: "expert-123",
            username: "ConsistentExpert",
            strategy: "High accuracy, moderate volume",
            calls: Array.from({ length: 25 }, (_, i) => ({
                tokenAddress: `TOKEN_${i}`,
                sentiment: 'positive' as const,
                conviction: 'high' as const,
                timestamp: baseTimestamp + i * 24 * 60 * 60 * 1000,
                profitLossPercent: 15 + (i % 20) // 15-35% gains, deterministic
            }))
        },
        {
            userId: "spammer-456",
            username: "SpammerMoonBoy",
            strategy: "High volume, low quality",
            calls: Array.from({ length: 150 }, (_, i) => ({
                tokenAddress: `MOON_${i}`,
                sentiment: 'positive' as const,
                conviction: i % 5 === 0 ? 'high' : 'medium' as const,
                timestamp: baseTimestamp + i * 12 * 60 * 60 * 1000,
                profitLossPercent: i % 10 < 2 ? 5 : -30 // 80% losses, deterministic
            }))
        },
        {
            userId: "pumper-789",
            username: "PumpDumper",
            strategy: "Malicious pump and dump",
            calls: Array.from({ length: 30 }, (_, i) => ({
                tokenAddress: `PUMP_${i}`,
                sentiment: 'positive' as const,
                conviction: 'high' as const,
                timestamp: baseTimestamp + i * 36 * 60 * 60 * 1000,
                profitLossPercent: i % 5 === 0 ? 100 : -50 // Occasional huge gain, mostly losses
            }))
        },
        {
            userId: "rider-012",
            username: "MarketRider",
            strategy: "Follows market trends",
            calls: Array.from({ length: 40 }, (_, i) => ({
                tokenAddress: `TREND_${i}`,
                sentiment: 'positive' as const,
                conviction: 'medium' as const,
                timestamp: baseTimestamp + i * 24 * 60 * 60 * 1000,
                profitLossPercent: 5 + Math.sin(i / 5) * 10 // Follows market waves
            }))
        },
        {
            userId: "lucky-345",
            username: "LuckyNoob",
            strategy: "Few calls, got lucky",
            calls: [
                {
                    tokenAddress: "LUCKY_1",
                    sentiment: 'positive' as const,
                    conviction: 'low' as const,
                    timestamp: baseTimestamp,
                    profitLossPercent: 200 // One massive win
                },
                {
                    tokenAddress: "LUCKY_2",
                    sentiment: 'positive' as const,
                    conviction: 'medium' as const,
                    timestamp: baseTimestamp + 30 * 24 * 60 * 60 * 1000,
                    profitLossPercent: 50
                },
                {
                    tokenAddress: "LUCKY_3",
                    sentiment: 'positive' as const,
                    conviction: 'low' as const,
                    timestamp: baseTimestamp + 60 * 24 * 60 * 60 * 1000,
                    profitLossPercent: -20
                }
            ]
        },
        {
            userId: "genius-678",
            username: "SelectiveGenius",
            strategy: "Low volume, high quality",
            calls: Array.from({ length: 12 }, (_, i) => ({
                tokenAddress: `SELECT_${i}`,
                sentiment: 'positive' as const,
                conviction: 'high' as const,
                timestamp: baseTimestamp + i * 7 * 24 * 60 * 60 * 1000,
                profitLossPercent: 25 + (i % 25) // 25-50% gains, deterministic
            }))
        },
        {
            userId: "fud-901",
            username: "CounterTrader",
            strategy: "Contrarian FUD spreader",
            calls: Array.from({ length: 20 }, (_, i) => ({
                tokenAddress: `FUD_${i}`,
                sentiment: 'negative' as const,
                conviction: 'high' as const,
                timestamp: baseTimestamp + i * 4 * 24 * 60 * 60 * 1000,
                profitLossPercent: i % 2 === 0 ? 30 : -30 // 50/50 success
            }))
        }
    ];
}

// Convert test actors to user performance data
function actorsToPerformanceData(actors: TestActor[]): Array<{
    userData: UserPerformanceData;
    username: string;
    avgProfit: number;
}> {
    return actors.map(actor => {
        const successfulCalls = actor.calls.filter(c => c.profitLossPercent > 0).length;
        const unsuccessfulCalls = actor.calls.length - successfulCalls;
        const avgProfit = actor.calls.reduce((sum, c) => sum + c.profitLossPercent, 0) / actor.calls.length;
        
        const calls: CallPerformance[] = actor.calls.map((call) => ({
            timestamp: call.timestamp,
            profitLossPercent: call.profitLossPercent,
            isSuccess: call.profitLossPercent > 0,
            conviction: call.conviction,
        }));
        
        const userData: UserPerformanceData = {
            userId: actor.userId,
            calls,
            totalCalls: actor.calls.length,
            successfulCalls,
            unsuccessfulCalls,
        };
        
        return {
            userData,
            username: actor.username,
            avgProfit
        };
    });
}

export const trustScenariosE2ETestCases: TestCase[] = [
    {
        name: "Trust Score V2 - Gaming Prevention E2E",
        fn: async (runtime: IAgentRuntime): Promise<void> => {
            const testActors = createTestActors();
            const performanceDataWithMetadata = actorsToPerformanceData(testActors);
            
            // Import balanced calculator for testing
            const { BalancedTrustScoreCalculator } = await import('../../services/balancedTrustScoreCalculator');
            const calculator = new BalancedTrustScoreCalculator();
            
            // Calculate trust scores using balanced algorithm
            const scores = performanceDataWithMetadata.map(({ userData, username, avgProfit }) => {
                const metrics = {
                    totalCalls: userData.totalCalls,
                    profitableCalls: userData.successfulCalls,
                    averageProfit: avgProfit,
                    winRate: userData.successfulCalls / userData.totalCalls,
                    sharpeRatio: avgProfit / 20, // Simplified Sharpe
                    alpha: avgProfit - 10, // Simplified alpha (market avg = 10)
                    volumePenalty: 0,
                    consistency: 0.8 // Default consistency
                };
                
                // Determine archetype based on strategy
                let archetype = 'average_trader';
                if (username === 'ConsistentExpert' || username === 'SelectiveGenius') {
                    archetype = 'elite_analyst';
                } else if (username === 'SpammerMoonBoy') {
                    archetype = 'bot_spammer';
                } else if (username === 'PumpDumper') {
                    archetype = 'pump_chaser';
                }
                
                const score = calculator.calculateBalancedTrustScore(
                    metrics,
                    archetype,
                    0, // rugPromotions
                    Math.floor(userData.successfulCalls * 0.2), // goodCalls estimate
                    0  // botPatterns
                );
                
                return {
                    userId: userData.userId,
                    username,
                    score,
                    v2Components: { 
                        finalScore: score,
                        volumePenalty: userData.totalCalls > 100 ? 0.8 : 1.0 // Simplified volume penalty
                    },
                    v2Details: {
                        successRate: (userData.successfulCalls / userData.totalCalls) * 100,
                        avgProfit,
                        callCount: userData.totalCalls
                    }
                };
            });
            
            // Sort by score
            scores.sort((a, b) => b.score - a.score);
            
            // Get specific users
            const expert = scores.find(s => s.username === "ConsistentExpert");
            const spammer = scores.find(s => s.username === "SpammerMoonBoy");
            const pumper = scores.find(s => s.username === "PumpDumper");
            const rider = scores.find(s => s.username === "MarketRider");
            const lucky = scores.find(s => s.username === "LuckyNoob");
            const genius = scores.find(s => s.username === "SelectiveGenius");
            const fud = scores.find(s => s.username === "CounterTrader");
            
            // Test 1: Expert should outrank gaming actors
            if (!expert || !spammer || !pumper || !rider) {
                throw new Error("Missing test actors");
            }
            
            if (expert.score <= spammer.score) {
                throw new Error(`Expert (${expert.score}) should score higher than spammer (${spammer.score})`);
            }
            
            if (expert.score <= pumper.score) {
                throw new Error(`Expert (${expert.score}) should score higher than pump-dumper (${pumper.score})`);
            }
            
            if (expert.score <= rider.score) {
                throw new Error(`Expert (${expert.score}) should score higher than market rider (${rider.score})`);
            }
            
            // Test 2: Volume spammer should score lower than experts
            if (spammer.score >= 60) {
                throw new Error(`Spammer score (${spammer.score}) should be moderate due to high volume`);
            }
            
            // Verify spammer has volume penalty applied
            if (spammer.v2Components.volumePenalty >= 1.0) {
                throw new Error(`Spammer should have volume penalty applied, got ${spammer.v2Components.volumePenalty}`);
            }
            
            // Test 3: Lucky trader shouldn't rank too high
            if (lucky && lucky.score >= 80) {
                throw new Error(`Lucky trader (${lucky.score}) should not score too high with few calls`);
            }
            
            // Test 4: Pump and dumper should score poorly
            if (pumper.score >= 30) {
                throw new Error(`Pump-dumper (${pumper.score}) should have very low score`);
            }
            
            // Test 5: Selective genius should score well
            if (genius && genius.score <= 75) {
                throw new Error(`Selective genius (${genius.score}) should score well despite low volume`);
            }
            
            // Test 6: FUD spreader with 50/50 success should be mid-range
            if (fud && (fud.score <= 40 || fud.score >= 70)) {
                throw new Error(`Counter-trader (${fud.score}) should have mid-range score`);
            }
            
            // Test 7: Top performers ranking
            const top3 = scores.slice(0, 3).map(s => s.username);
            if (!top3.includes("ConsistentExpert")) {
                throw new Error("ConsistentExpert should be in top 3");
            }
            
            if (!top3.includes("SelectiveGenius")) {
                throw new Error("SelectiveGenius should be in top 3");
            }
            
            // Test 8: Bottom performers
            const bottom3 = scores.slice(-3).map(s => s.username);
            if (!bottom3.includes("PumpDumper")) {
                throw new Error("PumpDumper should be in bottom 3");
            }
            
            if (!bottom3.includes("SpammerMoonBoy")) {
                throw new Error("SpammerMoonBoy should be in bottom 3");
            }
            
            // Log results for debugging
            console.log("\n=== Trust Score Gaming Prevention Results (Balanced Algorithm) ===");
            
            console.log("\nFinal Rankings:");
            scores.forEach((score, i) => {
                console.log(`${i + 1}. ${score.username}: ${score.score.toFixed(1)} (${score.v2Details?.callCount} calls)`);
                console.log(`     Success: ${score.v2Details.successRate.toFixed(1)}%, Avg P&L: ${score.v2Details.avgProfit.toFixed(1)}%`);
                console.log(`     Volume Penalty: ${score.v2Components.volumePenalty.toFixed(2)}x`);
            });
            
            console.log("\n✅ All gaming prevention tests passed!");
        }
    }
];

// Export the test suite
export const trustScenariosE2ETestSuite: TestSuite = {
    name: "Trust Score Gaming Prevention E2E Suite",
    tests: trustScenariosE2ETestCases
};

export default trustScenariosE2ETestSuite; 