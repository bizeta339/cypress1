/// <reference types="cypress" />

// ===============================================================
// SETTINGS
// ===============================================================
const START_PAGE = '/'
const SEARCH_ICON = '[aria-label*="search" i], button[title*="search" i]'
const SEARCH_INPUT = 'input[placeholder*="Search artworks"]'
const WISHLIST_ICON = '[aria-label*="wishlist" i], [aria-label*="favorite" i], [aria-label*="favourite" i], a[href*="wishlist" i], button[title*="wishlist" i]'

const CHIP_TO_TEST = 'Painting'
const REPORT_FILE = 'cypress/reports/wishlist-and-actions-report.md'
const ERROR_TEXT = /internal server error|application error|unhandled runtime error|\[object object\]|typeerror|referenceerror|stack trace|page not found|404/i

// Text we specifically look for and click on the artwork page, beyond the ones already known to work
const ACTION_KEYWORDS = [
  /inquire/i, /purchase/i, /buy now/i, /add to cart/i, /contact (the )?artist/i,
  /message/i, /make an offer/i, /request/i, /download/i, /report/i, /follow/i,
]

// Buttons we already understand and should not re-report as "untested"
const KNOWN_TEXT = [/^\s*share\s*$/i, /^\s*view profile\s*$/i, /^\s*read more\s*$/i, /^\s*\d+\s*$/]

// ===============================================================
// JIRA-STYLE BUG REPORT COLLECTOR
// ===============================================================
const findings = []
const addFinding = (severity, summary, detail = '') => {
  if (!findings.some((f) => f.summary === summary)) findings.push({ severity, summary, detail })
}

const buildReport = () => {
  const order = ['Critical', 'Major', 'Minor', 'Info']
  let out = `# Wishlist and artwork-action test report\n\nGenerated: ${new Date().toISOString()}\n\n`
  order.forEach((sev) => {
    const list = findings.filter((f) => f.severity === sev)
    out += `## ${sev} (${list.length})\n\n`
    if (list.length === 0) { out += '_None found_\n\n'; return }
    list.forEach((f, i) => {
      out += `### ${i + 1}. [${sev}] ${f.summary}\n`
      out += `**Steps / detail:** ${f.detail || 'n/a'}\n\n`
    })
  })
  return out
}

Cypress.on('uncaught:exception', (err) => {
  addFinding('Minor', `JavaScript error on the page: ${String(err.message).slice(0, 150)}`)
  return false
})

// ===============================================================
// PURE HELPERS (no cy commands inside)
// ===============================================================
const isShown = (el) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden'
}
const findVisible = (doc, selector) => Array.from(doc.querySelectorAll(selector)).filter(isShown)

const getPanelEl = (inputEl) => {
  const win = inputEl.ownerDocument.defaultView
  let el = inputEl.parentElement
  while (el && el.parentElement && el.tagName !== 'BODY') {
    const cs = win.getComputedStyle(el)
    if (cs.position === 'absolute' || cs.position === 'fixed' || (cs.boxShadow && cs.boxShadow !== 'none') || el.getBoundingClientRect().height >= 140) return el
    el = el.parentElement
  }
  return el
}

