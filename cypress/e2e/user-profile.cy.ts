describe('User Profile Functionality', () => {
  beforeEach(() => {
    // Mock leaderboard API
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
            tier: 'elite'
          }
        ]
      }
    }).as('getLeaderboard');

    // Mock user profile API
    cy.intercept('GET', '/api/users/user1', {
      statusCode: 200,
      body: {
        userId: 'user1',
        username: 'EliteTrader',
        trustScore: 95.5,
        totalCalls: 150,
        successRate: 85,
        avgProfitLossPercent: 45.2,
        bestCallProfitPercent: 120,
        worstCallLossPercent: -20,
        recentCalls: [
          {
            id: 'call1',
            tokenSymbol: 'SOL',
            callType: 'BUY',
            timestamp: new Date().toISOString(),
            profitLoss: 25.5,
            status: 'successful'
          },
          {
            id: 'call2',
            tokenSymbol: 'ETH',
            callType: 'SELL',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            profitLoss: -10.2,
            status: 'unsuccessful'
          }
        ],
        performanceHistory: {
          daily: [10, 15, -5, 20, 25, 30, 12],
          weekly: [45, 60, 80, 95],
          monthly: [200, 250, 300]
        }
      }
    }).as('getUserProfile');

    cy.visit('/');
    cy.wait('@getLeaderboard');
  });

  it('should navigate to user profile when clicking username', () => {
    // Click on username
    cy.contains('EliteTrader').click();
    
    // Should navigate to profile page
    cy.url().should('include', '/users/user1');
    
    // Wait for profile data
    cy.wait('@getUserProfile');
    
    // Check profile header
    cy.contains('h1', 'EliteTrader').should('be.visible');
    cy.contains('Trust Score: 95.5').should('be.visible');
    cy.contains('Elite Tier').should('be.visible');
  });

  it('should display recent calls', () => {
    cy.contains('EliteTrader').click();
    cy.wait('@getUserProfile');
    
    // Check recent calls section
    cy.contains('h2', 'Recent Calls').should('be.visible');
    
    // Check call details
    cy.contains('SOL').should('be.visible');
    cy.contains('BUY').should('be.visible');
    cy.contains('+25.5%').should('be.visible');
    
    cy.contains('ETH').should('be.visible');
    cy.contains('SELL').should('be.visible');
    cy.contains('-10.2%').should('be.visible');
  });

  it('should display performance charts', () => {
    cy.contains('EliteTrader').click();
    cy.wait('@getUserProfile');
    
    // Check chart tabs
    cy.contains('button', 'Daily').should('be.visible');
    cy.contains('button', 'Weekly').should('be.visible');
    cy.contains('button', 'Monthly').should('be.visible');
    
    // Check chart is rendered
    cy.get('canvas[data-testid="performance-chart"]').should('be.visible');
    
    // Switch to weekly view
    cy.contains('button', 'Weekly').click();
    
    // Chart should update
    cy.get('canvas[data-testid="performance-chart"]').should('be.visible');
  });

  it('should show follow/unfollow functionality', () => {
    cy.contains('EliteTrader').click();
    cy.wait('@getUserProfile');
    
    // Mock follow API
    cy.intercept('POST', '/api/users/user1/follow', {
      statusCode: 200,
      body: { success: true, followersCount: 501 }
    }).as('followUser');
    
    // Click follow button
    cy.contains('button', 'Follow').click();
    cy.wait('@followUser');
    
    // Button should change to unfollow
    cy.contains('button', 'Unfollow').should('be.visible');
    
    // Follower count should update
    cy.contains('501 followers').should('be.visible');
  });

  it('should export user data', () => {
    cy.contains('EliteTrader').click();
    cy.wait('@getUserProfile');
    
    // Click export button
    cy.contains('button', 'Export Data').click();
    
    // Check download options
    cy.contains('CSV').should('be.visible');
    cy.contains('JSON').should('be.visible');
    
    // Mock download
    cy.intercept('GET', '/api/users/user1/export?format=csv', {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="EliteTrader_data.csv"'
      },
      body: 'Date,Token,Type,P&L\n2024-01-01,SOL,BUY,25.5'
    }).as('exportCSV');
    
    cy.contains('CSV').click();
    cy.wait('@exportCSV');
  });
}); 