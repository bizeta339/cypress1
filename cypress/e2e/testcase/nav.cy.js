/// <reference types="cypress" />

describe('Header Navigation', () => {

  beforeEach(() => {
    cy.viewport(1440, 900) // force a desktop-sized window so nav isn't collapsed
  })

  const login = () => {
    cy.session('buyer-login', () => {
      cy.visit('/login')

      cy.get('input[type="email"]')
        .type('bijetapradhan10@gmail.com')

      cy.get('input[type="password"]')
        .type('helloo.1$', { log: false })

      cy.get('button[type="submit"]')
        .click()

      cy.url({ timeout: 15000 }).should('not.include', '/login')
    })
  }

  beforeEach(() => {
    login()
    cy.visit('/')
    cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
  })

  it('TC01 - Should display all nav menu items', () => {
    cy.contains(/home/i).should('be.visible')
    cy.contains(/gallery/i).should('be.visible')
    cy.contains(/market/i).should('be.visible')
    cy.contains(/artist/i).should('be.visible')
    cy.contains(/exhibition/i).should('be.visible')
    cy.contains(/story/i).should('be.visible')
  })

  it('TC02 - Clicking GALLERY should navigate away from current page', () => {
    cy.url().then((startUrl) => {
      cy.contains(/gallery/i).click()
      cy.url().should('not.eq', startUrl)
    })
  })

  it('TC03 - Clicking MARKET should navigate away from current page', () => {
    cy.url().then((startUrl) => {
      cy.contains(/market/i).click()
      cy.url().should('not.eq', startUrl)
    })
  })

  it('TC04 - Clicking ARTIST should navigate away from current page', () => {
    cy.url().then((startUrl) => {
      cy.contains(/artist/i).click()
      cy.url().should('not.eq', startUrl)
    })
  })

  it('TC05 - Clicking EXHIBITION should navigate away from current page', () => {
    cy.url().then((startUrl) => {
      cy.contains(/exhibition/i).click()
      cy.url().should('not.eq', startUrl)
    })
  })

  it('TC06 - Clicking STORY should navigate away from current page', () => {
    cy.url().then((startUrl) => {
      cy.contains(/story/i).click()
      cy.url().should('not.eq', startUrl)
    })
  })

})