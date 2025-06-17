import type { IAgentRuntime, TestSuite, TestCase, UUID, Component, Memory } from "@elizaos/core";
import { logger, asUUID, ModelType } from "@elizaos/core";
import { goodActorStrategy, badActorStrategy, neutralObserverStrategy, dataDrivenShillStrategy, type SimulatedActor, parseDiscordDataToActors, type SimulatedCall, createLegacyActor } from "../../../simulationActors";
import { MockPriceService, SimulatedToken } from "../../../mockPriceService";
import { runBenchmarkSimulation, type BenchmarkSimulationParams } from "./benchmark.utils";
import { CommunityInvestorService } from "../../../service";
import { ServiceType, SupportedChain, Conviction, type Recommendation, RecommendationMetric, TokenAPIData, TrustMarketplaceComponentData } from "../../../types";
import { v4 as uuidv4 } from "uuid";
import fs from 'node:fs/promises';
import path from 'node:path';

// Paths relative to project root (process.cwd())
const PROJECT_ROOT_PATH_BENCH = process.cwd(); 
const RAW_DATA_DIR_BENCH = path.join(PROJECT_ROOT_PATH_BENCH, 'src', 'tests', 'benchmarks', 'data', 'price-talk-trenches');
const PROCESSED_DATA_BASE_DIR_BENCH = path.join(PROJECT_ROOT_PATH_BENCH, 'src', 'tests', 'benchmarks', 'data_processed');
const PROCESSED_DATA_CACHE_DIR_BENCH = path.join(PROCESSED_DATA_BASE_DIR_BENCH, 'price-talk-trenches-cache');
const AGGREGATED_PROCESSED_FILE_BENCH = path.join(PROCESSED_DATA_BASE_DIR_BENCH, 'all_processed_discord_calls.json');

// Interfaces for data processing (mirrored from the deleted script)
interface DiscordMessageAuthorPrv {
    id: string;
    username: string;
    discriminator?: string; 
    global_name?: string; 
}
interface DiscordMessageFormatPrv {
    id: string;
    author: DiscordMessageAuthorPrv;
    content: string;
    timestamp: string; 
}
interface DiscordExportFormatPrv { // Used if JSON root is an object with a 'messages' key
    messages: DiscordMessageFormatPrv[];
}

// This is the structure we'll save for each processed call.
// It needs to be exported if simulationActors.ts is to import its type.
export interface EnrichedCallDataPrv {
    callId: UUID; // Unique ID for this extracted call
    originalMessageId: string;
    userId: string; // Original Discord User ID
    username: string;
    timestamp: number; // Original message timestamp (epoch ms)
    content: string; // Original message content
    tokenMentioned: string; // The ticker or address
    isTicker: boolean;
    resolvedAddress?: string;
    chain: SupportedChain;
    sentiment: 'positive' | 'negative';
    conviction: Conviction;
}

// --- Start of New Heuristics ---

const POSITIVE_SENTIMENT_KEYWORDS = [
    'buy', 'long', 'ape', 'send', 'sending', 'breakout', 'bottom', 'looks good', 
    'feeling bullish', 'all in', 'full port', 'mooning', 'diamond hand', 'lfg'
];
const NEGATIVE_SENTIMENT_KEYWORDS = [
    'sell', 'short', 'fade', 'rug', 'scam', 'dumping', 'looks bad', 'top is in', 'fading'
];

const HIGH_CONVICTION_KEYWORDS = [
    'all in', 'full port', 'heavy', 'max size', 'must buy', 'convinced', 'high conviction'
];
const LOW_CONVICTION_KEYWORDS = [
    'small punt', 'lotto play', 'degen', 'flyer', 'watching', 'on watch', 'might', 'potential'
];

function getSentimentAndConviction(content: string): { sentiment: 'positive' | 'negative' | null, conviction: Conviction } {
    const lowerContent = content.toLowerCase();
    
    let sentiment: 'positive' | 'negative' | null = null;
    if (POSITIVE_SENTIMENT_KEYWORDS.some(kw => lowerContent.includes(kw))) {
        sentiment = 'positive';
    } else if (NEGATIVE_SENTIMENT_KEYWORDS.some(kw => lowerContent.includes(kw))) {
        sentiment = 'negative';
    }

    let conviction = Conviction.MEDIUM; // Default
    if (HIGH_CONVICTION_KEYWORDS.some(kw => lowerContent.includes(kw))) {
        conviction = Conviction.HIGH;
    } else if (LOW_CONVICTION_KEYWORDS.some(kw => lowerContent.includes(kw))) {
        conviction = Conviction.LOW;
    }
    
    return { sentiment, conviction };
}

