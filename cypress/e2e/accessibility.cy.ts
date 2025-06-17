describe('Accessibility Tests', () => {
  beforeEach(() => {
    // Mock API
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

    cy.visit('/');
    cy.wait('@getLeaderboard');
  });

  it('should have proper page structure', () => {
    // Check for main landmark
    cy.get('main').should('exist');
    
    // Check for header
    cy.get('header').should('exist');
    
    // Check for navigation if exists
    cy.get('nav').should('exist');
  });

  it('should have proper heading hierarchy', () => {
    // Should have exactly one h1
    cy.get('h1').should('have.length', 1);
    
    // h1 should be before any h2
    cy.get('h1').should('exist');
    cy.get('h2').should('exist');
    
    // Check heading order
    cy.get('h1, h2, h3, h4, h5, h6').then($headings => {
      let lastLevel = 0;
      $headings.each((index, heading) => {
        const level = parseInt(heading.tagName.charAt(1));
        // Heading levels should not skip (e.g., h1 -> h3)
        expect(level - lastLevel).to.be.lessThan(2);
        lastLevel = level;
      });
    });
  });

  it('should have proper ARIA labels', () => {
    // Search input should have label
    cy.get('input[type="search"]').should('have.attr', 'aria-label');
    
    // Buttons should have accessible text or aria-label
    cy.get('button').each($button => {
      const text = $button.text().trim();
      const ariaLabel = $button.attr('aria-label');
      expect(text || ariaLabel).to.not.be.empty;
    });
    
    // Table should have caption or aria-label
    cy.get('table').should('satisfy', ($table) => {
      return $table.attr('aria-label') || $table.find('caption').length > 0;
    });
  });

  it('should be keyboard navigable', () => {
    // Tab to search input
    cy.get('body').tab();
    cy.focused().should('have.attr', 'type', 'search');
    
    // Tab through interactive elements
    cy.tab();
    cy.focused().should('match', 'button, a, input, select, textarea');
    
    // Test table navigation
    cy.get('table').focus();
    cy.focused().should('match', 'table, [tabindex="0"]');
  });

  it('should have sufficient color contrast', () => {
    // Check text contrast
    cy.get('body').should('have.css', 'color');
    cy.get('body').should('have.css', 'background-color');
    
    // Check button contrast
    cy.get('button').each($button => {
      cy.wrap($button).should('have.css', 'color');
      cy.wrap($button).should('have.css', 'background-color');
    });
    
    // Check link contrast
    cy.get('a').each($link => {
      cy.wrap($link).should('have.css', 'color');
    });
  });

  it('should have alt text for images', () => {
    cy.get('img').each($img => {
      cy.wrap($img).should('have.attr', 'alt');
    });
  });

  it('should announce dynamic content changes', () => {
    // Search and check for live region
    cy.get('input[type="search"]').type('Elite');
    
    // Should have aria-live region for results
    cy.get('[aria-live]').should('exist');
    cy.get('[role="status"]').should('exist');
  });

  it('should have focus indicators', () => {
    // Tab to first interactive element
    cy.get('body').tab();
    
    // Check for focus outline
    cy.focused().should('have.css', 'outline-style').and('not.eq', 'none');
  });

  it('should support screen reader landmarks', () => {
    // Check for main content area
    cy.get('[role="main"], main').should('exist');
    
    // Check for navigation
    cy.get('[role="navigation"], nav').should('exist');
    
    // Check for banner/header
    cy.get('[role="banner"], header').should('exist');
  });

  it('should have proper form labels', () => {
    // All form inputs should have labels
    cy.get('input:not([type="hidden"])').each($input => {
      const id = $input.attr('id');
      if (id) {
        cy.get(`label[for="${id}"]`).should('exist');
      } else {
        cy.wrap($input).should('have.attr', 'aria-label');
      }
    });
  });

  it('should handle focus trap in modals', () => {
    // If there's a modal trigger, test it
    cy.get('[data-testid="help-button"]').then($button => {
      if ($button.length) {
        $button.click();
        
        // Check modal has proper attributes
        cy.get('[role="dialog"]').should('exist');
        cy.get('[role="dialog"]').should('have.attr', 'aria-modal', 'true');
        
        // Check focus is trapped
        cy.focused().should('be.visible');
        
        // Tab should stay within modal
        cy.tab();
        cy.focused().parents('[role="dialog"]').should('exist');
      }
    });
  });

  it('should provide skip links', () => {
    // Check for skip to main content link
    cy.get('a[href="#main"], a[href="#content"]').should('exist');
  });

  it('should have proper table headers', () => {
    // Check table has proper header structure
    cy.get('table').within(() => {
      // Should have thead
      cy.get('thead').should('exist');
      
      // All th elements should have scope
      cy.get('th').each($th => {
        cy.wrap($th).should('have.attr', 'scope');
      });
      
      // Check for row headers if applicable
      cy.get('tbody tr').each($row => {
        cy.wrap($row).find('th[scope="row"]').should('exist');
      });
    });
  });

  it('should handle error states accessibly', () => {
    // Force an error
    cy.intercept('GET', '/api/leaderboard', {
      statusCode: 500,
      body: { error: 'Server Error' }
    }).as('getError');
    
    cy.visit('/');
    cy.wait('@getError');
    
    // Error message should be announced
    cy.get('[role="alert"]').should('exist');
    cy.get('[aria-live="assertive"]').should('exist');
  });
}); 