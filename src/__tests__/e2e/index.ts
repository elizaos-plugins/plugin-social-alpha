import type { TestSuite } from "@elizaos/core";
import trustAlgorithmBenchmarkSuite from "./benchmarks/trust_algorithm.benchmark";

// Import existing test suites
import { communityInvestorE2ETestSuite } from "./socialAlpha";
import { eventsTestSuite } from "./events";
import { trustScoreTestSuite } from "./trustScore";
import { agentScenariosSuite } from "./scenarios";
import { trustScenariosE2ETestSuite } from "./trustScenariosE2E";
import { trustOptimizationE2ETestSuite } from "./trustOptimizationE2E";
// socialAlphaTestSuite is already included as communityInvestorE2ETestSuite

// Unit tests are in separate files and run via vitest directly:
// - trustScoreV2.test.ts - Unit tests for Trust Score V2 calculations

export const testSuites: TestSuite[] = [
  // Benchmark test suite
  trustAlgorithmBenchmarkSuite,
  
  // Existing test suites
  communityInvestorE2ETestSuite,
  eventsTestSuite,
  trustScoreTestSuite,
  agentScenariosSuite,
  trustScenariosE2ETestSuite,
  trustOptimizationE2ETestSuite,
];

export default testSuites; 