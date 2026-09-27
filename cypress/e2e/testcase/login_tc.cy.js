/// <reference types="cypress" />

describe('Studio Login', () => {

  beforeEach(() => {
    cy.clearCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

  // TC01 - Verify Studio login page is displayed
  it('TC01 - Verify Studio login page is displayed', () => {

    cy.visit('/login')

    cy.url().should('include', '/login')

    cy.get('input[type="email"]')
      .should('be.visible')

    cy.get('input[type="password"]')
      .should('be.visible')

    cy.get('button[type="submit"]')
      .should('be.visible')
  })


  // TC02 - Verify successful Buyer Login
  it('TC02 - Verify successful Buyer Login', () => {

    cy.visit('/login')

    cy.get('input[type="email"]')
      .type('magarjanith@gmail.com')

    cy.get('input[type="password"]')
      .type('Sabin123')

    cy.get('button[type="submit"]')
      .click()

    // Verify that login was successful
    cy.url().should('not.include', '/login')

    // OPTIONAL: confirm we landed on buyer's expected page
    // cy.url().should('include', '/gallery')
  })


  // TC03 - Verify successful Admin Login
  it('TC03 - Verify successful Admin Login', () => {

    cy.visit('/login')

    cy.get('input[type="email"]')
      .type('tools@archphaze.com')

    cy.get('input[type="password"]')
      .type('sabin123', { log: false })

    cy.get('button[type="submit"]')
      .click()

    // Verify that login was successful
    cy.url().should('not.include', '/login')

    // OPTIONAL: confirm we landed on admin's expected page
    // cy.url().should('include', '/admin')
  })

})