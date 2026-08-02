/**
 * 书 CSS 清理（ruby 重建、特定书修正、图廊清理、vw 修正、垂直居中修正）。
 *
 * 源码对照：old-vue-reader/utils/book-css-clear.js:1-178
 */

const TRIM_REGEXP = /^\s*|\s*$/gu
const WHITESPACE_REGEXP = /\s/u
const CHINESE_CHAR_REGEXP = /[\u4e00-\u9fa5]/u

let supportVw = true

function detectSupportVw(): void {
  if (typeof document === 'undefined') {
    return
  }

  const div = document.createElement('div')
  div.style.width = '1vw'
  document.body.appendChild(div)
  if (window.innerWidth === parseInt(window.getComputedStyle(div, null).width, 10)) {
    supportVw = false
  }
  document.body.removeChild(div)
}

if (typeof document !== 'undefined') {
  detectSupportVw()
}

function trimText(value: string): string {
  return value.replace(TRIM_REGEXP, '')
}

function rebuildRuby(scope: Element): void {
  scope.querySelectorAll('ruby rt').forEach(rt => {
    if ((rt as HTMLElement).dataset.status === 'ed') {
      return
    }

    const ruby = rt.parentElement
    if (!ruby || ruby.tagName !== 'RUBY') {
      return
    }

    const rtStr = trimText(rt.textContent || '')
    if (!WHITESPACE_REGEXP.test(rtStr)) {
      return
    }

    const rtArr = rtStr.split(WHITESPACE_REGEXP)
    rt.innerHTML = ''
    ;(rt as HTMLElement).dataset.status = 'ed'

    const rubyStr = trimText(ruby.textContent || '')
    let html = ''
    let rtIndex = 0

    for (let i = 0; i < rubyStr.length; i += 1) {
      if (CHINESE_CHAR_REGEXP.test(rubyStr.charAt(i))) {
        html += `<ruby>${rubyStr.charAt(i)}<rt class="${rt.className}">${rtArr[rtIndex] || ''}</rt></ruby>`
        rtIndex += 1
      } else {
        html += rubyStr.charAt(i)
      }
    }

    ;(ruby as HTMLElement).style.display = 'none'
    ruby.insertAdjacentHTML('afterend', `<span>${html}</span>`)
  })
}

function applyBookSpecificClear(id: string, scope: Element): void {
  if (id === '10934334') {
    const titles = scope.querySelectorAll('h1.text-title-1')
    if (titles[1] && titles[1].parentElement) {
      ;(titles[1].parentElement as HTMLElement).style.display = 'none'
    }
  }

  if (id === '11638367') {
    scope.querySelectorAll('.video').forEach(video => {
      if (video.parentElement) {
        ;(video.parentElement as HTMLElement).style.boxSizing = 'border-box'
        ;(video.parentElement as HTMLElement).style.padding = '.5em 20px'
      }
      const mainBody = video.closest('.h5_mainbody')
      if (mainBody) {
        ;(mainBody as HTMLElement).style.padding = '0'
        ;(mainBody as HTMLElement).style.height = `${window.innerHeight * 1.2}px`
      }
    })
  }

  if (id === '11534936') {
    scope.querySelectorAll('.background-img-center1').forEach(node => {
      node.removeAttribute('style')
    })
  }

  if (id === '11564057') {
    scope.querySelectorAll('.text-title-1-c1').forEach(node => {
      const table = node.closest('table')
      if (!table) {
        return
      }
      ;(table as HTMLElement).style.minHeight = '0'
      const next = table.nextElementSibling
      if (next && next.classList.contains('h5_rule_hv')) {
        ;(next as HTMLElement).style.top = '0'
        ;(next as HTMLElement).style.transform = 'translate(0, 0)'
      }
    })
  }
}

function clearGalleryNodes(scope: Element): void {
  scope.querySelectorAll('.full-page, .gallery-div').forEach(node => {
    node.classList.remove('full-page', 'gallery-div', 'h5_rule_hv')
    const bgCenter = node.closest('.background-img-center')
    if (bgCenter) {
      ;(bgCenter as HTMLElement).style.height = 'auto'
    }
  })
}

function fixVwBackgrounds(scope: Element): void {
  if (supportVw) {
    return
  }

  scope.querySelectorAll('div.background-img-center[style^="background-image"]').forEach(node => {
    ;(node as HTMLElement).style.height = `${window.innerWidth * 1.778}px`
  })
}

function fixVerticalCentering(scope: Element): void {
  scope.querySelectorAll('.read_rule_vertical .h5_rule_hv').forEach(node => {
    const parent = node.parentElement
    if (!parent) {
      return
    }

    const offsetTop = (node as HTMLElement).offsetTop
    const parentOffsetTop = (parent as HTMLElement).offsetTop
    if (offsetTop < parentOffsetTop || node.querySelector('[gallery="image"]')) {
      ;(node as HTMLElement).style.top = '0'
      ;(node as HTMLElement).style.transform = 'translate(0, 0)'
      return
    }

    const img = node.querySelector('img')
    if (img) {
      img.addEventListener(
        'load',
        () => {
          if ((node as HTMLElement).offsetTop < (parent as HTMLElement).offsetTop) {
            ;(node as HTMLElement).style.top = '0'
            ;(node as HTMLElement).style.transform = 'translate(0, 0)'
          }
        },
        { once: true }
      )
    }
  })
}

/** 书 CSS 清理：特定书修正、图廊清理、vw 背景修正、垂直居中修正、ruby 重建。对齐 Vue book-css-clear.js:162 */
export function applyBookCssClear(bookId: number | string, scope: Element | null): void {
  if (!scope) {
    return
  }

  const id = String(bookId || '')

  if (scope.querySelector('.h5_mainbody_bg, .h5_mainbody')) {
    scope.classList.remove('read_rule_c')
  }

  applyBookSpecificClear(id, scope)
  clearGalleryNodes(scope)
  fixVwBackgrounds(scope)
  fixVerticalCentering(scope)
  rebuildRuby(scope)
}
