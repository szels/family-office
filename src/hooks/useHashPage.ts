import { useCallback, useEffect, useState } from 'react'

export type Page = 'uebersicht' | 'markt' | 'transaktionen'

const PAGES: readonly Page[] = ['uebersicht', 'markt', 'transaktionen']

export function parsePage(hash: string): Page {
  const candidate = hash.replace(/^#\/?/, '')
  return PAGES.find((page) => page === candidate) ?? 'uebersicht'
}

export function useHashPage(): [Page, (page: Page) => void] {
  const [page, setPageState] = useState<Page>(() => parsePage(window.location.hash))

  useEffect(() => {
    function onHashChange() {
      setPageState(parsePage(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const setPage = useCallback((next: Page) => {
    window.location.hash = `#/${next}`
  }, [])

  return [page, setPage]
}
