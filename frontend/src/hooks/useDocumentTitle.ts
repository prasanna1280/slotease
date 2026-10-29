import { useEffect } from 'react'

const SUFFIX = 'SlotEase'

/** Set `document.title` to "<title> · SlotEase" (or just the product name) while the page is mounted. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title === undefined) return
    const previous = document.title
    document.title = title ? `${title} · ${SUFFIX}` : `${SUFFIX} — Online appointment booking`
    return () => {
      document.title = previous
    }
  }, [title])
}
