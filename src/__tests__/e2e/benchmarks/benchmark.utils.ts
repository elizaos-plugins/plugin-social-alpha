import type { IAgentRuntime, UUID, Component } from '@elizaos/core';
import { logger } from '@elizaos/core';
import type { CommunityInvestorService } from '../../../service';
import {
  ServiceType,
  TRUST_MARKETPLACE_COMPONENT_TYPE,
  type UserTrustProfile,
  type TokenAPIData,
  Conviction,
  type TrustMarketplaceComponentData,
  SupportedChain,
  type Recommendation,
  RecommendationMetric,
} from '../../../types';
import type { SimulatedActor, SimulatedCall } from '../../../simulationActors';
import type { MockPriceService } from '../../../mockPriceService';
import { v4 as uuidv4 } from 'uuid';

export interface BenchmarkSimulationParams {
  durationSteps: number;
  actors: SimulatedActor[];
  priceService: MockPriceService;
  outputBasePath: string; // Path to save benchmark data files
  benchmarkName: string;
  // Potentially add ATH window parameter here if it needs to be dynamic per benchmark run
  optimisticAthWindowDays?: number;
}

export interface BenchmarkStepMetrics {
  step: number;
  actorScores: Record<UUID, { username: string; archetype: string; score: number }>;
  callsMadeThisStep: SimulatedCall[]; // Renamed for clarity
}

// Placeholder for more detailed P&L data to be logged per call
export interface CallPnlData {
  callId: UUID;
  actorId: UUID;
  tokenAddress: string;
  recommendationType: 'BUY' | 'SELL';
  priceAtRecommendation?: number;
  potentialProfitPercent?: number;
  avoidedLossPercent?: number;
  isScamOrRug?: boolean;
  evaluationTimestamp: number;
  notes?: string;
  // Field to indicate if P&L was based on a specific ATH window for this benchmark run
  athWindowDaysUsed?: number;
}

interface ActorProfileCacheEntry {
  profile: UserTrustProfile;
  componentId: UUID;
  lastRuntimeSyncStep: number; // To track when it was last synced with runtime component state
}

/**
 * Core simulation engine for benchmarks.
 * This function will be called by individual benchmark TestCases.
 */
