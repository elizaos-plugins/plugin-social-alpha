import type { TestSuite, TestCase } from '@elizaos/core';
import { serviceTestSuite } from './service';
import { eventsTestSuite } from './events';
import { trustScoreTestSuite } from './trustScore';
import { communityInvestorE2ETestSuite } from './socialAlpha.e2e';

const testCases: TestCase[] = [
  ...serviceTestSuite.tests,
  // ...eventsTestSuite.tests,
  // ...trustScoreTestSuite.tests,
  // ...communityInvestorE2ETestSuite.tests,
];

export const tests: TestSuite = {
  name: 'CommunityInvestor Plugin - All Tests',
  tests: testCases,
};
