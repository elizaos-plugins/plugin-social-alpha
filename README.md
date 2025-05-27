# Social Alpha (Social Alpha) Plugin for ElizaOS

The Social Alpha plugin, also known as the Social Alpha Plugin, introduces a "Marketplace of Trust" within ElizaOS. It enables agents to evaluate and leverage cryptocurrency investment recommendations made by users in a social context. The plugin assigns users a "trust score" based on the historical performance of their recommendations, fostering a system where reliable insights are recognized and surfaced.

## Core Concepts

1.  **User Recommendations**: Users provide cryptocurrency buy/sell recommendations or strong criticisms through natural language in their messages.
2.  **Automated Extraction & Analysis**: The plugin's event handlers analyze messages to determine relevance to cryptocurrency and extract potential recommendations using Language Models (LLMs).
3.  **Token Data & Performance**: It resolves token tickers/addresses, fetches market data (price, liquidity, volume) from external APIs (Birdeye, DexScreener), and evaluates token risk (e.g., scam/rug pull heuristics).
4.  **Trust Score Calculation**: The core of the plugin lies in calculating a dynamic "trust score" for each user. This score is derived from the actual performance of their past recommendations (e.g., profitability of a "BUY" call, accuracy of a "SELL" call on a scam token).
5.  **Leaderboard & Social Reinforcement**: Publicly visible leaderboards rank users by their trust scores, creating social incentives for providing high-quality, reliable information.
6.  **Persistent User Profiles**: Each user has a profile (stored as an ElizaOS Component) that tracks their recommendations and evolving trust score.

## Features

*   **Automated Recommendation Extraction**: Intelligently parses user messages to identify and extract cryptocurrency buy/sell recommendations or strong criticisms.
*   **Dynamic Trust Scoring**: Implements a sophisticated algorithm to score users based on the proven accuracy and performance of their historical recommendations.
*   **Crypto Token Analysis**:
    *   Resolves token tickers (e.g., $SOL) to contract addresses.
    *   Fetches real-time and historical market data via Birdeye and DexScreener APIs.
    *   Applies heuristics to assess scam/rug-pull risks for tokens.
*   **User Profiles**: Maintains a persistent profile for each user, storing their recommendation history and current trust score.
*   **Leaderboard Display**: Provides a frontend panel displaying a ranked leaderboard of users by trust score, allowing insights into top performers and their recommendation history.
*   **Asynchronous Processing**: Utilizes task workers for computationally intensive operations like evaluating recommendation performance and updating trust scores, ensuring non-blocking operation.
*   **Configurable Parameters**: Offers various settings to fine-tune scoring, operational intervals, and API usage.

## Quick Setup & Prerequisites

1.  **ElizaOS Environment**: An operational ElizaOS instance.
2.  **LLM Provider**: The plugin relies on `runtime.useModel()` for relevance checking and recommendation extraction. Ensure your ElizaOS agent is configured with a compatible LLM provider (e.g., OpenAI, Anthropic, OpenRouter, Google).
3.  **API Keys**: For full functionality, especially token data fetching and analysis, API keys for the following services are required. These should be set as environment variables or through the ElizaOS agent configuration.
    *   `BIRDEYE_API_KEY`: For Solana and other chain data via Birdeye.
    *   `DEXSCREENER_API_KEY`: (Implicitly used by DexscreenerClient if specific features require it, though the client seems to primarily use public endpoints).
    *   `HELIUS_API_KEY`: Optional, for richer Solana holder data. If not provided, holder analysis will be limited.

## Configuration

The plugin can be configured through environment variables, which are then accessible via `runtime.getSetting()`. The following are key configuration options defined in `src/index.ts` and used throughout the service:

*   `BIRDEYE_API_KEY`: (String) Your API key for Birdeye.so.
*   `DEXSCREENER_API_KEY`: (String) Your API key for DexScreener (if needed by specific client features).
*   `HELIUS_API_KEY`: (String) Your API key for Helius.sh (for Solana-specific data like detailed holder info).
*   `PROCESS_TRADE_DECISION_INTERVAL_HOURS`: (String, e.g., "1") How often tasks to process trade decisions (simulated or actual) might be re-evaluated or scheduled. (Default: "1")
*   `METRIC_REFRESH_INTERVAL_HOURS`: (String, e.g., "24") How often a recommendation's performance metrics should be refreshed. (Default: "24")
*   `USER_TRADE_COOLDOWN_HOURS`: (String, e.g., "12") Cooldown period before the system (agent) acts on another recommendation from the same user. (Default: "12")
*   `SCAM_PENALTY`: (String, e.g., "-100") Penalty applied to a recommendation's performance score if the token is identified as a scam/rug.
*   `SCAM_CORRECT_CALL_BONUS`: (String, e.g., "100") Bonus applied if a user correctly calls out a scam/rug (e.g., a SELL recommendation on a token that turns out to be a scam).
*   `MAX_RECOMMENDATIONS_IN_PROFILE`: (String, e.g., "50") Maximum number of recent recommendations to keep in a user's profile.

Default values for trading parameters (slippage, min/max amounts, etc.) can be found in `src/config.ts`.

## Architecture Overview

The plugin is designed with a service-oriented architecture:

*   **`CommunityInvestorService` (`service.ts`)**: The central service orchestrating all plugin logic, including user profile management, trust score calculations, token data fetching, and leaderboard generation.
*   **Event Handling (`events.ts`)**:
    *   Listens for `MESSAGE_RECEIVED` events.
    *   Uses `messageReceivedHandler` to process incoming messages.
    *   Employs LLMs for relevance checking and extracting recommendation details (token, sentiment, conviction, quote).
*   **Task Workers (`tasks.ts`)**:
    *   Defines asynchronous tasks, such as `PROCESS_TRADE_DECISION_TASK_NAME`.
    *   These tasks handle potentially long-running operations like evaluating the performance of a recommendation and deciding on (simulated) trade actions.
*   **Data Clients (`clients.ts`)**:
    *   Provides abstracted clients for interacting with external APIs:
        *   `BirdeyeClient`: For fetching token overview, price, security, and trade data.
        *   `DexscreenerClient`: For searching tokens and finding liquid pairs.
        *   `HeliusClient`: For fetching detailed Solana token holder information.
*   **Storage & State Management**:
    *   **User Profiles**: Stored as ElizaOS Components (`TRUST_MARKETPLACE_COMPONENT_TYPE`). Each user making recommendations gets a profile component associated with their `userId`.
    *   **User Registry**: A set of user IDs who have interacted with the plugin, cached by the service for efficient leaderboard generation.
    *   **Caching**: Leverages `runtime.getCache()` and `runtime.setCache()` for API responses and frequently accessed data to reduce external calls and improve performance.
*   **Frontend (`frontend/`)**:
    *   A React-based single-page application served by the plugin.
    *   `LeaderboardPanelPage` (`frontend/index.tsx`): Main entry point for the UI.
    *   `LeaderboardTable` (`frontend/LeaderboardTable.tsx`): Component to display leaderboard data and individual recommendation details.
    *   Uses `@tanstack/react-query` for data fetching and state management, polling the backend API to keep data fresh.
*   **Routing (`routes.ts`)**: Defines HTTP routes for serving the frontend panel, static assets, and the leaderboard API.

## How It Works (Operational Flow)

1.  **Message Ingestion**: The `messageReceivedHandler` in `events.ts` processes new messages.
2.  **Relevance & Extraction**:
    *   An LLM determines if the message is relevant to cryptocurrency.
    *   If relevant, another LLM call attempts to extract potential recommendations (token, sentiment, conviction, quote).
3.  **Token Resolution**: For extracted mentions:
    *   Ticker symbols (e.g., "$SOL") are resolved to contract addresses using known lists and DexScreener searches.
    *   Context from recent messages can aid disambiguation.
4.  **Data Enrichment**:
    *   `getTokenAPIData` fetches market data (price, liquidity, volume, history) for the resolved token from Birdeye and/or DexScreener.
    *   `isLikelyScamOrRug` applies heuristics based on price drops, liquidity ratios, and token age to flag potential scams.
5.  **Profile Update**:
    *   A `Recommendation` object is created and added to the user's `UserTrustProfile` component.
    *   If the profile is new, it's created.