// --- End of New Heuristics ---

async function getCommunityInvestorServiceInternalPrv(runtime: IAgentRuntime): Promise<CommunityInvestorService | null> {
    try {
        const service = await runtime.getService<CommunityInvestorService>(ServiceType.COMMUNITY_INVESTOR);
        if (!service) {
            logger.error("[BenchmarkDataProcessing] CommunityInvestorService not found via runtime.getService!");
            return null;
        }
        return service;
    } catch (e: any) {
        logger.error(`[BenchmarkDataProcessing] Error getting CommunityInvestorService: ${e.message}`);
        return null;
    }
}

async function extractCallsFromMessageWithHistory(
    message: DiscordMessageFormatPrv,
    history: DiscordMessageFormatPrv[],
    runtime: IAgentRuntime,
    communityInvestorService: CommunityInvestorService | null
): Promise<Omit<EnrichedCallDataPrv, 'callId' | 'userId' | 'username'>[]> {
    const content = message.content;
    if (!content || typeof content !== 'string' || content.length < 3) {
        return [];
    }

    // Pre-filtering: check for potential token mentions to avoid excessive LLM calls.
    const tickerRegex = /(?:^|\s)\$?([A-Z]{2,6})(?=\s|,|\.|$)/g;
    const solanaAddressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
    const ethAddressRegex = /0x[a-fA-F0-9]{40}/g;

    const hasPotentialToken = tickerRegex.test(content) || solanaAddressRegex.test(content) || ethAddressRegex.test(content);
    
    // Also check history for a recently mentioned token that might be referred to by 'this' or 'it'
    let contextHasPotentialToken = false;
    if (!hasPotentialToken) {
        for(let i = history.length -1; i >= Math.max(0, history.length - 5); i--) {
            const histMsg = history[i].content;
            if (tickerRegex.test(histMsg) || solanaAddressRegex.test(histMsg) || ethAddressRegex.test(histMsg)) {
                contextHasPotentialToken = true;
                break;
            }
        }
    }

    if (!hasPotentialToken && !contextHasPotentialToken) {
        return [];
    }

    const formattedHistory = history.map(h => `User: ${h.author.global_name || h.author.username}\nMessage: ${h.content}`).join('\n---\n');

    const prompt = `You are an expert crypto trader analyzing chat messages for trading signals.
You will be given a recent message history from a Discord channel and a target message to analyze.
Your task is to determine if the target message contains an actionable trading call.

RULES:
1. A "call" is a clear statement of intent to buy or a strong positive opinion about a specific token. Examples: "apeing this", "sending it", "this looks like a bottom".
2. Just mentioning a token is NOT a call. Look for conviction.
3. Consider the context from the message history. A user might mention a token address in one message and then say "sending it" in the next. The second message is the call.
4. The call must be about a specific token ticker (e.g., $SOL) or a token address.
5. Analyze the sentiment and conviction.
6. Respond ONLY with a JSON object in the following format. Do not include any other text or explanation.

JSON Response Format:
{
  "is_call": boolean,
  "token": string | null,
  "sentiment": "positive" | "negative" | null,
  "conviction": "LOW" | "MEDIUM" | "HIGH" | null
}

Here is the message history (from oldest to newest):
--- MESSAGE HISTORY ---
${formattedHistory}
--- END MESSAGE HISTORY ---

Here is the target message to analyze:
--- TARGET MESSAGE ---
User: ${message.author.global_name || message.author.username}
Message: ${content}
--- END TARGET MESSAGE ---

Now, provide your analysis of the target message as a JSON object.`;

    try {
        const llmResponse = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
        if (!llmResponse) {
            logger.warn(`[LLMCallExtractor] LLM returned no response for message ${message.id}`);
            return [];
        }

        // Clean the response to ensure it's valid JSON
        const cleanedLlmResponse = llmResponse.substring(llmResponse.indexOf('{'), llmResponse.lastIndexOf('}') + 1);
        const jsonResponse = JSON.parse(cleanedLlmResponse);

        if (jsonResponse.is_call && jsonResponse.token && jsonResponse.sentiment === 'positive' && jsonResponse.conviction) {
            const token = jsonResponse.token as string;
            
            const tickerMatch = token.match(/^\$?([A-Z]{2,6})$/);
            const isTicker = !!tickerMatch;
            let chain = SupportedChain.SOLANA; // default
            if (ethAddressRegex.test(token)) {
                chain = SupportedChain.ETHEREUM;
            }

            const call: Omit<EnrichedCallDataPrv, 'callId' | 'userId' | 'username'> = {
                originalMessageId: message.id,
                timestamp: new Date(message.timestamp).getTime(),
                content: message.content,
                tokenMentioned: token,
                isTicker: isTicker,
                chain: chain,
                sentiment: 'positive',
                conviction: jsonResponse.conviction as Conviction
            };

            if (communityInvestorService) {
                if (isTicker && tickerMatch) {
                    const tickerSymbol = tickerMatch[1];
                    const resolved = await communityInvestorService.resolveTicker(tickerSymbol, call.chain, []);
                    if (resolved) {
                        call.resolvedAddress = resolved.address;
                        call.chain = resolved.chain;
                    }
                } else if (!isTicker) { // It's an address
                    call.resolvedAddress = token;
                }
            }
            logger.info(`[LLMCallExtractor] Successfully extracted call for token ${token} from message ${message.id}`);
            return [call];
        }
    } catch (e: any) {
        logger.error(`[LLMCallExtractor] Error processing LLM response for message ${message.id}: ${e.message}`);
        return [];
    }

    return [];
}

