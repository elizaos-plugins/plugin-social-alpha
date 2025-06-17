/// <reference types="cypress" />

// Custom commands for the trust marketplace
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Navigate to the leaderboard page
       */
      visitLeaderboard(): Chainable<void>;
      
      /**
       * Wait for leaderboard data to load
       */
      waitForLeaderboardData(): Chainable<void>;
      
      /**
       * Search for a user in the leaderboard
       */
      searchUser(username: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('visitLeaderboard', () => {
  cy.visit('/');
  cy.get('[data-testid="leaderboard-table"]', { timeout: 10000 }).should('be.visible');
});

Cypress.Commands.add('waitForLeaderboardData', () => {
  cy.intercept('GET', '/api/leaderboard*').as('getLeaderboard');
  cy.wait('@getLeaderboard');
});

Cypress.Commands.add('searchUser', (username: string) => {
  cy.get('input[placeholder*="Search"]').clear().type(username);
  cy.wait(500); // Debounce delay
});

export {}; 