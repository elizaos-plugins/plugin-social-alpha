describe('Trust Marketplace Leaderboard', () => {
  beforeEach(() => {
    // Mock API responses
    cy.intercept('GET', '/api/leaderboard', {
      statusCode: 200,
      body: {
        users: [
          {
            userId: 'user1',
            username: 'EliteTrader',
            trustScore: 95.5,
            totalCalls: 150,
            successRate: 85,
            avgProfitLossPercent: 45.2,
            bestCallProfitPercent: 120,
            worstCallLossPercent: -20,
            winRate: 0.85,
            avgHoldTime: 72,
            consistency: 0.9,
            riskScore: 25,
            tier: 'elite',
            confidenceLevel: 95,
            trendDirection: 'up',
            lastActive: new Date().toISOString(),
            followersCount: 500,
            recentPerformance: [10, 15, 20, 25, 30]
          },
          {
            userId: 'user2',
            username: 'CryptoNewbie',
            trustScore: 45.2,
            totalCalls: 20,
            successRate: 40,
            avgProfitLossPercent: -5.5,
            bestCallProfitPercent: 30,
            worstCallLossPercent: -45,
            winRate: 0.4,
            avgHoldTime: 24,
            consistency: 0.3,
            riskScore: 80,
            tier: 'bronze',
            confidenceLevel: 30,
            trendDirection: 'down',
            lastActive: new Date().toISOString(),
            followersCount: 10,
            recentPerformance: [-5, -10, 5, -15, 10]
          },
          {
            userId: 'user3',
            username: 'ModerateTrader',
            trustScore: 68.7,
            totalCalls: 75,
            successRate: 65,
            avgProfitLossPercent: 12.8,
            bestCallProfitPercent: 80,
            worstCallLossPercent: -35,
            winRate: 0.65,
            avgHoldTime: 48,
            consistency: 0.7,
            riskScore: 45,
            tier: 'silver',
            confidenceLevel: 70,
            trendDirection: 'stable',
            lastActive: new Date().toISOString(),
            followersCount: 150,
            recentPerformance: [5, 10, 8, 12, 15]
          }
        ]
      }
    }).as('getLeaderboard');

    cy.visit('/');
  });

  it('should load and display the leaderboard', () => {
    cy.wait('@getLeaderboard');
    
    // Check main title
    cy.contains('h1', 'Trust Marketplace Leaderboard').should('be.visible');
    
    // Check table is visible
    cy.get('table').should('be.visible');
    
    // Check headers
    cy.contains('th', 'Rank').should('be.visible');
    cy.contains('th', 'User').should('be.visible');
    cy.contains('th', 'Trust Score').should('be.visible');
    cy.contains('th', 'Win Rate').should('be.visible');
    cy.contains('th', 'Avg P&L').should('be.visible');
    cy.contains('th', 'Total Calls').should('be.visible');
  });

  it('should display user data correctly', () => {
    cy.wait('@getLeaderboard');
    
    // Check first user (rank 1)
    cy.get('tbody tr').eq(0).within(() => {
      cy.contains('1').should('be.visible');
      cy.contains('EliteTrader').should('be.visible');
      cy.contains('95.5').should('be.visible');
      cy.contains('85%').should('be.visible');
      cy.contains('+45.2%').should('be.visible');
      cy.contains('150').should('be.visible');
    });
    
    // Check last user (rank 3)
    cy.get('tbody tr').eq(2).within(() => {
      cy.contains('3').should('be.visible');
      cy.contains('CryptoNewbie').should('be.visible');
      cy.contains('45.2').should('be.visible');
    });
  });

  it('should filter users by search', () => {
    cy.wait('@getLeaderboard');
    
    // Search for specific user
    cy.get('input[placeholder*="Search"]').type('Elite');
    
    // Should show only matching user
    cy.contains('EliteTrader').should('be.visible');
    cy.contains('CryptoNewbie').should('not.exist');
    cy.contains('ModerateTrader').should('not.exist');
    
    // Clear search
    cy.get('input[placeholder*="Search"]').clear();
    
    // All users should be visible again
    cy.contains('EliteTrader').should('be.visible');
    cy.contains('CryptoNewbie').should('be.visible');
    cy.contains('ModerateTrader').should('be.visible');
  });

  it('should sort by different columns', () => {
    cy.wait('@getLeaderboard');
    
    // Click on Win Rate header to sort
    cy.contains('th', 'Win Rate').click();
    
    // Check order changed (CryptoNewbie should be first with lowest win rate)
    cy.get('tbody tr').eq(0).should('contain', 'CryptoNewbie');
    
    // Click again to reverse sort
    cy.contains('th', 'Win Rate').click();
    
    // EliteTrader should be first again
    cy.get('tbody tr').eq(0).should('contain', 'EliteTrader');
  });

  it('should display tier badges', () => {
    cy.wait('@getLeaderboard');
    
    // Check tier badges exist
    cy.contains('Elite').should('be.visible');
    cy.contains('Bronze').should('be.visible');
    cy.contains('Silver').should('be.visible');
  });

  it('should show loading state', () => {
    // Delay the response
    cy.intercept('GET', '/api/leaderboard', {
      delay: 1000,
      statusCode: 200,
      body: { users: [] }
    }).as('getLeaderboardDelayed');
    
    cy.visit('/');
    
    // Check loading indicator
    cy.get('[data-testid="loading-spinner"]').should('be.visible');
    
    cy.wait('@getLeaderboardDelayed');
    
    // Loading should disappear
    cy.get('[data-testid="loading-spinner"]').should('not.exist');
  });

  it('should handle API errors gracefully', () => {
    cy.intercept('GET', '/api/leaderboard', {
      statusCode: 500,
      body: { error: 'Internal Server Error' }
    }).as('getLeaderboardError');
    
    cy.visit('/');
    cy.wait('@getLeaderboardError');
    
    // Should show error message
    cy.contains('Failed to load leaderboard data').should('be.visible');
    cy.contains('button', 'Try Again').should('be.visible');
  });

  it('should refresh data when clicking refresh button', () => {
    cy.wait('@getLeaderboard');
    
    // Set up new intercept for refresh
    cy.intercept('GET', '/api/leaderboard', {
      statusCode: 200,
      body: {
        users: [
          {
            userId: 'user4',
            username: 'NewTopTrader',
            trustScore: 98.2,
            totalCalls: 200,
            successRate: 90,
            avgProfitLossPercent: 65.5,
            winRate: 0.9,
            tier: 'elite'
          }
        ]
      }
    }).as('getLeaderboardRefresh');
    
    // Click refresh button
    cy.get('[data-testid="refresh-button"]').click();
    cy.wait('@getLeaderboardRefresh');
    
    // Check new data is displayed
    cy.contains('NewTopTrader').should('be.visible');
    cy.contains('98.2').should('be.visible');
  });

  it('should be responsive on mobile', () => {
    cy.viewport('iphone-x');
    cy.wait('@getLeaderboard');
    
    // Table should still be visible
    cy.get('table').should('be.visible');
    
    // Should be horizontally scrollable
    cy.get('[data-testid="table-container"]').should('have.css', 'overflow-x', 'auto');
  });

  it('should display time since last update', () => {
    cy.wait('@getLeaderboard');
    
    // Should show last updated time
    cy.contains('Last updated').should('be.visible');
    cy.contains('ago').should('be.visible');
  });
}); 