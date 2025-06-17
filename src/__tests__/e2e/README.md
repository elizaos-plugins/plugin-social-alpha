# Trust Optimization E2E Tests

This directory contains end-to-end (E2E) tests for the Trust Score Optimization system, following ElizaOS testing patterns.

## Test Structure

### E2E Test Suites

All E2E tests are organized as `TestSuite` objects that receive a live `IAgentRuntime` instance:

- **`trustScenariosE2E.ts`** - Tests trust score gaming prevention scenarios
- **`trustOptimizationE2E.ts`** - Tests the full optimization pipeline:
  - Simulation Runner E2E
  - Score Calculation E2E  
  - Parameter Optimization E2E
  - Integration Test E2E

### Unit Tests

Unit tests use Vitest and mock dependencies:

- **`__tests__/trustScoreV2.test.ts`** - Unit tests for trust score calculations

## Running Tests

### Run All E2E Tests
```bash
# From plugin root directory
elizaos test
```

### Run Specific E2E Test Suite
```bash
# Run only trust optimization tests
elizaos test --name "Trust Score Optimization E2E Suite"

# Run specific test case
elizaos test --name "Trust Optimization - Simulation Runner E2E"
```

### Run Unit Tests
```bash
# Run all unit tests
npm test

# Run in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

### Using the Helper Script
```bash
# Run all E2E tests
npm run test:e2e

# Run specific test suite
npm run test:e2e "Trust Score Optimization E2E Suite"
```

## Writing New E2E Tests

1. Create a new test file in `src/tests/`
2. Import the required types:
   ```typescript
   import type { TestCase, TestSuite, IAgentRuntime } from "@elizaos/core";
   ```

3. Define test cases that accept `IAgentRuntime`:
   ```typescript
   export const myTestCases: TestCase[] = [
     {
       name: "My Test Case",
       fn: async (runtime: IAgentRuntime): Promise<void> => {
         // Test implementation using live runtime
       }
     }
   ];
   ```

4. Export as a test suite:
   ```typescript
   export const myTestSuite: TestSuite = {
     name: "My Test Suite",
     tests: myTestCases
   };
   ```

5. Register in `src/tests/index.ts`:
   ```typescript
   import { myTestSuite } from "./myTestSuite";
   
   export const testSuites: TestSuite[] = [
     // ... existing suites
     myTestSuite,
   ];
   ```

## Test Best Practices

### E2E Tests
- Use the live `IAgentRuntime` - no mocks
- Test full workflows and integrations
- Verify data flows between components
- Clean up any test artifacts (cache files, etc.)
- Use descriptive console.log messages for test progress

### Unit Tests  
- Mock all external dependencies
- Test individual functions in isolation
- Use factory functions for consistent test data
- Keep tests fast and focused

## Test Data

The tests use deterministic data generation to ensure reproducible results:

- **Token Scenarios**: 9 predefined token types (rug pulls, scams, runners, etc.)
- **Actor Archetypes**: 9 actor types with expected behaviors
- **Simulation Parameters**: Configurable time ranges, step sizes, and distributions

## Debugging Tests

### Enable Verbose Output
```bash
# Set DEBUG environment variable
DEBUG=* elizaos test
```

### Run Single Test
Focus on a specific test by using its exact name:
```bash
elizaos test --name "Trust Optimization - Simulation Runner E2E"
```

### Check Test Artifacts
Some tests create cache directories or files. Check:
- `./simulation-cache/` - Simulation results
- `./test-*-cache/` - Test-specific caches

Remember to clean these up after debugging. 