6.  **Performance Evaluation & Score Calculation**:
    *   The `evaluateRecommendationPerformance` method (often triggered by a task or a periodic refresh) assesses the outcome of a recommendation using updated token data. This calculates metrics like `potentialProfitPercent` or `avoidedLossPercent`.
    *   `calculateUserTrustScore` is then called. This method:
        *   Re-evaluates metrics for older recommendations if needed.
        *   Calculates a new trust score for the user based on the weighted performance of all their recommendations (considering recency and conviction).
        *   Updates the user's profile component with the new score and calculation timestamp.
        *   Registers the user in the `userRegistry` (a set of active users, cached for leaderboard performance).
7.  **Leaderboard Generation**:
    *   `getLeaderboardData` fetches profiles for all users in the `userRegistry`.
    *   It compiles their trust scores, usernames, and recommendation histories.
    *   The data is sorted by trust score to create a ranked leaderboard.
8.  **Frontend Display**:
    *   The React frontend panel (`/display`) fetches data from the `/leaderboard` API endpoint and renders the `LeaderboardTable`.
    *   Users can view rankings and expand entries to see individual recommendation details.

## API Endpoints

The plugin exposes the following HTTP routes, typically prefixed by `/api/agents/:agentId/plugins/community-investor`:

*   `GET /leaderboard`: Retrieves the current leaderboard data as a JSON array of `LeaderboardEntry` objects.
*   `GET /display`: Serves the HTML for the frontend leaderboard panel. This panel then makes client-side requests to `/leaderboard` and `/assets/*`.
*   `GET /assets/*`: Serves static frontend assets (JS, CSS, images) required by the leaderboard panel.

## Agent Panel

The plugin contributes a frontend panel to the ElizaOS agent interface:

*   **Name**: "SocialFi"
*   **Path**: `display` (accessible via the `/display` route mentioned above)
*   **Component**: `LeaderboardPanelPage`
*   **Icon**: `UsersRound` (Lucide icon name)
*   **Public**: Yes, the leaderboard is intended to be publicly viewable.

## Key Files & Project Structure

*   `src/index.ts`: Main plugin definition, configuration, and registration of services, routes, and events.
*   `src/service.ts`: `CommunityInvestorService` class containing the core business logic.
*   `src/events.ts`: Handles incoming messages, performs LLM-based analysis, and extracts recommendations.
*   `src/tasks.ts`: Defines background task workers (e.g., `PROCESS_TRADE_DECISION_TASK_NAME`).
*   `src/types.ts`: Contains all primary TypeScript type and interface definitions for the plugin.
*   `src/config.ts`: Defines default configurations and enums (like `Conviction`, `RecommendationType`).
*   `src/constants.ts`: Defines constants like known token addresses and the `TRUST_LEADERBOARD_WORLD_SEED`.
*   `src/clients.ts`: Implements API clients for Birdeye, DexScreener, and Helius.
*   `src/routes.ts`: Defines the HTTP API routes and their handlers.
*   `src/schemas.ts`: Zod schemas for data validation (though not extensively used in the current provided service logic for runtime parsing, they define data shapes).
*   `src/frontend/`: Contains the React source code for the leaderboard user interface.
    *   `src/frontend/index.tsx`: Main React component and entry point for the panel.
    *   `src/frontend/LeaderboardTable.tsx`: Renders the interactive leaderboard.
*   `src/tests/`: Contains test suites for the plugin's functionality.
    *   `src/tests/index.ts`: Aggregates test suites.
    *   Individual `*.ts` files for testing specific components like the service, events, etc.
*   `src/mot.md`: A document outlining the "Marketplace of Trust" philosophy that underpins the plugin's design.

## Future Directions

The "Marketplace of Trust" concept has broad applicability. Future enhancements or related plugins could explore:

*   More sophisticated scam/risk detection algorithms.
*   Deeper integration with trading platforms for actual (simulated or real) trade execution based on high-trust recommendations.
*   Reputation staking and slashing mechanisms.
*   Expansion to other domains beyond finance where trustworthy information is critical.

## License

This plugin is subject to the overall ElizaOS license. Please refer to the main license file for details.