const getClickableItems = (rootEl, excludeTexts) => {
  const win = rootEl.ownerDocument.defaultView
  const isClickable = (el) => win.getComputedStyle(el).cursor === 'pointer' || el.matches('a[href], button, [role="button"], [role="option"]')
  return Array.from(rootEl.querySelectorAll('*'))
    .filter((el) => {
      if (!isClickable(el)) return false
      const p = el.parentElement
      if (p && p !== rootEl && isClickable(p)) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    .map((el) => ({ el, text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text.length > 0)
    .filter((item) => !excludeTexts.some((t) => t.toLowerCase() === item.text.toLowerCase()))
}

// Every clickable element in the whole page outside the header/nav (buttons and links)
const getPageActions = (doc) => {
  return Array.from(doc.querySelectorAll('button, a[href], [role="button"]'))
    .filter((el) => !el.closest('header, nav'))
    .filter(isShown)
    .map((el) => ({ el, text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text.length > 0)
}

// ===============================================================
// CYPRESS HELPERS
// ===============================================================
const loginAsBuyer = () => {
  cy.session('buyer-login', () => {
    cy.visit('/login')
    cy.get('input[type="email"]').type('bijetapradhan10@gmail.com')
    cy.get('input[type="password"]').type('helloo.1$', { log: false })
    cy.get('button[type="submit"]').click()
    cy.url({ timeout: 15000 }).should('not.include', '/login')
  })
}

const searchInput = (timeout = 10000) => cy.get(SEARCH_INPUT, { timeout }).filter(':visible').first()

const openSearchAndPickFirstResult = () => {
  cy.visit(START_PAGE)
  cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
  cy.wait(2000)
  cy.get(SEARCH_ICON).first().click()
  searchInput().should('be.visible')

  searchInput().then(($input) => {
    cy.wrap(getClickableItems(getPanelEl($input[0]), []).map((i) => i.text)).as('beforeTexts')
  })

  cy.contains('button', new RegExp(`^${CHIP_TO_TEST}$`, 'i')).click()

  cy.get('@beforeTexts').then((before) => {
    searchInput(15000).should(($input) => {
      const fresh = getClickableItems(getPanelEl($input[0]), before)
      expect(fresh.length, 'search results').to.be.greaterThan(0)
    })
  })

  cy.wait(1500)
  cy.get('@beforeTexts').then((before) => {
    searchInput().then(($input) => {
      const fresh = getClickableItems(getPanelEl($input[0]), before)
      cy.wrap(Cypress.$(fresh[0].el)).scrollIntoView().click()
    })
  })

  cy.contains(/view profile/i, { timeout: 15000 }).should('be.visible')
}

const getHeart = () =>
  cy.get('button:not(header button):not(nav button)', { timeout: 15000 })
    .filter((i, el) => /^\s*\d+\s*$/.test(el.textContent))
    .first()

const getArtworkTitle = () => {
  // The title is the large bold text right above "Painting" / medium tags near the top of the info column
  return cy.get('h1, h2').filter(':visible').first().invoke('text').then((t) => t.trim())
}

// ===============================================================
// HOOKS
// ===============================================================
beforeEach(() => {
  cy.viewport(1440, 900)
  loginAsBuyer()

  cy.intercept('**', (req) => {
    req.on('response', (res) => {
      if (res.statusCode >= 400 && !/__cypress|__\/|favicon|hot-update/.test(req.url)) {
        const short = req.url.length > 110 ? `${req.url.slice(0, 110)}...` : req.url
        addFinding(res.statusCode >= 500 ? 'Critical' : 'Major', `HTTP ${res.statusCode} on ${req.method} ${short}`)
      }
    })
  })
})

after(() => {
  cy.writeFile(REPORT_FILE, buildReport())
})

// ===============================================================
// 1) WISHLIST: add, verify on the wishlist page, remove, verify gone
// ===============================================================
describe('Wishlist - add and verify', () => {

  it('Adding an artwork to the wishlist makes it appear on the wishlist page', () => {
    openSearchAndPickFirstResult()

    cy.url().then((artworkUrl) => {
    getArtworkTitle().then((title) => {
      addFinding('Info', `Testing wishlist with artwork titled "${title}"`)

      getHeart().invoke('text').then((before) => {
        const original = before.trim()

        getHeart().click()
        getHeart().invoke('text').should((after) => {
          expect(after.trim(), 'heart count changed after clicking').not.to.eq(original)
        })

        // Try to reach the wishlist page: first the header icon, then a direct /wishlist visit
        // (uses the browser's native selector engine, not jQuery's .find(), since jQuery here
        // does not support the "i" case-insensitive attribute flag)
        cy.document().then((doc) => {
          const icon = findVisible(doc, WISHLIST_ICON)
          if (icon.length > 0) {
            cy.wrap(Cypress.$(icon[0])).click()
          } else {
            cy.visit('/wishlist', { failOnStatusCode: false })
          }
        })

        cy.wait(2000)

        cy.get('body').then(($body) => {
          const text = $body[0].innerText
          if (ERROR_TEXT.test(text)) {
            addFinding('Major', 'Could not open a wishlist page', 'Neither a header wishlist icon nor /wishlist showed a working page. Please tell me the real wishlist link.')
            return
          }

          if (text.includes(title)) {
            addFinding('Info', `Wishlist page correctly shows "${title}" after adding it`)
          } else {
            addFinding('Major', `Wishlist page does not show "${title}" after adding it to the wishlist`, `Wishlist page text sample: "${text.replace(/\s+/g, ' ').slice(0, 200)}"`)
          }
        })

        // Return to the exact artwork page directly (more reliable than the browser Back button
        // on this site) and try to remove it again, so the account's wishlist is left as it was.
        // This cleanup step is reported rather than failed outright, so the run finishes and the
        // report (with the actual wishlist result above) still gets written either way.
        cy.visit(artworkUrl)
        cy.contains(/view profile/i, { timeout: 15000 }).should('be.visible')
        cy.wait(1500)

        getHeart().click()
        cy.wait(1000)
        getHeart().invoke('text').then((restored) => {
          if (restored.trim() !== original) {
            addFinding('Minor', 'Could not confirm the wishlist heart was un-clicked back to its original count after the test', `Expected "${original}", saw "${restored.trim()}". The artwork may still be left in the account's wishlist - please remove it manually if so. Artwork URL: ${artworkUrl}`)
          }
        })
      })
    })
    })
  })

})

// ===============================================================
// 2) ARTWORK PAGE: discover and test every action, report anything untested
// ===============================================================
describe('Artwork page - every action', () => {

  beforeEach(() => {
    openSearchAndPickFirstResult()
  })

  it('Every button/link on the artwork page is listed, and known + likely actions are tested', () => {
    cy.url().then((artworkUrl) => {
    cy.document().then((doc) => {
      const actions = getPageActions(doc)
      addFinding('Info', `Found ${actions.length} clickable action(s) on the artwork page`, actions.map((a) => a.text).join(' | '))

      actions.forEach((a) => {
        const isKnown = KNOWN_TEXT.some((re) => re.test(a.text))
        const isInteresting = ACTION_KEYWORDS.some((re) => re.test(a.text))
        if (!isKnown && !isInteresting) {
          addFinding('Info', `Untested button/link found on the artwork page: "${a.text}"`, 'Not covered by an automated check yet. Please confirm what it should do so a test can be added.')
        }
      })
    })

    // Click every button/link that matches a known "purchase/inquire/contact/etc" keyword
    cy.document().then((doc) => {
      const actions = getPageActions(doc)
      const toTest = actions.filter((a) => ACTION_KEYWORDS.some((re) => re.test(a.text)))

      if (toTest.length === 0) {
        addFinding('Info', 'No "Inquire to purchase", "Contact artist" or similar button was found on the artwork page')
      }

      toTest.forEach((a) => {
        cy.wrap(null).then(() => {
          const urlBefore = doc.defaultView.location.href
          const textBefore = doc.body.innerText.length
          const popupsBefore = doc.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="toast" i]').length

          cy.wrap(Cypress.$(a.el)).scrollIntoView().click({ force: true })
          cy.wait(1200)

          cy.document().then((doc2) => {
            const urlAfter = doc2.defaultView.location.href
            const textAfter = doc2.body.innerText.length
            const popupsAfter = doc2.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="toast" i]').length
            const errored = ERROR_TEXT.test(doc2.body.innerText)

            if (errored) {
              addFinding('Critical', `Clicking "${a.text}" caused an error on the page`)
            } else if (urlAfter !== urlBefore) {
              addFinding('Info', `"${a.text}" navigates to a new page`, urlAfter)
            } else if (popupsAfter > popupsBefore) {
              addFinding('Info', `"${a.text}" opens a popup/dialog/modal`)
            } else if (textAfter !== textBefore) {
              addFinding('Info', `"${a.text}" changes the page content when clicked`)
            } else {
              addFinding('Major', `"${a.text}" gave no visible reaction when clicked`, 'No new page, no popup, and no content change was detected.')
            }
          })

          // Try to return to the exact artwork page for the next button in the list
          // (a direct revisit is more reliable here than the browser Back button)
          cy.location('href').then((href) => {
            if (href !== urlBefore) {
              cy.visit(artworkUrl)
              cy.contains(/view profile/i, { timeout: 15000 }).should('be.visible')
            }
          })
        })
      })
    })
    })
  })

})