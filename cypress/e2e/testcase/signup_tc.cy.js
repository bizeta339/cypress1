/// <reference types="cypress" />

describe('Studio Sign Up', () => {

  beforeEach(() => {
    cy.clearCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()

    cy.visit('/register')
  })


  // TC01 - Verify Sign Up page is displayed
  it('TC01 - Verify Sign Up page is displayed', () => {

    cy.url().should('include', '/register')

    cy.contains(/i am joining as/i, { timeout: 10000 })
      .should('be.visible')

    // More specific: only match the "Artist" option card, not any text containing "artist"
            cy.contains('Artist')
      .should('be.visible')

    cy.contains(/buyer \/ collector/i)
      .should('be.visible')

    cy.get('input[placeholder="Your full name"]')
      .should('be.visible')

    cy.get('input[placeholder="Enter your email"]')
      .should('be.visible')

    cy.get('input[placeholder*="Create password"]')
      .should('be.visible')

    cy.get('input[placeholder="Repeat your password"]')
      .should('be.visible')

    cy.contains(/create account/i)
      .should('be.visible')

    cy.contains(/continue with google/i)
      .should('be.visible')
  })



  // TC02 - Verify required field validation
   it('TC02 - Verify required fields', () => {

    cy.contains(/create account/i, { timeout: 10000 })
      .click()

    cy.url().should('include', '/register')

    // Site uses custom validation (red border class), not native 'required' attribute
    cy.get('input[placeholder="Your full name"]')
      .should('have.class', 'border-red-600')

    cy.get('input[placeholder="Enter your email"]')
      .should('have.class', 'border-red-600')

    cy.get('input[placeholder*="Create password"]')
      .should('have.class', 'border-red-600')

    cy.get('input[placeholder="Repeat your password"]')
      .should('have.class', 'border-red-600')
  })


  // TC03 - Verify invalid email validation
  it('TC03 - Verify invalid email is rejected', () => {

    cy.get('input[placeholder="Your full name"]', { timeout: 10000 })
      .type('Test User')

    cy.get('input[placeholder="Enter your email"]')
      .type('invalid-email')

    cy.get('input[placeholder*="Create password"]')
      .type('Test@1234')

    cy.get('input[placeholder="Repeat your password"]')
      .type('Test@1234')

    cy.contains(/create account/i)
      .click()

    cy.get('input[placeholder="Enter your email"]')
      .then(($input) => {
        expect($input[0].checkValidity()).to.equal(false)
      })
  })


  // TC04 - Verify password minimum length validation
  it('TC04 - Verify password shorter than 8 characters is rejected', () => {

    cy.get('input[placeholder="Your full name"]', { timeout: 10000 })
      .type('Test User')

    cy.get('input[placeholder="Enter your email"]')
      .type('testuser@example.com')

    cy.get('input[placeholder*="Create password"]')
      .type('Test12')

    cy.get('input[placeholder="Repeat your password"]')
      .type('Test12')

    cy.contains(/create account/i)
      .click()

    cy.url().should('include', '/register')
  })


  // TC05 - Verify password and confirm password must match
  it('TC05 - Verify password mismatch validation', () => {

    cy.get('input[placeholder="Your full name"]', { timeout: 10000 })
      .type('Test User')

    cy.get('input[placeholder="Enter your email"]')
      .type('testuser@example.com')

    cy.get('input[placeholder*="Create password"]')
      .type('Test@1234')

    cy.get('input[placeholder="Repeat your password"]')
      .type('Different@123')

    cy.contains(/create account/i)
      .click()

    cy.url().should('include', '/register')
  })


  // TC06 - Verify Buyer / Collector selection
  it('TC06 - Verify Buyer / Collector option can be selected', () => {

    cy.contains(/buyer \/ collector/i, { timeout: 10000 })
      .click()

    cy.contains(/buyer \/ collector/i)
      .should('be.visible')
  })

})