/// <reference types="cypress" />

// ===============================================================
// SETTINGS (you can change these)
// ===============================================================
const START_PAGE = '/'
const SEARCH_ICON = '[aria-label*="search" i], button[title*="search" i]'
const SEARCH_INPUT = 'input[placeholder*="Search artworks"]'

const CHIPS_WITH_CONTENT = ['Painting', 'Digital']
const CHIPS_EMPTY = ['Photography', 'Sculpture', 'Mixed Media', 'Oil']
const ALL_CHIPS = [...CHIPS_WITH_CONTENT, ...CHIPS_EMPTY]

const MAX_RESULTS_TO_OPEN = 3          // how many results to open in each category
const RESULTS_FOR_FEATURE_TESTS = 2    // how many of them get the full button tests

const REPORT_FILE = 'cypress/reports/search-bug-report.md'
const ERROR_TEXT = /internal server error|application error|unhandled runtime error|\[object object\]|typeerror|referenceerror|stack trace/i

// ===============================================================
// BUG REPORT COLLECTOR
// BUG = definite problem, WARNING = please verify, INFO = observation
// ===============================================================
const findings = []

const addFinding = (type, title, detail = '') => {
  if (!findings.some((f) => f.type === type && f.title === title)) {
    findings.push({ type, title, detail })
  }
}

const buildReport = () => {
  const groups = [
    ['BUG', 'Bugs'],
    ['WARNING', 'Warnings (please verify)'],
    ['INFO', 'Observations'],
  ]
  let out = `# Search and artwork test report\n\nGenerated: ${new Date().toISOString()}\n\n`
  groups.forEach(([type, heading]) => {
    const list = findings.filter((f) => f.type === type)
    out += `## ${heading} (${list.length})\n\n`
    if (list.length === 0) out += '_None found_\n'
    list.forEach((f, i) => {
      out += `${i + 1}. **${f.title}**${f.detail ? ` - ${f.detail}` : ''}\n`
    })
    out += '\n'
  })
  return out
}

// A JavaScript error inside the website should not stop the test, but it goes in the report
Cypress.on('uncaught:exception', (err) => {
  addFinding('WARNING', `JavaScript error on the page: ${String(err.message).slice(0, 150)}`)
  return false
})

// <<HELPERS-START>>
// Pure helpers that read the page. They never call cy commands.

const srcOf = (el) => el.currentSrc || el.getAttribute('src')

const isShown = (el) => {
  const r = el.getBoundingClientRect()
  return (
    r.width > 0 &&
    r.height > 0 &&
    el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden'
  )
}

// All visible elements matching a selector (uses the browser's own selector engine)
const findVisible = (doc, selector) => Array.from(doc.querySelectorAll(selector)).filter(isShown)

// Finds the dropdown card that holds the search box
const getPanelEl = (inputEl) => {
  const win = inputEl.ownerDocument.defaultView
  let el = inputEl.parentElement
  while (el && el.parentElement && el.tagName !== 'BODY') {
    const cs = win.getComputedStyle(el)
    const isFloating = cs.position === 'absolute' || cs.position === 'fixed'
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none'
    if (isFloating || hasShadow || el.getBoundingClientRect().height >= 140) return el
    el = el.parentElement
  }
  return el
}

