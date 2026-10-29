export function paginateStoryboard(pageHeight: number): void {
  const source = document.querySelector('table')!
  const heading = document.querySelector('header')!
  const rows = Array.from(source.tBodies[0]!.rows)
  const body = document.createElement('main')
  let activeGroup: HTMLTableRowElement | null = null
  const makePage = (
    first: boolean
  ): { page: HTMLElement; table: HTMLTableElement; tbody: HTMLTableSectionElement } => {
    const page = document.createElement('article')
    page.className = 'print-page'
    page.style.height = `${pageHeight}px`
    if (first) page.append(heading.cloneNode(true))
    const table = source.cloneNode(false) as HTMLTableElement
    for (const child of Array.from(source.children))
      if (child.tagName !== 'TBODY') table.append(child.cloneNode(true))
    const tbody = document.createElement('tbody')
    if (!first && activeGroup) tbody.append(activeGroup.cloneNode(true))
    table.append(tbody)
    page.append(table)
    body.append(page)
    return { page, table, tbody }
  }
  document.body.replaceChildren(body)
  let current = makePage(true)
  const fits = (): boolean =>
    current.table.getBoundingClientRect().bottom <=
    current.page.getBoundingClientRect().top + pageHeight - 24
  for (const original of rows) {
    if (original.classList.contains('group-heading')) {
      const header = original.cloneNode(true) as HTMLTableRowElement
      current.tbody.append(header)
      if (
        !fits() ||
        current.page.getBoundingClientRect().top +
          pageHeight -
          current.table.getBoundingClientRect().bottom <
          70
      ) {
        header.remove()
        activeGroup = null
        current = makePage(false)
        current.tbody.append(header)
      }
      activeGroup = header
      continue
    }
    let remaining = Array.from(original.cells).map((cell) => {
      const content = document.createElement('div')
      content.innerHTML = cell.innerHTML
      const pictures = content.querySelector('.pictures')
      if (pictures) content.replaceChildren(...Array.from(pictures.children))
      return content
    })
    if (!remaining.some((cell) => cell.textContent?.length || cell.children.length)) {
      const empty = original.cloneNode(true) as HTMLTableRowElement
      current.tbody.append(empty)
      if (!fits()) {
        empty.remove()
        current = makePage(false)
        current.tbody.append(empty)
      }
      continue
    }
    let continuation = false
    while (remaining.some((cell) => cell.textContent?.length || cell.children.length)) {
      const row = document.createElement('tr')
      for (const cell of remaining) {
        const td = document.createElement('td')
        td.innerHTML = cell.innerHTML
        row.append(td)
      }
      if (continuation) row.className = 'continued-row'
      current.tbody.append(row)
      if (fits()) break
      row.remove()
      const hadRows = Array.from(current.tbody.rows).some(
        (row) => !row.classList.contains('group-heading')
      )
      const fragment = document.createElement('tr')
      const next: HTMLDivElement[] = []
      for (const cell of remaining) {
        const td = document.createElement('td')
        fragment.append(td)
        const rest = cell.cloneNode(true) as HTMLDivElement
        next.push(rest)
      }
      if (continuation) fragment.className = 'continued-row'
      current.tbody.append(fragment)
      let progress = false
      for (let index = 0; index < remaining.length; index++) {
        const rest = next[index]!
        const td = fragment.cells[index]!
        while (rest.firstChild) {
          const node = rest.firstChild
          td.append(node)
          if (fits()) {
            progress = true
            continue
          }
          td.removeChild(node)
          rest.prepend(node)
          if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent
            let low = 0
            let high = text.length
            const prefix = document.createTextNode('')
            td.append(prefix)
            while (low < high) {
              const mid = Math.ceil((low + high) / 2)
              prefix.textContent = text.slice(0, mid)
              if (fits()) low = mid
              else high = mid - 1
            }
            const boundary = text.lastIndexOf(' ', low)
            if (boundary > 0) low = boundary + 1
            prefix.textContent = text.slice(0, low)
            node.textContent = text.slice(low)
            if (low > 0) progress = true
          }
          break
        }
      }
      if (!progress) {
        fragment.remove()
        if (!hadRows)
          throw new Error(
            'The selected columns cannot fit on this page. Reduce columns or use landscape.'
          )
        current = makePage(false)
        continue
      }
      if (continuation) fragment.className = 'continued-row'
      remaining = next
      continuation = true
      if (remaining.some((cell) => cell.textContent?.length || cell.children.length))
        current = makePage(false)
    }
  }
}
