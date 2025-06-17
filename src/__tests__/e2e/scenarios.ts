import type { TestSuite, IAgentRuntime } from '@elizaos/core';
import { strict as assert } from 'node:assert';
import { setupScenario, sendMessageAndWaitForResponse } from './test-utils';
import { CommunityInvestorService } from '../../service';
import { ServiceType, TRUST_MARKETPLACE_COMPONENT_TYPE, UserTrustProfile } from '../../types';

export const agentScenariosSuite: TestSuite = {
  name: 'SocialFi Trust Marketplace Scenarios',
  tests: [
    {
      name: "Scenario 1: User makes a simple BUY recommendation",
      fn: async (runtime: IAgentRuntime) => {
        // 1. Setup
        const { user, room } = await setupScenario(runtime);
        const service = runtime.getService<CommunityInvestorService>(ServiceType.COMMUNITY_INVESTOR);
        assert(service, "CommunityInvestorService should be available");

        // 2. Act
        await sendMessageAndWaitForResponse(
          runtime,
          room,
          user,
          'I think $SOL is going to pump, looks like a great buy here.'
        );
        
        // Give time for async tasks to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Assert
        const profileComponent = await runtime.getComponent(user.id!, TRUST_MARKETPLACE_COMPONENT_TYPE, service.componentWorldId, runtime.agentId!);
        assert(profileComponent, "UserTrustProfile component should have been created");

        const profile = profileComponent.data as unknown as UserTrustProfile;
        assert(profile.recommendations.length > 0, "A recommendation should have been added to the profile");
        
        const newRec = profile.recommendations[0];
        assert.strictEqual(newRec.recommendationType, 'BUY', "Recommendation type should be BUY");
        assert.strictEqual(newRec.tokenTicker, 'SOL', "Token ticker should be SOL");
        
        assert(profile.trustScore !== 0, "User's trust score should have been calculated and should not be the default zero");
      },
    },
    {
      name: "Scenario 2: User makes a SELL recommendation (FUD)",
      fn: async (runtime: IAgentRuntime) => {
        const { user, room } = await setupScenario(runtime);
        const service = runtime.getService<CommunityInvestorService>(ServiceType.COMMUNITY_INVESTOR);
        assert(service, "CommunityInvestorService should be available");

        await sendMessageAndWaitForResponse(runtime, room, user, '$SOL is a rugpull, sell now!');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const profileComponent = await runtime.getComponent(user.id!, TRUST_MARKETPLACE_COMPONENT_TYPE, service.componentWorldId, runtime.agentId!);
        assert(profileComponent, "UserTrustProfile component should have been created");
        const profile = profileComponent.data as unknown as UserTrustProfile;
        assert(profile.recommendations.length > 0, "A recommendation should have been added");
        assert.strictEqual(profile.recommendations[0].recommendationType, 'SELL', "Recommendation type should be SELL");
      },
    },
    {
      name: "Scenario 3: User sends an irrelevant message",
      fn: async (runtime: IAgentRuntime) => {
        const { user, room } = await setupScenario(runtime);
        const service = runtime.getService<CommunityInvestorService>(ServiceType.COMMUNITY_INVESTOR);
        assert(service, "CommunityInvestorService should be available");

        await sendMessageAndWaitForResponse(runtime, room, user, 'Hello, how is everyone today?');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const profileComponent = await runtime.getComponent(user.id!, TRUST_MARKETPLACE_COMPONENT_TYPE, service.componentWorldId, runtime.agentId!);
        assert(!profileComponent, "UserTrustProfile component should NOT have been created for an irrelevant message");
      },
    },
    {
      name: "Scenario 4: User provides a contract address",
      fn: async (runtime: IAgentRuntime) => {
        const { user, room } = await setupScenario(runtime);
        const service = runtime.getService<CommunityInvestorService>(ServiceType.COMMUNITY_INVESTOR);
        assert(service, "CommunityInvestorService should be available");

        const tokenAddress = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzL7WDb43cuQu2'; // WIF address
        await sendMessageAndWaitForResponse(runtime, room, user, `Check out this new token ${tokenAddress}, it's going to be huge`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const profileComponent = await runtime.getComponent(user.id!, TRUST_MARKETPLACE_COMPONENT_TYPE, service.componentWorldId, runtime.agentId!);
        assert(profileComponent, "UserTrustProfile component should have been created");
        
        const profile = profileComponent.data as unknown as UserTrustProfile;
        assert(profile.recommendations.length > 0, "A recommendation should have been added");
        const newRec = profile.recommendations[0];
        assert.strictEqual(newRec.tokenAddress, tokenAddress, "Recommendation should be for the provided contract address");
      },
    },
  ],
};

export default agentScenariosSuite; 