export const trustAlgorithmBenchmarkSuite: TestSuite = {
  name: "Trust Algorithm Benchmarks",
  tests: [
    {
        name: "STEP 1: Process Raw Discord Data into Enriched Calls",
        fn: async (runtime: IAgentRuntime) => {
            logger.info("[Benchmark STEP 1] Starting Raw Discord Data Processing...");
            const communityInvestorService = await getCommunityInvestorServiceInternalPrv(runtime);
            if (!communityInvestorService) {
                logger.error("[BenchmarkDataProcessing] Failed to get CommunityInvestorService. Aborting STEP 1.");
                return;
            }

            await fs.mkdir(PROCESSED_DATA_BASE_DIR_BENCH, { recursive: true });
            await fs.mkdir(PROCESSED_DATA_CACHE_DIR_BENCH, { recursive: true });
            
            const allFiles = await fs.readdir(RAW_DATA_DIR_BENCH);
            const jsonFiles = allFiles.filter(f => f.endsWith('.json'));
            logger.info(`[BenchmarkDataProcessing] Found ${jsonFiles.length} JSON files to process in ${RAW_DATA_DIR_BENCH}`);

            let allProcessedCalls: EnrichedCallDataPrv[] = [];
            
            // NOTE: Per user request, message history is critical. We process files sequentially
            // and build history within each file.
            const messageHistorySize = 20; 

            for (const file of jsonFiles) {
                const filePath = path.join(RAW_DATA_DIR_BENCH, file);
                const cachePath = path.join(PROCESSED_DATA_CACHE_DIR_BENCH, `${file}.processed.json`);
                let messagesFromFileInThisIteration: DiscordMessageFormatPrv[] = [];
                
                // Forcing re-processing to apply new logic.
                if (await fs.stat(cachePath).then(() => true).catch(() => false)) {
                    logger.info(`[BenchmarkDataProcessing] Deleting cache for ${file} to re-process with new logic.`);
                    await fs.unlink(cachePath);
                }
                
                try {
                    const fileContent = await fs.readFile(filePath, 'utf-8');
                    const jsonData = JSON.parse(fileContent);

                    if (jsonData && Array.isArray(jsonData.messages)) {
                        messagesFromFileInThisIteration = jsonData.messages;
                    } else {
                        logger.warn(`[BenchmarkDataProcessing] File ${file} does not have a 'messages' property at the root. Skipping.`);
                        continue;
                    }
                    
                    logger.info(`[BenchmarkDataProcessing] Processing ${messagesFromFileInThisIteration.length} messages from file ${file}.`);

                    let callsForThisFile: EnrichedCallDataPrv[] = [];
                    for (let i = 0; i < messagesFromFileInThisIteration.length; i++) {
                        const message = messagesFromFileInThisIteration[i];
                        if (!message.author || !message.author.id) {
                            continue;
                        }
                        if (!message.content) {
                            continue;
                        }
                        
                        const history = messagesFromFileInThisIteration.slice(Math.max(0, i - messageHistorySize), i);
                        const extractedPortions = await extractCallsFromMessageWithHistory(message, history, runtime, communityInvestorService);
                        
                        for (const portion of extractedPortions) {
                            callsForThisFile.push({
                                ...portion,
                                callId: uuidv4() as UUID,
                                userId: message.author.id,
                                username: message.author.global_name || message.author.username,
                            });
                        }
                    }

                    await fs.writeFile(cachePath, JSON.stringify(callsForThisFile, null, 2));
                    logger.info(`[BenchmarkDataProcessing] Saved ${callsForThisFile.length} calls to cache for ${file} (from ${messagesFromFileInThisIteration.length} messages).`);
                    if (callsForThisFile.length > 0) {
                        allProcessedCalls.push(...callsForThisFile);
                    }
                } catch (error: any) {
                    logger.error(`[BenchmarkDataProcessing] Failed to process file ${file}: ${error.message}`);
                }
            }

            await fs.writeFile(AGGREGATED_PROCESSED_FILE_BENCH, JSON.stringify(allProcessedCalls, null, 2));
            logger.info(`[BenchmarkDataProcessing] Aggregated ${allProcessedCalls.length} calls to ${path.basename(AGGREGATED_PROCESSED_FILE_BENCH)}`);
            logger.info(`[Benchmark STEP 1] Finished Raw Discord Data Processing.`);
        }
    },
    // Ensure other tests are defined after STEP 1
    {
      name: "Archetype Differentiation - Basic Mix",
      fn: async (runtime: IAgentRuntime) => {
        logger.info("[Benchmark] Starting Archetype Differentiation Test...");
        const numGoodActors = 2, numBadActors = 2, numNeutralActors = 3;
        const durationSteps = 50; 
        const actors: any[] = [];
        for (let i = 0; i < numGoodActors; i++) actors.push(createLegacyActor({id: asUUID(uuidv4()), username: `GoodActor-${i + 1}`, archetype: "good_caller", expectedTrustScore: 50, callGenerationStrategy: goodActorStrategy}));
        for (let i = 0; i < numBadActors; i++) actors.push(createLegacyActor({id: asUUID(uuidv4()), username: `BadActor-${i + 1}`, archetype: "bad_shiller", expectedTrustScore: -50, callGenerationStrategy: badActorStrategy}));
        for (let i = 0; i < numNeutralActors; i++) actors.push(createLegacyActor({id: asUUID(uuidv4()), username: `NeutralActor-${i + 1}`, archetype: "neutral_observer", expectedTrustScore: 0, callGenerationStrategy: neutralObserverStrategy}));

        const simulatedTokens: SimulatedToken[] = [
          { address: "SIM_GOOD_1", name: "SimGood1", symbol: "SG1", chain: SupportedChain.SOLANA, performanceType: "good", initialPrice: 10, priceTrajectory: MockPriceService.goodTokenTrajectory(10, 0.03) },
          { address: "SIM_BAD_1", name: "SimBad1", symbol: "SB1", chain: SupportedChain.SOLANA, performanceType: "bad", initialPrice: 20, priceTrajectory: MockPriceService.badTokenTrajectory(20, 0.04) },
          { address: "SIM_NEUTRAL_1", name: "SimNeutral1", symbol: "SN1", chain: SupportedChain.SOLANA, performanceType: "neutral", initialPrice: 15, priceTrajectory: MockPriceService.neutralTokenTrajectory(15, 0.05)},
        ];
        const priceService = new MockPriceService(simulatedTokens);
        const benchmarkParams: BenchmarkSimulationParams = {
          durationSteps, actors, priceService,
          outputBasePath: "./benchmarks_output", 
          benchmarkName: "archetype_differentiation_basic",
          optimisticAthWindowDays: 7, 
        };
        await runBenchmarkSimulation(runtime, benchmarkParams);
        logger.info("[Benchmark] Archetype Differentiation Test finished.");
      },
    },
    {
      name: "Leaderboard Accuracy and Stability",
      fn: async (runtime: IAgentRuntime) => {
        logger.info("[Benchmark] Starting Leaderboard Accuracy and Stability Test...");
        const goodActors = Array.from({length: 5}, (_,i) => createLegacyActor({id: asUUID(uuidv4()), username: `GoodLead-${i}`, archetype: "good_caller", expectedTrustScore: 50, callGenerationStrategy: goodActorStrategy})); 
        const badActors = Array.from({length: 5}, (_,i) => createLegacyActor({id: asUUID(uuidv4()), username: `BadLead-${i}`, archetype: "bad_shiller", expectedTrustScore: -50, callGenerationStrategy: badActorStrategy}));
        const neutralActors = Array.from({length:10}, (_,i) => createLegacyActor({id: asUUID(uuidv4()), username: `NeutralLead-${i}`, archetype: "neutral_observer", expectedTrustScore: 0, callGenerationStrategy: neutralObserverStrategy}));
        const actors: any[] = [...goodActors, ...badActors, ...neutralActors];
        const tokens : SimulatedToken[]= [
            { address: "LEAD_GOOD_1", name: "LeadGood1", symbol: "LG1", chain: SupportedChain.SOLANA, performanceType: "good", initialPrice: 100, priceTrajectory: MockPriceService.goodTokenTrajectory(100, 0.02)},
            { address: "LEAD_BAD_1", name: "LeadBad1", symbol: "LB1", chain: SupportedChain.SOLANA, performanceType: "bad", initialPrice: 50, priceTrajectory: MockPriceService.badTokenTrajectory(50, 0.05)},
            { address: "LEAD_NEUTRAL_1", name: "LeadNeutral1", symbol: "LN1", chain: SupportedChain.SOLANA, performanceType: "neutral", initialPrice: 75, priceTrajectory: MockPriceService.neutralTokenTrajectory(75, 0.03)},
            { address: "LEAD_VOLA_1", name: "LeadVola1", symbol: "LV1", chain: SupportedChain.SOLANA, performanceType: "volatile", initialPrice: 60, priceTrajectory: MockPriceService.volatileTokenTrajectory(60, 0.25)},
        ];
        const priceService = new MockPriceService(tokens);
        const benchmarkParams: BenchmarkSimulationParams = {
            durationSteps: 100, actors, priceService, 
            outputBasePath: "./benchmarks_output", benchmarkName: "leaderboard_accuracy_stability",
        };
        await runBenchmarkSimulation(runtime, benchmarkParams);
        logger.info("[Benchmark] Leaderboard Accuracy and Stability Test finished.");
      },
    },
    {
      name: "Bad Actor Suppression and Scam ID",
      fn: async (runtime: IAgentRuntime) => {
        logger.info("[Benchmark] Starting Bad Actor Suppression Test...");
        const badActorsList = Array.from({length: 8}, (_,i) => createLegacyActor({id: asUUID(uuidv4()), username: `ScamShiller-${i}`, archetype: "bad_shiller", expectedTrustScore: -50, callGenerationStrategy: badActorStrategy}));
        const goodActorsList = Array.from({length: 2}, (_,i) => createLegacyActor({id: asUUID(uuidv4()), username: `FairPlayer-${i}`, archetype: "good_caller", expectedTrustScore: 50, callGenerationStrategy: goodActorStrategy}));
        const actors: any[] = [...badActorsList, ...goodActorsList];
        const tokens: SimulatedToken[] = [
            { address: "SCAM_A", name: "ScamA", symbol: "SCMA", chain: SupportedChain.SOLANA, performanceType: "bad", initialPrice: 10, priceTrajectory: MockPriceService.badTokenTrajectory(10, 0.1, 0.25)}, 
            { address: "SCAM_B", name: "ScamB", symbol: "SCMB", chain: SupportedChain.SOLANA, performanceType: "bad", initialPrice: 5, priceTrajectory: MockPriceService.badTokenTrajectory(5, 0.2, 0.35)}, 
            { address: "LEGIT_S", name: "LegitS", symbol: "LGTS", chain: SupportedChain.SOLANA, performanceType: "good", initialPrice: 20, priceTrajectory: MockPriceService.goodTokenTrajectory(20,0.01)},
        ];
        const priceService = new MockPriceService(tokens);
        const benchmarkParams: BenchmarkSimulationParams = {
            durationSteps: 50, actors, priceService, 
            outputBasePath: "./benchmarks_output", benchmarkName: "bad_actor_suppression",
        };
        await runBenchmarkSimulation(runtime, benchmarkParams);
        logger.info("[Benchmark] Bad Actor Suppression Test finished.");
      },
    },
    {
      name: "Impact of Optimistic ATH Window",
      fn: async (runtime: IAgentRuntime) => {
        logger.info("[Benchmark] Starting ATH Window Impact Test...");
        const athWindowsToTest = [1, 7, 30]; 
        const baseExampleActors: any[] = [];
        const numGood = 2, numBad = 2, numNeutral = 2;
        for (let i = 0; i < numGood; i++) baseExampleActors.push({username: `GoodW-${i}`, archetype: "good_caller", expectedTrustScore: 50, callGenerationStrategy: goodActorStrategy}); 
        for (let i = 0; i < numBad; i++) baseExampleActors.push({username: `BadW-${i}`, archetype: "bad_shiller", expectedTrustScore: -50, callGenerationStrategy: badActorStrategy}); 
        for (let i = 0; i < numNeutral; i++) baseExampleActors.push({username: `NeutralW-${i}`, archetype: "neutral_observer", expectedTrustScore: 0, callGenerationStrategy: neutralObserverStrategy}); 

        const exampleTokens: SimulatedToken[] = [
            { address: "ATH_GOOD_W", name: "ATH GoodW", symbol: "ATGW", chain: SupportedChain.SOLANA, performanceType: "good", initialPrice: 10, priceTrajectory: MockPriceService.goodTokenTrajectory(10, 0.03) },
            { address: "ATH_BAD_W", name: "ATH BadW", symbol: "ATBW", chain: SupportedChain.SOLANA, performanceType: "bad", initialPrice: 10, priceTrajectory: MockPriceService.badTokenTrajectory(10, 0.03) },
            { address: "ATH_VOLA_W", name: "ATH VolaW", symbol: "ATVW", chain: SupportedChain.SOLANA, performanceType: "volatile", initialPrice: 10, priceTrajectory: MockPriceService.volatileTokenTrajectory(10, 0.25) },
        ];
        for (const windowDays of athWindowsToTest) {
          logger.info(`[Benchmark] Running ATH Window Impact Test for ${windowDays} days.`);
          const actorsForRun: SimulatedActor[] = baseExampleActors.map(baseActor => ({ ...baseActor, id: asUUID(uuidv4()) }));
          const freshTokensForRun = JSON.parse(JSON.stringify(exampleTokens)).map((t: any) => ({ ...t, priceTrajectory: exampleTokens.find(orig => orig.address === t.address)!.priceTrajectory }));
          const priceService = new MockPriceService(freshTokensForRun); 
          const benchmarkParams: BenchmarkSimulationParams = {
            durationSteps: 60, actors: actorsForRun, priceService,
            outputBasePath: "./benchmarks_output", benchmarkName: `ath_window_impact_${windowDays}days`,
            optimisticAthWindowDays: windowDays,
          };
          await runBenchmarkSimulation(runtime, benchmarkParams);
        }
        logger.info("[Benchmark] ATH Window Impact Test finished.");
      },
    },
    {
      name: "STEP 2: Real Shill Data Simulation (Uses Processed Data)",
      fn: async (runtime: IAgentRuntime) => {
        logger.info("[Benchmark STEP 2] Starting Real Shill Data Simulation...");
        let realActors: SimulatedActor[] = [];
        try {
            // parseDiscordDataToActors will now read AGGREGATED_PROCESSED_FILE_BENCH
            realActors = await parseDiscordDataToActors(AGGREGATED_PROCESSED_FILE_BENCH, runtime);
        } catch (e: any) {
            logger.error(`[Benchmark STEP 2] Failed to load actors from ${AGGREGATED_PROCESSED_FILE_BENCH}. Error: ${e.message}`);
            throw e; 
        }

        if (realActors.length === 0) {
            logger.warn("[Benchmark STEP 2] No actors parsed. Ensure STEP 1 ran successfully.");
            return; 
        }

        const mentionedTokensFromData = new Map<string, {chain: SupportedChain, symbol: string, addresses: Set<string>}>();
        realActors.forEach(actor => {
            if ((actor as any).actorSpecificData && (actor as any).actorSpecificData.calls) {
                ((actor as any).actorSpecificData.calls as EnrichedCallDataPrv[]).forEach((call: EnrichedCallDataPrv) => {
                    if (call.resolvedAddress && call.chain) { 
                        const key = `${call.chain}:${call.resolvedAddress}`;
                        if (!mentionedTokensFromData.has(key)) {
                            mentionedTokensFromData.set(key, { 
                                chain: call.chain, 
                                symbol: call.resolvedAddress.toUpperCase().replace("$","").substring(0,5),
                                addresses: new Set<string>().add(call.resolvedAddress!)
                            });
                        } else {
                            mentionedTokensFromData.get(key)!.addresses.add(call.resolvedAddress!);
                        }
                    } else if (call.tokenMentioned && call.chain) { 
                        const key = `${call.chain}:${call.tokenMentioned.toUpperCase()}`;
                         if (!mentionedTokensFromData.has(key)) {
                            mentionedTokensFromData.set(key, { 
                                chain: call.chain, 
                                symbol: call.isTicker ? call.tokenMentioned.toUpperCase().replace("$","") : call.tokenMentioned.substring(0,5).toUpperCase(),
                                addresses: new Set<string>().add(call.tokenMentioned) 
                            });
                        } else {
                             mentionedTokensFromData.get(key)!.addresses.add(call.tokenMentioned);
                        }
                    }
                });
            }
        });

        const initialSimulatedTokens: SimulatedToken[] = [];
        mentionedTokensFromData.forEach(({chain, symbol, addresses}, _key) => {
            const primaryAddress = addresses.values().next().value || symbol; 
            initialSimulatedTokens.push({
                address: primaryAddress, name: `DataToken-${symbol.substring(0,10)}`, symbol: symbol.substring(0,10),
                chain: chain, performanceType: "neutral", initialPrice: 1 + Math.random() * 19, 
                priceTrajectory: MockPriceService.neutralTokenTrajectory(1 + Math.random() * 19, 0.05 + Math.random() * 0.1) 
            });
        });
        
        logger.info(`[Benchmark STEP 2] Initialized ${initialSimulatedTokens.length} tokens for Real Shill Data Sim.`);
        if(initialSimulatedTokens.length === 0 && realActors.length > 0){
            logger.warn("[Benchmark STEP 2] Adding a DUMMY token as no tokens were derived from processed calls.");
            initialSimulatedTokens.push({
                 address: "DUMMY_REAL_SIM", name: "DummyRealSim", symbol: "DRS", chain: SupportedChain.SOLANA, performanceType: "neutral", initialPrice: 1, priceTrajectory: MockPriceService.neutralTokenTrajectory(1)
            });
        }

        const priceService = new MockPriceService(initialSimulatedTokens);
        let maxCalls = 0;
        realActors.forEach(actor => { maxCalls = Math.max(maxCalls, (actor as any).actorSpecificData?.calls?.length || 0); });
        const estimatedDuration = Math.max(50, maxCalls * 2); 
        logger.info(`[Benchmark STEP 2] Estimated duration: ${estimatedDuration} steps for ${realActors.length} actors.`);

        const benchmarkParams: BenchmarkSimulationParams = {
            durationSteps: estimatedDuration, actors: realActors, priceService,
            outputBasePath: "./benchmarks_output", benchmarkName: "real_shill_data_simulation",
            optimisticAthWindowDays: 7, 
        };
        await runBenchmarkSimulation(runtime, benchmarkParams);
        logger.info("[Benchmark STEP 2] Real Shill Data Simulation finished.");
      },
    },
  ],
};

export default trustAlgorithmBenchmarkSuite;