export async function runBenchmarkSimulation(
  runtime: IAgentRuntime,
  params: BenchmarkSimulationParams
): Promise<void> {
  logger.info(`[BenchmarkUtil] Starting benchmark: ${params.benchmarkName}`);
  const {
    durationSteps,
    actors,
    priceService,
    outputBasePath,
    benchmarkName,
    optimisticAthWindowDays,
  } = params;

  const communityInvestorService = runtime.getService<CommunityInvestorService>(
    ServiceType.COMMUNITY_INVESTOR
  );
  if (!communityInvestorService) {
    logger.error('[BenchmarkUtil] CommunityInvestorService not found! Cannot run simulation.');
    return;
  }

  // --- Monkey-patching CommunityInvestorService.getTokenAPIData ---
  const originalGetTokenAPIData =
    communityInvestorService.getTokenAPIData.bind(communityInvestorService);
  const originalEvaluateRecommendationPerformance =
    communityInvestorService.evaluateRecommendationPerformance.bind(communityInvestorService);

  communityInvestorService.getTokenAPIData = async (
    address,
    chain,
    step?: number
  ): Promise<TokenAPIData | null> => {
    logger.debug(
      `[BenchmarkUtil-PATCHED_getTokenAPIData] Called for Address: ${address}, Chain: ${chain}, Step: ${step}`
    );
    const data = await priceService.getTokenAPIData(address, chain, step);
    logger.debug(
      `[BenchmarkUtil-PATCHED_getTokenAPIData] MockPriceService returned: ${data ? Object.keys(data).length : 'null'} keys`
    );
    return data;
  };

  // If optimisticAthWindowDays is provided, we might need to patch evaluateRecommendationPerformance
  // or ensure it can receive this context. For now, this is a simplified patch.
  if (optimisticAthWindowDays !== undefined) {
    communityInvestorService.evaluateRecommendationPerformance = async (
      recommendation: Recommendation,
      tokenData: TokenAPIData
    ): Promise<RecommendationMetric> => {
      logger.info(
        `[DEBUG_EVAL_PATCH] Evaluating rec: ${recommendation.id} for ${recommendation.tokenAddress}, type: ${recommendation.recommendationType}, priceAtRec: ${recommendation.priceAtRecommendation}`
      );
      logger.debug(`[DEBUG_EVAL_PATCH] TokenData for eval: ${JSON.stringify(tokenData)}`);

      const baseMetric = await originalEvaluateRecommendationPerformance(recommendation, tokenData);
      logger.info(
        `[DEBUG_EVAL_PATCH] Base metric from original for ${recommendation.id}: ${JSON.stringify(baseMetric)}`
      );

      if (
        recommendation.recommendationType === 'BUY' &&
        recommendation.priceAtRecommendation !== undefined &&
        recommendation.priceAtRecommendation > 0 &&
        tokenData.priceHistory
      ) {
        const recommendationStep = priceService.getStepFromTimestamp(recommendation.timestamp);
        logger.debug(
          `[DEBUG_EVAL_PATCH] Rec step: ${recommendationStep}, Optimistic Window: ${optimisticAthWindowDays} days`
        );
        if (recommendationStep !== null) {
          const athInWindow = priceService.getAthInWindow(
            recommendation.tokenAddress,
            recommendation.chain,
            recommendationStep,
            optimisticAthWindowDays
          );
          logger.debug(
            `[DEBUG_EVAL_PATCH] ATH in window for ${recommendation.tokenAddress}: ${athInWindow}`
          );
          if (athInWindow !== null && athInWindow > recommendation.priceAtRecommendation) {
            // ensure ATH is profitable
            const pnlPercentFromWindowAth =
              ((athInWindow - recommendation.priceAtRecommendation) /
                recommendation.priceAtRecommendation) *
              100;
            baseMetric.potentialProfitPercent = pnlPercentFromWindowAth;
            baseMetric.notes = `${baseMetric.notes || ''} (ATH Window ${optimisticAthWindowDays}d: ${pnlPercentFromWindowAth.toFixed(2)}% from price ${recommendation.priceAtRecommendation} to ATH ${athInWindow})`;
            logger.info(
              `[DEBUG_EVAL_PATCH] Overrode P&L for BUY rec ${recommendation.id} using ${optimisticAthWindowDays}-day ATH: ${pnlPercentFromWindowAth.toFixed(2)}%`
            );
          }
        }
      }
      logger.info(
        `[DEBUG_EVAL_PATCH] Final metric for ${recommendation.id}: ${JSON.stringify(baseMetric)}`
      );
      return baseMetric;
    };
  } else {
    // If not using optimistic ATH window, still log the call to the original evaluateRecommendationPerformance
    communityInvestorService.evaluateRecommendationPerformance = async (
      recommendation: Recommendation,
      tokenData: TokenAPIData
    ): Promise<RecommendationMetric> => {
      logger.info(
        `[DEBUG_EVAL_ORIG_CALL] Evaluating rec: ${recommendation.id} for ${recommendation.tokenAddress}, type: ${recommendation.recommendationType}, priceAtRec: ${recommendation.priceAtRecommendation}`
      );
      logger.debug(`[DEBUG_EVAL_ORIG_CALL] TokenData for eval: ${JSON.stringify(tokenData)}`);
      const metric = await originalEvaluateRecommendationPerformance(recommendation, tokenData);
      logger.info(
        `[DEBUG_EVAL_ORIG_CALL] Metric from original for ${recommendation.id}: ${JSON.stringify(metric)}`
      );
      return metric;
    };
  }
  // --- End of monkey-patching ---

  const allStepMetrics: BenchmarkStepMetrics[] = [];
  const allCallPnlData: CallPnlData[] = [];

  const actorProfileDataStore = new Map<UUID, ActorProfileCacheEntry>();

  logger.info(
    `[BenchmarkUtil] Initializing ${actors.length} actor profiles for benchmark: ${benchmarkName}`
  );
  for (const actor of actors) {
    if (!communityInvestorService) {
      logger.error('[BenchmarkUtil] CIS null pre-actor-init');
      continue;
    }
    (communityInvestorService as any).registerUser(actor.id);

    logger.debug(
      `[BenchmarkUtil] Init profile for ${actor.username} (EntityID: ${actor.id}), world: ${communityInvestorService.componentWorldId}`
    );
    let userProfileComponent: Component | null = await runtime.getComponent(
      actor.id,
      TRUST_MARKETPLACE_COMPONENT_TYPE,
      communityInvestorService.componentWorldId,
      runtime.agentId
    );
    logger.debug(
      `[BenchmarkUtil] Initial fetch for ${actor.username}: Component ID ${userProfileComponent?.id}, Data: ${!!userProfileComponent?.data}`
    );

    if (userProfileComponent?.data && userProfileComponent.id) {
      actorProfileDataStore.set(actor.id, {
        profile: userProfileComponent.data as UserTrustProfile,
        componentId: userProfileComponent.id,
        lastRuntimeSyncStep: -1,
      });
      logger.debug(
        `[BenchmarkUtil] Loaded existing profile for ${actor.username}, Component ID ${userProfileComponent.id}`
      );
    } else {
      const newProfile: UserTrustProfile = {
        version: '1.0.0',
        userId: actor.id,
        trustScore: 0,
        lastTrustScoreCalculationTimestamp: Date.now(),
        recommendations: [],
      };
      const newComponentId = uuidv4() as UUID;
      await runtime.createComponent({
        id: newComponentId,
        entityId: actor.id,
        agentId: runtime.agentId,
        worldId: communityInvestorService.componentWorldId,
        roomId: communityInvestorService.componentRoomId,
        sourceEntityId: runtime.agentId,
        type: TRUST_MARKETPLACE_COMPONENT_TYPE,
        createdAt: Date.now(),
        data: newProfile,
      });
      actorProfileDataStore.set(actor.id, {
        profile: newProfile,
        componentId: newComponentId,
        lastRuntimeSyncStep: -1,
      });
      logger.debug(
        `[BenchmarkUtil] Created profile for ${actor.username}, Component ID ${newComponentId}`
      );
    }
  }

  for (let step = 0; step < durationSteps; step++) {
    logger.info(`[BenchmarkUtil] Running step ${step + 1}/${durationSteps} for ${benchmarkName}`);
    priceService.advanceTime(step); // MockPriceService uses this to determine current prices

    const callsThisStep: SimulatedCall[] = [];
    const actorsWhoMadeCallsThisStep = new Set<UUID>();

    for (const actor of actors) {
      if (!(actor as any).callGenerationStrategy) {
        logger.warn(`[BenchmarkUtil] Actor ${actor.username} has no callGenerationStrategy`);
        continue;
      }
      const call = (actor as any).callGenerationStrategy(
        step,
        priceService,
        actor.id,
        runtime,
        (actor as any).actorSpecificData
      );
      if (call) {
        if (!communityInvestorService) {
          logger.error('[BenchmarkUtil] CIS null mid-call-loop');
          continue;
        }
        callsThisStep.push(call);
        actorsWhoMadeCallsThisStep.add(actor.id);
        logger.debug(
          `[BenchmarkUtil] Actor ${actor.username} (EntityID: ${actor.id}) made call: ${JSON.stringify(call)}`
        );

        const cachedData = actorProfileDataStore.get(actor.id);
        if (!cachedData) {
          logger.error(
            `[BenchmarkUtil] CRITICAL: Profile for ${actor.username} (EntityID: ${actor.id}) not in local cache. Should have been initialized.`
          );
          continue;
        }
        let userProfile = cachedData.profile;
        let componentId = cachedData.componentId;

        let tokenAddressForRec =
          call.tokenAddress || (call.isTicker ? call.tokenMentioned : call.tokenMentioned);
        if (!tokenAddressForRec) {
          logger.error(
            `[BenchmarkUtil] CRITICAL: No valid tokenAddress/Mention for call by ${actor.username}`
          );
          continue;
        }
        if (!call.chain) {
          logger.error(
            `[BenchmarkUtil] CRITICAL: No chain specified for call by ${actor.username}`
          );
          continue;
        }
        if (!call.conviction) {
          logger.error(
            `[BenchmarkUtil] CRITICAL: No conviction specified for call by ${actor.username}`
          );
          continue;
        }
        if (!call.quote) {
          logger.error(
            `[BenchmarkUtil] CRITICAL: No quote specified for call by ${actor.username}`
          );
          continue;
        }

        const priceAtRecData = await priceService.getTokenAPIData(
          tokenAddressForRec,
          call.chain as any,
          step
        );
        const newRec: Recommendation = {
          id: uuidv4() as UUID,
          userId: actor.id,
          messageId: uuidv4() as UUID,
          timestamp: priceService.getCurrentTimestamp(step),
          tokenTicker:
            call.isTicker && call.tokenMentioned
              ? call.tokenMentioned.toUpperCase().replace('$', '')
              : undefined,
          tokenAddress: tokenAddressForRec,
          chain: call.chain as any, // Type assertion since we checked it's not undefined
          recommendationType: call.sentiment === 'positive' ? 'BUY' : 'SELL',
          conviction: call.conviction as any, // Type assertion since we checked it's not undefined
          rawMessageQuote: call.quote,
          priceAtRecommendation: priceAtRecData?.currentPrice,
          processedForTradeDecision: false,
        };

        if (
          call.isTicker &&
          (!call.tokenAddress || call.tokenAddress === call.tokenMentioned) &&
          call.tokenMentioned
        ) {
          // Resolve if only ticker was given
          const resolved = await communityInvestorService.resolveTicker(
            call.tokenMentioned,
            call.chain as any,
            []
          );
          if (resolved) {
            newRec.tokenAddress = resolved.address;
            if (resolved.ticker) newRec.tokenTicker = resolved.ticker;
          } else {
            logger.warn(
              `[BenchmarkUtil] Could not resolve ticker ${call.tokenMentioned}. Using raw mention: ${newRec.tokenAddress}`
            );
          }
        }

        userProfile.recommendations.unshift(newRec);
        if (userProfile.recommendations.length > 50) userProfile.recommendations.pop();

        const fetchedComponent = await runtime.getComponent(
          actor.id,
          TRUST_MARKETPLACE_COMPONENT_TYPE,
          communityInvestorService.componentWorldId,
          runtime.agentId
        );

        await runtime.updateComponent({
          id: componentId,
          entityId: actor.id,
          agentId: runtime.agentId,
          worldId: communityInvestorService.componentWorldId,
          roomId: communityInvestorService.componentRoomId,
          sourceEntityId: runtime.agentId,
          type: TRUST_MARKETPLACE_COMPONENT_TYPE,
          createdAt: fetchedComponent?.createdAt || Date.now(), // Preserve original createdAt if component existed
          data: userProfile,
        } as Component);
        actorProfileDataStore.set(actor.id, {
          profile: userProfile,
          componentId: componentId,
          lastRuntimeSyncStep: step,
        });
        logger.debug(`[BenchmarkUtil] Updated component ${componentId} for ${actor.username}.`);

        await runtime.createTask({
          name: 'PROCESS_TRADE_DECISION',
          description: `Benchmark task for rec ${newRec.id}`,
          metadata: { recommendationId: newRec.id, userId: actor.id },
          tags: ['benchmark', benchmarkName, 'socialAlpha'],
          roomId: communityInvestorService.componentRoomId,
          worldId: communityInvestorService.componentWorldId,
          entityId: actor.id,
        });
        logger.debug(
          `[BenchmarkUtil] Created PROCESS_TRADE_DECISION task for ${actor.username}, rec ${newRec.id}`
        );
      }
    }

    // If any calls were made in this step, or if we want to re-evaluate all scores every step regardless.
    // For now, let's update all actors scores every step to see evolution even with no new calls.
    logger.info(
      `[BenchmarkUtil] Step ${step + 1} for ${benchmarkName}: Explicitly updating trust scores for all ${actors.length} actors.`
    );
    for (const actor of actors) {
      if (!communityInvestorService) {
        logger.error('[BenchmarkUtil] CIS null before score calc');
        continue;
      }
      logger.debug(
        `[BenchmarkUtil] Calculating trust score for ${actor.username} (EntityID: ${actor.id}) at end of step ${step + 1}`
      );
      await communityInvestorService.calculateUserTrustScore(actor.id, runtime);

      const updatedProfileComp: Component | null = await runtime.getComponent(
        actor.id,
        TRUST_MARKETPLACE_COMPONENT_TYPE,
        communityInvestorService.componentWorldId,
        runtime.agentId
      );
      if (updatedProfileComp?.data && updatedProfileComp.id) {
        const updatedProfile = updatedProfileComp.data as UserTrustProfile;
        actorProfileDataStore.set(actor.id, {
          profile: updatedProfile,
          componentId: updatedProfileComp.id,
          lastRuntimeSyncStep: step,
        });

        updatedProfile.recommendations.forEach((rec: Recommendation) => {
          if (rec.metrics && rec.userId === actor.id) {
            if (
              !allCallPnlData.find(
                (pnl) =>
                  pnl.callId === rec.id &&
                  pnl.evaluationTimestamp === rec.metrics!.evaluationTimestamp
              )
            ) {
              allCallPnlData.push({
                callId: rec.id,
                actorId: rec.userId,
                tokenAddress: rec.tokenAddress,
                recommendationType: rec.recommendationType,
                priceAtRecommendation: rec.priceAtRecommendation,
                potentialProfitPercent: rec.metrics.potentialProfitPercent,
                avoidedLossPercent: rec.metrics.avoidedLossPercent,
                isScamOrRug: rec.metrics.isScamOrRug,
                evaluationTimestamp: rec.metrics.evaluationTimestamp,
                notes: rec.metrics.notes,
                athWindowDaysUsed:
                  rec.recommendationType === 'BUY' && optimisticAthWindowDays !== undefined
                    ? optimisticAthWindowDays
                    : undefined,
              });
            }
          }
        });
      } else {
        logger.warn(
          `[BenchmarkUtil] Could not fetch updated profile for ${actor.username} post-score calc. PNL log might use stale score data from cache.`
        );
        const cachedData = actorProfileDataStore.get(actor.id);
        if (cachedData) {
          (cachedData.profile.recommendations || []).forEach((rec: Recommendation) => {
            if (rec.metrics && rec.userId === actor.id) {
              if (
                !allCallPnlData.find(
                  (pnl) =>
                    pnl.callId === rec.id &&
                    pnl.evaluationTimestamp === rec.metrics!.evaluationTimestamp
                )
              ) {
                allCallPnlData.push({
                  callId: rec.id,
                  actorId: rec.userId,
                  tokenAddress: rec.tokenAddress,
                  recommendationType: rec.recommendationType,
                  priceAtRecommendation: rec.priceAtRecommendation,
                  potentialProfitPercent: rec.metrics.potentialProfitPercent,
                  avoidedLossPercent: rec.metrics.avoidedLossPercent,
                  isScamOrRug: rec.metrics.isScamOrRug,
                  evaluationTimestamp: rec.metrics.evaluationTimestamp,
                  notes: rec.metrics.notes,
                  athWindowDaysUsed:
                    rec.recommendationType === 'BUY' && optimisticAthWindowDays !== undefined
                      ? optimisticAthWindowDays
                      : undefined,
                });
              }
            }
          });
        }
      }
    }

    const stepScores: Record<UUID, { username: string; archetype: string; score: number }> = {};
    for (const actor of actors) {
      const cachedProfileData = actorProfileDataStore.get(actor.id);
      stepScores[actor.id] = {
        username: actor.username,
        archetype: actor.archetype,
        score: cachedProfileData ? cachedProfileData.profile.trustScore : 0,
      };
      logger.debug(
        `[BenchmarkUtil] Step ${step + 1} score for ${actor.username} (from cache): ${stepScores[actor.id].score.toFixed(2)}`
      );
    }
    allStepMetrics.push({
      step: step + 1,
      actorScores: stepScores,
      callsMadeThisStep: callsThisStep,
    });
  }

  communityInvestorService.getTokenAPIData = originalGetTokenAPIData;
  communityInvestorService.evaluateRecommendationPerformance =
    originalEvaluateRecommendationPerformance;

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const trustScoreOutputPath = path.join(outputBasePath, `${benchmarkName}_trust_scores.csv`);
    const pnlOutputPath = path.join(outputBasePath, `${benchmarkName}_pnl_data.json`);

    await fs.mkdir(outputBasePath, { recursive: true });

    let csvContent = 'step,actor_id,actor_username,actor_archetype,trust_score\n';
    allStepMetrics.forEach((stepMetric) => {
      Object.entries(stepMetric.actorScores).forEach(([actorId, data]) => {
        csvContent += `${stepMetric.step},${actorId},${data.username},${data.archetype},${data.score.toFixed(2)}\n`;
      });
    });
    await fs.writeFile(trustScoreOutputPath, csvContent);
    logger.info(`[BenchmarkUtil] Trust scores saved to: ${trustScoreOutputPath}`);

    await fs.writeFile(pnlOutputPath, JSON.stringify(allCallPnlData, null, 2));
    logger.info(`[BenchmarkUtil] P&L data saved to: ${pnlOutputPath}`);
  } catch (err) {
    logger.error('[BenchmarkUtil] Error saving benchmark data:', err);
  }

  logger.info(`[BenchmarkUtil] Finished benchmark: ${params.benchmarkName}`);
}
