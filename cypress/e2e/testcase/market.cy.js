/// <reference types="cypress" />

// ===============================================================
// SETTINGS
// ===============================================================
const START_PAGE = '/'
const SEARCH_TERM_ARTWORK = 'Painting'
const SEARCH_TERM_ARTIST = 'test_artist'

const REPORT_FILE = 'cypress/reports/market-report.md'
const ERROR_TEXT = /internal server error|application error|unhandled runtime error|\[object object\]|typeerror|referenceerror|stack trace|page not found|404/i

// Words that suggest a control is a filter, not just decoration
const FILTER_WORDS = /filter|category|categories|price|sort|type|medium|style|size|status|availability|newest|oldest|low to high|high to low/i

// ===============================================================
// JIRA-STYLE BUG REPORT COLLECTOR
// ===============================================================
const findings = []
const addFinding = (severity, summary, detail = '') => {
  if (!findings.some((f) => f.summary === summary)) findings.push({ severity, summary, detail })
}
const buildReport = () => {
  const order = ['Critical', 'Major', 'Minor', 'Info']
  let out = `# Market page test report\n\nGenerated: ${new Date().toISOString()}\n\n`
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
// PURE HELPERS (native selector engine, no jQuery .find with case-insensitive flags)
// ===============================================================
const isShown = (el) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden'
}
const findVisible = (doc, selector) => Array.from(doc.querySelectorAll(selector)).filter(isShown)
const textOf = (el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim()

const assertNoErrorText = () => {
  cy.get('body').should(($body) => {
    expect($body[0].innerText).not.to.match(ERROR_TEXT)
  })
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

const goToMarket = () => {
  cy.visit(START_PAGE)
  cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
  cy.wait(1500)
  cy.contains(/^\s*market\s*$/i).click()
  cy.wait(2500)
  assertNoErrorText()
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
// 1) MARKET PAGE LOADS
// ===============================================================
describe('Market page - loads correctly', () => {

  it('Clicking MARKET opens the market page', () => {
    cy.url().then((startUrl) => {
      goToMarket()
      cy.url().should('not.eq', startUrl)
    })

    cy.get('body').should(($body) => {
      expect($body[0].innerText.trim().length, 'market page has visible content').to.be.greaterThan(20)
    })

    cy.document().then((doc) => {
      addFinding('Info', 'Market page reached successfully', doc.location.href)
    })
  })

})

// ===============================================================
// 2) SEARCH ON THE MARKET PAGE
// ===============================================================
describe('Market page - search', () => {

  beforeEach(() => {
    goToMarket()
  })

  it('A search box exists on (or reachable from) the market page', () => {
    cy.document().then((doc) => {
      const inputs = findVisible(doc, 'input[type="search"], input[placeholder*="search" i]')
      const icon = findVisible(doc, '[aria-label*="search" i], button[title*="search" i]')

      if (inputs.length === 0 && icon.length === 0) {
        addFinding('Major', 'No search box or search icon was found on the market page')
      } else {
        addFinding('Info', `Market page search: ${inputs.length} input(s) directly visible, ${icon.length} search icon(s) found`)
      }
    })
  })

  it('Searching for an artwork term shows a reaction', () => {
    cy.document().then((doc) => {
      let inputs = findVisible(doc, 'input[type="search"], input[placeholder*="search" i]')

      if (inputs.length === 0) {
        const icon = findVisible(doc, '[aria-label*="search" i], button[title*="search" i]')
        if (icon.length > 0) {
          cy.wrap(Cypress.$(icon[0])).click()
          cy.wait(500)
        }
      }
    })

    cy.document().then((doc) => {
      const inputs = findVisible(doc, 'input[type="search"], input[placeholder*="search" i]')
      if (inputs.length === 0) {
        addFinding('Major', 'Could not find a usable search input on the market page to test with')
        return
      }

      const textBefore = doc.body.innerText.length
      cy.wrap(Cypress.$(inputs[0])).clear().type(SEARCH_TERM_ARTWORK, { delay: 0 })
      cy.wait(2000)

      cy.get('body').then(($body) => {
        const textAfter = $body[0].innerText.length
        if (textAfter === textBefore) {
          addFinding('Major', `Searching "${SEARCH_TERM_ARTWORK}" on the market page caused no visible change`)
        } else {
          addFinding('Info', `Searching "${SEARCH_TERM_ARTWORK}" on the market page changed the page content`)
        }
      })

      assertNoErrorText()
    })
  })

  it('Searching for an artist name shows a reaction', () => {
    cy.document().then((doc) => {
      let inputs = findVisible(doc, 'input[type="search"], input[placeholder*="search" i]')
      if (inputs.length === 0) {
        const icon = findVisible(doc, '[aria-label*="search" i], button[title*="search" i]')
        if (icon.length > 0) {
          cy.wrap(Cypress.$(icon[0])).click()
          cy.wait(500)
        }
      }
    })

    cy.document().then((doc) => {
      const inputs = findVisible(doc, 'input[type="search"], input[placeholder*="search" i]')
      if (inputs.length === 0) {
        addFinding('Major', 'Could not find a usable search input on the market page to test artist search')
        return
      }

      const textBefore = doc.body.innerText.length
      cy.wrap(Cypress.$(inputs[0])).clear().type(SEARCH_TERM_ARTIST, { delay: 0 })
      cy.wait(2000)

      cy.get('body').then(($body) => {
        const found = $body[0].innerText.includes(SEARCH_TERM_ARTIST)
        const textAfter = $body[0].innerText.length
        if (!found && textAfter === textBefore) {
          addFinding('Major', `Searching the artist name "${SEARCH_TERM_ARTIST}" on the market page caused no visible change`)
        } else if (!found) {
          addFinding('Minor', `Searching the artist name "${SEARCH_TERM_ARTIST}" changed the page but the name itself was not shown in the results`)
        } else {
          addFinding('Info', `Searching the artist name "${SEARCH_TERM_ARTIST}" on the market page correctly showed a result`)
        }
      })

      assertNoErrorText()
    })
  })

})

// ===============================================================
// 3) FILTERS ON THE MARKET PAGE
// ===============================================================
describe('Market page - filters', () => {

  beforeEach(() => {
    goToMarket()
  })

  it('Every filter-like control is listed', () => {
    cy.document().then((doc) => {
      const selects = findVisible(doc, 'select')
      const checkboxes = findVisible(doc, 'input[type="checkbox"]')
      const radios = findVisible(doc, 'input[type="radio"]')
      const filterButtons = findVisible(doc, 'button, [role="button"]').filter((el) => FILTER_WORDS.test(textOf(el)))

      addFinding(
        'Info',
        `Market page filter controls found: ${selects.length} dropdown(s), ${checkboxes.length} checkbox(es), ${radios.length} radio button(s), ${filterButtons.length} filter-labelled button(s)`,
        [...selects, ...filterButtons].map(textOf).filter(Boolean).slice(0, 15).join(' | ')
      )

      if (selects.length + checkboxes.length + radios.length + filterButtons.length === 0) {
        addFinding('Minor', 'No filter controls (dropdown, checkbox, radio, or filter-labelled button) were detected on the market page', 'Please confirm the filter UI exists and tell me what it looks like if this is wrong.')
      }
    })
  })

  it('Each dropdown filter reacts when changed', () => {
    cy.document().then((doc) => {
      const selects = findVisible(doc, 'select')
      if (selects.length === 0) {
        addFinding('Info', 'No dropdown filters to test on the market page')
        return
      }

      selects.forEach((sel, idx) => {
        const options = Array.from(sel.options).map((o) => o.value)
        if (options.length < 2) return

        const label = sel.getAttribute('aria-label') || sel.name || `dropdown #${idx + 1}`
        const originalValue = sel.value
        const textBefore = doc.body.innerText.length

        cy.wrap(Cypress.$(sel)).select(options[1], { force: true })
        cy.wait(1500)

        cy.get('body').then(($body) => {
          const changed = $body[0].innerText.length !== textBefore
          addFinding('Info', `Dropdown "${label}": ${changed ? 'changes the page when a different option is selected' : 'no visible change detected when changed'}`)
          if (!changed) {
            addFinding('Minor', `Dropdown "${label}" on the market page shows no visible reaction when its value is changed`)
          }
        })

        // put it back to how it was
        cy.wrap(Cypress.$(sel)).select(originalValue, { force: true })
        cy.wait(500)
      })
    })
  })

  it('Each filter button/checkbox reacts when clicked', () => {
    cy.document().then((doc) => {
      const filterButtons = findVisible(doc, 'button, [role="button"]').filter((el) => FILTER_WORDS.test(textOf(el)))
      const checkboxes = findVisible(doc, 'input[type="checkbox"]')
      const toTest = [...filterButtons, ...checkboxes].slice(0, 8) // keep the run reasonably short

      if (toTest.length === 0) {
        addFinding('Info', 'No clickable filter buttons or checkboxes to test on the market page')
        return
      }

      toTest.forEach((el) => {
        const label = textOf(el) || el.getAttribute('name') || 'unlabelled filter control'
        const textBefore = doc.body.innerText.length
        const errorBefore = ERROR_TEXT.test(doc.body.innerText)

        cy.wrap(Cypress.$(el)).click({ force: true })
        cy.wait(1000)

        cy.get('body').then(($body) => {
          const errored = !errorBefore && ERROR_TEXT.test($body[0].innerText)
          const changed = $body[0].innerText.length !== textBefore

          if (errored) {
            addFinding('Critical', `Clicking the filter "${label}" caused an error on the market page`)
          } else if (!changed) {
            addFinding('Minor', `Filter "${label}" on the market page shows no visible reaction when clicked`)
          } else {
            addFinding('Info', `Filter "${label}" changes the market page results when clicked`)
          }
        })

        // click again in case it is a toggle, to leave the page roughly as it was
        cy.wrap(Cypress.$(el)).click({ force: true })
        cy.wait(500)
      })
    })
  })

})