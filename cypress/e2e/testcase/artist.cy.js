/// <reference types="cypress" />

// ===============================================================
// SETTINGS
// ===============================================================
const START_PAGE = '/'
const SEARCH_ICON = '[aria-label*="search" i], button[title*="search" i]'
const SEARCH_INPUT = 'input[placeholder*="Search artworks"]'
const CHIP_TO_TEST = 'Painting'

const REPORT_FILE = 'cypress/reports/artist-profile-report.md'
const ERROR_TEXT = /internal server error|application error|unhandled runtime error|\[object object\]|typeerror|referenceerror|stack trace|page not found|404/i

// ===============================================================
// JIRA-STYLE BUG REPORT COLLECTOR
// ===============================================================
const findings = []
const addFinding = (severity, summary, detail = '') => {
  if (!findings.some((f) => f.summary === summary)) findings.push({ severity, summary, detail })
}
const buildReport = () => {
  const order = ['Critical', 'Major', 'Minor', 'Info']
  let out = `# Artist profile test report\n\nGenerated: ${new Date().toISOString()}\n\n`
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
// PURE HELPERS
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

// Every visible clickable element on the page outside header/nav
const getPageActions = (doc) =>
  Array.from(doc.querySelectorAll('button, a[href], [role="button"]'))
    .filter((el) => !el.closest('header, nav'))
    .filter(isShown)
    .map((el) => ({ el, text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text.length > 0)

// Count of thumbnail-sized images on the page (used to spot an artist's artwork grid)
const countThumbnailImages = (doc) =>
  Array.from(doc.querySelectorAll('img'))
    .filter(isShown)
    .filter((img) => {
      const r = img.getBoundingClientRect()
      return r.width >= 60 && r.height >= 60
    }).length

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

const assertNoErrorText = () => {
  cy.get('body').should(($body) => {
    expect($body[0].innerText).not.to.match(ERROR_TEXT)
  })
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
// ARTIST PROFILE, opened from an artwork
// ===============================================================
describe('Artist profile - opened from an artwork', () => {

  it('VIEW PROFILE opens the correct artist and the page works', () => {
    openSearchAndPickFirstResult()

    // Read the artist's name as shown on the artwork page, before leaving it
    cy.get('body').then(($body) => {
      const btn = $body.find('button, a').filter((i, el) => /^\s*view profile\s*$/i.test(el.innerText || '')).first()
      const row = btn[0] && btn[0].closest('div') ? btn[0].closest('div').parentElement : null
      const nameArea = row ? row.innerText.replace(/\s+/g, ' ').trim() : ''
      cy.wrap(nameArea).as('artworkPageArtistArea')
    })

    cy.url().then((artworkUrl) => {
      cy.contains(/view profile/i).click()
      cy.url().should('not.eq', artworkUrl)
      assertNoErrorText()

      cy.wait(1500)

      // 1) The page is not a dead/blank/error page
      cy.get('body').should(($body) => {
        expect($body[0].innerText.trim().length, 'artist profile page has visible content').to.be.greaterThan(20)
      })

      // 2) The artist's name from the artwork page also appears on the profile page
      cy.get('@artworkPageArtistArea').then((areaText) => {
        const words = areaText.split(' ').filter((w) => w.length > 2 && !/^view$|^profile$/i.test(w))
        if (words.length === 0) {
          addFinding('Info', 'Could not read the artist name from the artwork page to compare against the profile page')
        } else {
          cy.get('body').then(($body) => {
            const profileText = $body[0].innerText
            const matched = words.some((w) => profileText.includes(w))
            if (!matched) {
              addFinding('Major', 'The artist profile page does not show the same artist name seen on the artwork page', `Expected one of: ${words.join(', ')}`)
            } else {
              addFinding('Info', 'The artist profile page correctly shows the artist from the artwork page')
            }
          })
        }
      })

      // 3) Does the profile page show a grid/list of the artist's other artworks?
      cy.document().then((doc) => {
        const thumbCount = countThumbnailImages(doc)
        if (thumbCount === 0) {
          addFinding('Minor', 'The artist profile page shows no artwork thumbnails', 'Expected to see the artist\'s other artworks listed on their profile.')
        } else {
          addFinding('Info', `The artist profile page shows ${thumbCount} artwork thumbnail(s)`)
        }
      })

      // 4) Broken images on the profile page
      cy.get('img:visible').then(($imgs) => {
        const broken = Array.from($imgs).filter((img) => img.complete && img.naturalWidth === 0)
        if (broken.length > 0) {
          addFinding('Minor', 'Broken image(s) found on the artist profile page', broken.map((i) => i.getAttribute('src')).slice(0, 3).join(' | '))
        }
      })

      // 5) List every clickable action on the profile page and flag anything unrecognized,
      //    so nothing on this page is silently skipped
      cy.document().then((doc) => {
        const actions = getPageActions(doc)
        addFinding('Info', `Found ${actions.length} clickable action(s) on the artist profile page`, actions.map((a) => a.text).join(' | '))

        const KNOWN = [/^\s*follow\s*$/i, /^\s*message\s*$/i, /^\s*share\s*$/i, /^\s*contact\s*$/i, /^\s*back\s*$/i]
        actions.forEach((a) => {
          if (!KNOWN.some((re) => re.test(a.text))) {
            addFinding('Info', `Untested button/link found on the artist profile page: "${a.text}"`, 'Not covered by an automated check yet.')
          }
        })
      })

      assertNoErrorText()

      // Return to the artwork page to leave things as they were
      cy.visit(artworkUrl)
      cy.contains(/view profile/i, { timeout: 15000 }).should('be.visible')
    })
  })

  it('Clicking one of the artist\'s own artworks (if shown) opens that artwork correctly', () => {
    openSearchAndPickFirstResult()

    cy.url().then((artworkUrl) => {
      cy.contains(/view profile/i).click()
      cy.url().should('not.eq', artworkUrl)
      cy.wait(1500)

      cy.document().then((doc) => {
        const all = Array.from(doc.querySelectorAll('img'))
          .filter(isShown)
          .filter((img) => {
            const r = img.getBoundingClientRect()
            return r.width >= 60 && r.height >= 60
          })

        // A single round avatar photo is also >=60px, so it would be picked by size alone.
        // A real artwork grid has several tiles that repeat at (roughly) the same size, so
        // group by rounded size and only use a group that appears more than once.
        const groups = {}
        all.forEach((img) => {
          const r = img.getBoundingClientRect()
          const key = `${Math.round(r.width / 10) * 10}x${Math.round(r.height / 10) * 10}`
          groups[key] = groups[key] || []
          groups[key].push(img)
        })
        const gridGroup = Object.values(groups).sort((a, b) => b.length - a.length)[0]
        const thumbs = gridGroup && gridGroup.length > 1 ? gridGroup : []

        if (thumbs.length === 0) {
          addFinding('Info', 'Could not confidently find an artwork grid on the artist profile page to click (may be a single avatar photo only, or a different layout)')
          return
        }

        cy.wrap(Cypress.$(thumbs[0])).scrollIntoView().click({ force: true })
        cy.wait(2000)

        cy.get('body').then(($body) => {
          const ok = /view profile/i.test($body[0].innerText)
          if (!ok) {
            addFinding('Major', 'Clicking an artwork thumbnail on the artist profile page did not open a normal artwork page', `Started from: ${artworkUrl}`)
          } else {
            addFinding('Info', 'Clicking an artwork thumbnail on the artist profile page correctly opened that artwork')
          }
        })

        assertNoErrorText()
      })
    })
  })

})