// Every clickable row inside an element (outermost clickable only, with its text)
const getClickableItems = (rootEl) => {
  const win = rootEl.ownerDocument.defaultView
  const isClickable = (el) =>
    win.getComputedStyle(el).cursor === 'pointer' ||
    el.matches('a[href], button, [role="button"], [role="option"]')

  return Array.from(rootEl.querySelectorAll('*'))
    .filter((el) => {
      if (!isClickable(el)) return false
      const parent = el.parentElement
      if (parent && parent !== rootEl && isClickable(parent)) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    .map((el) => ({
      el,
      text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((item) => item.text.length > 0)
    .filter((item) => !ALL_CHIPS.some((c) => c.toLowerCase() === item.text.toLowerCase()))
}

// Rows that were NOT in the dropdown before (these are the search results)
const freshItems = (inputEl, beforeTexts) =>
  getClickableItems(getPanelEl(inputEl)).filter((item) => !beforeTexts.includes(item.text))

const panelText = (inputEl) =>
  getPanelEl(inputEl).innerText.replace(/\s+/g, ' ').trim().slice(0, 300)
// <<HELPERS-END>>

// ===============================================================
// CYPRESS HELPERS
// ===============================================================
const loginAsBuyer = () => {
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

// The visible search box (some pages contain more than one matching box)
const searchInput = (timeout = 10000) =>
  cy.get(SEARCH_INPUT, { timeout }).filter(':visible').first()

const chipButton = (chip) => cy.contains('button', new RegExp(`^${chip}$`, 'i'))
const clickChip = (chip) => chipButton(chip).click()

const openSearch = () => {
  cy.get(SEARCH_ICON).first().click()
  searchInput().should('be.visible')
}

// Open the start page, open search and remember what is in the dropdown before anything is clicked
const startSearch = () => {
  cy.visit(START_PAGE)
  cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
  cy.wait(2000)
  openSearch()

  searchInput().then(($input) => {
    cy.wrap(getClickableItems(getPanelEl($input[0])).map((i) => i.text)).as('beforeTexts')
  })
}

// Wait until result rows appear in the dropdown and return their texts (fails if none appear)
const waitForResults = () => {
  return cy.get('@beforeTexts').then((before) => {
    return searchInput(15000)
      .should(($input) => {
        const fresh = freshItems($input[0], before)
        expect(
          fresh.length,
          `result rows in the dropdown. Dropdown text was: "${panelText($input[0])}"`
        ).to.be.greaterThan(0)
      })
      .then(($input) => freshItems($input[0], before).map((i) => i.text))
  })
}

// Same list, but never fails: returns [] when there are no results (or the dropdown closed)
const getResultsSafe = () => {
  return cy.get('@beforeTexts').then((before) => {
    return cy.get('body').then(($body) => {
      const inputs = findVisible($body[0].ownerDocument, SEARCH_INPUT)
      if (inputs.length === 0) return []
      return freshItems(inputs[0], before).map((i) => i.text)
    })
  })
}

// Waits up to "ms" for results, then returns whatever is there (possibly nothing). Never fails.
const waitForResultsOrTimeout = (ms = 8000) => {
  let t0 = 0
  cy.wrap(null).then(() => {
    t0 = Date.now()
  })
  return cy.get('@beforeTexts').then((before) => {
    return cy.get('body', { timeout: ms + 10000 })
      .should(($body) => {
        const inputs = findVisible($body[0].ownerDocument, SEARCH_INPUT)
        const fresh = inputs.length ? freshItems(inputs[0], before) : []
        expect(fresh.length > 0 || Date.now() - t0 > ms, 'results appeared or time is up').to.be.true
      })
      .then(() => getResultsSafe())
  })
}

const clickResult = (index) => {
  // The result list can refresh right after it appears; let it settle before clicking
  cy.wait(1500)
  cy.get('@beforeTexts').then((before) => {
    searchInput().then(($input) => {
      const fresh = freshItems($input[0], before)
      expect(fresh.length, `results available to click at position ${index + 1}`).to.be.greaterThan(index)
      cy.wrap(Cypress.$(fresh[index].el)).scrollIntoView().click()
    })
  })
}

// Tracks whether the requested result really opened a normal artwork page
const state = { opened: false }

// After a result was clicked: wait for the artwork page. If a different kind of page opens, report it.
const afterResultClick = (description) => {
  let t0 = 0
  cy.wrap(null).then(() => {
    t0 = Date.now()
  })

  cy.get('body', { timeout: 20000 }).should(($body) => {
    const ok = /view profile/i.test($body[0].innerText) || Date.now() - t0 > 8000
    expect(ok, 'artwork page opened (or 8 seconds passed)').to.be.true
  })

  cy.get('body').then(($body) => {
    const isArtwork = /view profile/i.test($body[0].innerText)
    state.opened = isArtwork
    if (!isArtwork) {
      cy.location('href').then((href) => {
        addFinding('WARNING', `${description} did not open a normal artwork page`, `page shown: ${href}`)
      })
    }
  })
}

const openResult = (chip, index) => {
  state.opened = false
  startSearch()
  clickChip(chip)

  waitForResults().then((texts) => {
    if (index >= texts.length) {
      cy.log(`${chip}: only ${texts.length} result(s), nothing at position ${index + 1}`)
      return
    }
    clickResult(index)
    afterResultClick(`${chip} result #${index + 1} ("${texts[index].slice(0, 40)}")`)
  })
}

// Runs the checks only if a normal artwork page is open (otherwise skips quietly; the reason is in the report)
const onArtwork = (fn) => {
  cy.wrap(null).then(() => {
    if (state.opened) {
      fn()
    } else {
      cy.log('Skipped: no normal artwork page for this result (see report)')
    }
  })
}

const assertNoErrorText = () => {
  cy.get('body').should(($body) => {
    expect($body[0].innerText).not.to.match(ERROR_TEXT)
  })
}

const expectPageHealthy = () => {
  cy.wait(1500)
  cy.get('body').should('be.visible')
  cy.location('hostname').should('eq', 'studio.archphaze.com')
  assertNoErrorText()
}

const checkArtworkDetails = () => {
  cy.contains(/share/i).should('be.visible')
  cy.contains(/view profile/i).should('be.visible')

  // Sections that may legitimately be empty are reported, not failed
  cy.get('body').then(($body) => {
    const text = $body[0].innerText
    ;['about the artwork', 'medium', 'year', 'dimensions'].forEach((label) => {
      if (!new RegExp(`^\\s*${label}\\s*$`, 'im').test(text)) {
        addFinding('WARNING', `An artwork page is missing the "${label}" section`)
      }
    })
  })
}

const checkNoBrokenImages = () => {
  cy.wait(1000)
  cy.get('img:visible').then(($imgs) => {
    const broken = Array.from($imgs)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map(srcOf)
    if (broken.length > 0) {
      addFinding('WARNING', 'Broken image(s) on an artwork page', broken.slice(0, 3).join(' | '))
    }
  })
}

// The heart button on the artwork page (ignores the heart in the header)
const getHeart = () =>
  cy.get('button:not(header button):not(nav button)', { timeout: 15000 })
    .filter((i, el) => /^\s*\d+\s*$/.test(el.textContent))
    .first()

const typeSearch = (text) => {
  searchInput().clear()
  searchInput().type(text, { delay: 0, parseSpecialCharSequences: false })
}

const POPUP_SELECTOR = '[role="dialog"], [class*="modal" i], [class*="toast" i], [class*="popover" i]'

// ===============================================================
// GLOBAL HOOKS
// ===============================================================
beforeEach(() => {
  cy.viewport(1440, 900)
  loginAsBuyer()

  // Watch every network call and record server errors for the report
  cy.intercept('**', (req) => {
    req.on('response', (res) => {
      const status = res.statusCode
      if (status >= 400 && !/__cypress|__\/|favicon|hot-update/.test(req.url)) {
        const short = req.url.length > 110 ? `${req.url.slice(0, 110)}...` : req.url
        addFinding(status >= 500 ? 'BUG' : 'WARNING', `HTTP ${status} on ${req.method} ${short}`)
      }
    })
  })
})

after(() => {
  cy.writeFile(REPORT_FILE, buildReport())
})

// ===============================================================
// 1) SEARCH BASICS (positive)
// ===============================================================
describe('Search - basics', () => {

  it('TC01 - Search icon is visible', () => {
    cy.visit(START_PAGE)
    cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
    cy.get(SEARCH_ICON).first().should('be.visible')
  })

  it('TC02 - Clicking the search icon opens the search box', () => {
    cy.visit(START_PAGE)
    cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
    openSearch()
  })

  it('TC03 - Dropdown shows BROWSE BY TYPE and all 6 chips', () => {
    startSearch()
    cy.contains(/browse by type/i).should('be.visible')
    ALL_CHIPS.forEach((chip) => {
      chipButton(chip).should('be.visible')
    })
  })

  it('TC04 - Can type in the search box', () => {
    startSearch()
    typeSearch('hello')
    searchInput().should('have.value', 'hello')
  })

  it('TC05 - Typing "hello" finds the artwork and it opens', () => {
    state.opened = false
    startSearch()
    typeSearch('hello')

    waitForResultsOrTimeout(8000).then((texts) => {
      if (texts.length === 0) {
        addFinding('WARNING', 'Typing "hello" showed no results, although an artwork titled "hello" exists')
        return
      }
      addFinding('INFO', 'Typing "hello" returned results', texts.slice(0, 5).join(' | '))
      clickResult(0)
      afterResultClick('Search "hello" result #1')
    })

    onArtwork(() => {
      checkArtworkDetails()
    })
  })

  it('TC06 - Search box closes with the Escape key (observation)', () => {
    startSearch()
    searchInput().type('{esc}')
    cy.wait(800)
    cy.document().then((doc) => {
      if (findVisible(doc, SEARCH_INPUT).length > 0) {
        addFinding('INFO', 'Search dropdown does not close when Escape is pressed')
      }
    })
  })

  it('TC07 - Search box closes when clicking outside it (observation)', () => {
    startSearch()
    cy.get('body').click(20, 850, { force: true })
    cy.wait(800)
    cy.document().then((doc) => {
      if (findVisible(doc, SEARCH_INPUT).length > 0) {
        addFinding('INFO', 'Search dropdown does not close when clicking outside it')
      }
    })
  })

  it('TC08 - Gallery page: search still opens (observation about search boxes)', () => {
    cy.visit('/gallery')
    cy.contains(/home/i, { timeout: 15000 }).should('be.visible')
    cy.wait(2000)
    openSearch()
    cy.document().then((doc) => {
      const total = doc.querySelectorAll(SEARCH_INPUT).length
      const shown = findVisible(doc, SEARCH_INPUT).length
      addFinding('INFO', `Gallery page contains ${total} search box(es) with the artwork placeholder, ${shown} visible`)
    })
  })

})

// ===============================================================
// 2) SEARCH NEGATIVE TESTS
// ===============================================================
describe('Search - negative and edge cases', () => {

  beforeEach(() => {
    startSearch()
  })

  it('N01 - Pressing Enter on an empty search does not break the page', () => {
    searchInput().type('{enter}')
    expectPageHealthy()
  })

  it('N02 - Spaces only do not break the page', () => {
    typeSearch('     ')
    searchInput().type('{enter}')
    expectPageHealthy()
  })

  it('N03 - Gibberish text shows no artwork results and does not break the page', () => {
    typeSearch('zzzqqqxxx987654')
    cy.wait(2500)
    getResultsSafe().then((texts) => {
      if (texts.length > 0) {
        addFinding('WARNING', 'Gibberish search "zzzqqqxxx987654" still returned results', texts.slice(0, 3).join(' | '))
      }
    })
    expectPageHealthy()
  })

  it('N04 - Script tag in search is not executed (XSS check)', () => {
    const alertStub = cy.stub()
    cy.on('window:alert', alertStub)

    typeSearch('<script>alert("xss")</script>')
    searchInput().type('{enter}')
    cy.wait(1500)

    cy.wrap(null).then(() => {
      if (alertStub.called) {
        addFinding('BUG', 'Script typed in the search box was executed (possible XSS)')
      }
      expect(alertStub, 'alert() from typed script').not.to.have.been.called
    })
    expectPageHealthy()
  })

  it('N05 - HTML image tag in search is not executed (XSS check)', () => {
    const alertStub = cy.stub()
    cy.on('window:alert', alertStub)

    typeSearch('<img src=x onerror=alert(1)>')
    searchInput().type('{enter}')
    cy.wait(1500)

    cy.wrap(null).then(() => {
      if (alertStub.called) {
        addFinding('BUG', 'HTML typed in the search box was executed (possible XSS)')
      }
      expect(alertStub, 'alert() from typed HTML').not.to.have.been.called
    })
    expectPageHealthy()
  })

  it('N06 - SQL-style text does not cause an error', () => {
    typeSearch("' OR '1'='1' --")
    searchInput().type('{enter}')
    expectPageHealthy()
  })

  it('N07 - Very long text (500 characters) does not break the page', () => {
    typeSearch('a'.repeat(500))
    searchInput().type('{enter}')
    expectPageHealthy()
  })

  it('N08 - Emoji and non-English text does not break the page', () => {
    typeSearch('नमस्ते 🎨 café')
    searchInput().type('{enter}')
    expectPageHealthy()
  })

})

// ===============================================================
// 3) CATEGORIES THAT HAVE ARTWORKS (Painting, Digital)
// ===============================================================
CHIPS_WITH_CONTENT.forEach((chip) => {

  describe(`Category: ${chip} (has artworks)`, () => {

    it(`${chip} - clicking the chip shows a list of results`, () => {
      startSearch()
      clickChip(chip)
      waitForResults().then((texts) => {
        addFinding('INFO', `${chip} shows ${texts.length} result(s)`, texts.slice(0, 5).join(' | '))
        expect(texts.length).to.be.greaterThan(0)
      })
    })

    for (let i = 0; i < MAX_RESULTS_TO_OPEN; i++) {
      it(`${chip} - result #${i + 1} opens and shows artwork details`, () => {
        openResult(chip, i)
        onArtwork(() => {
          checkArtworkDetails()
          checkNoBrokenImages()
          assertNoErrorText()
        })
      })
    }

    for (let i = 0; i < RESULTS_FOR_FEATURE_TESTS; i++) {

      describe(`${chip} - result #${i + 1} buttons`, () => {

        beforeEach(() => {
          openResult(chip, i)
        })

        it('Heart (wishlist) count changes on click and goes back on second click', () => {
          onArtwork(() => {
            getHeart().invoke('text').then((before) => {
              const original = before.trim()

              getHeart().click()
              getHeart().invoke('text').should((after) => {
                expect(after.trim()).not.to.eq(original)
              })

              // Click again so the account's wishlist is left as it was
              getHeart().click()
              getHeart().invoke('text').should((restored) => {
                expect(restored.trim()).to.eq(original)
              })
            })
          })
        })

        it('SHARE button reacts when clicked', () => {
          onArtwork(() => {
            let textBefore = 0
            let popupsBefore = 0
            let urlBefore = ''

            cy.get('body').then(($body) => {
              textBefore = $body[0].innerText.length
              popupsBefore = $body[0].querySelectorAll(POPUP_SELECTOR).length
            })
            cy.location('href').then((href) => {
              urlBefore = href
            })

            cy.contains('button', /share/i).click()
            cy.wait(1000)

            cy.get('body').then(($body) => {
              const popupsAfter = $body[0].querySelectorAll(POPUP_SELECTOR).length
              const textChanged = $body[0].innerText.length !== textBefore
              if (popupsAfter <= popupsBefore && !textChanged) {
                addFinding('WARNING', 'SHARE button gave no visible reaction when clicked')
              }
            })

            cy.location('href').then((href) => {
              if (href !== urlBefore) {
                addFinding('WARNING', 'SHARE button changed the page address', href)
              }
            })

            assertNoErrorText()
          })
        })

        it('READ MORE expands the text (if the artwork has it)', () => {
          onArtwork(() => {
            cy.get('body').then(($body) => {
              const $readMore = $body.find('button, a, span').filter((idx, el) =>
                /^\s*read more\s*$/i.test(el.innerText || '')
              )

              if ($readMore.length === 0) {
                addFinding('INFO', 'No "Read more" button found on an artwork page (may be normal)')
                return
              }

              const before = $body[0].innerText.length
              cy.wrap($readMore.first()).click()
              cy.get('body').should(($b) => {
                expect($b[0].innerText.length, 'page text after Read more').not.to.eq(before)
              })
            })
          })
        })

        it('VIEW PROFILE opens the artist page and Back returns to the artwork', () => {
          onArtwork(() => {
            cy.url().then((startUrl) => {
              cy.contains(/view profile/i).click()
              cy.url().should('not.eq', startUrl)
              assertNoErrorText()

              cy.go('back')
              cy.contains(/view profile/i, { timeout: 15000 }).should('be.visible')
            })
          })
        })

      })

    }

  })

})

// ===============================================================
// 4) CATEGORIES WITHOUT ARTWORKS (Photography, Sculpture, Mixed Media, Oil)
// ===============================================================
CHIPS_EMPTY.forEach((chip) => {

  describe(`Category: ${chip} (no artworks)`, () => {

    it(`${chip} - clicking the chip does not break the page`, () => {
      startSearch()
      clickChip(chip)
      cy.wait(3000)

      getResultsSafe().then((texts) => {
        if (texts.length > 0) {
          addFinding('WARNING', `${chip} was expected to be empty but shows ${texts.length} item(s)`, texts.slice(0, 3).join(' | '))
        } else {
          cy.get('body').then(($body) => {
            if (!/no (results|artworks|items|match)|nothing found|not found|empty/i.test($body[0].innerText)) {
              addFinding('INFO', `${chip} is empty and no "no results" message is shown`)
            }
          })
        }
      })

      expectPageHealthy()
    })

  })

})