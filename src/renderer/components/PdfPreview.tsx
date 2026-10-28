import { useEffect, useRef, useState } from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { t } from '@shared/i18n'

GlobalWorkerOptions.workerSrc = workerUrl

function PdfCanvas({
  document: pdf,
  page,
  zoom = 1,
  thumbnail = false,
  onReady
}: {
  document: PDFDocumentProxy
  page: number
  zoom?: number
  thumbnail?: boolean
  onReady?(): void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(!thumbnail)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = host.current!
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    const visibility = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setVisible(true)
    })
    if (thumbnail) visibility.observe(element)
    return () => {
      observer.disconnect()
      visibility.disconnect()
    }
  }, [thumbnail])
  useEffect(() => {
    if (!visible || !width) return
    let alive = true
    let task: RenderTask | undefined
    const element = host.current!
    element.dataset.ready = 'false'
    void pdf
      .getPage(page)
      .then(async (source) => {
        if (!alive) return
        const original = source.getViewport({ scale: 1 })
        const scale = Math.max(0.05, (width - (thumbnail ? 0 : 48)) / original.width) * zoom
        const viewport = source.getViewport({ scale })
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width * ratio)
        canvas.height = Math.ceil(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', t('Page {page}', { page }))
        task = source.render({
          canvasContext: canvas.getContext('2d')!,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0]
        })
        await task.promise
        if (!alive) return
        element.replaceChildren(canvas)
        element.dataset.ready = 'true'
        setError('')
        onReady?.()
      })
      .catch((reason) => {
        if (alive && reason?.name !== 'RenderingCancelledException') setError(String(reason))
      })
    return () => {
      alive = false
      task?.cancel()
    }
  }, [pdf, page, width, zoom, visible, thumbnail, onReady])
  return (
    <div className={thumbnail ? 'pdf-thumbnail-canvas' : 'pdf-page-canvas'} ref={host}>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

export function PdfPreview({
  bytes,
  onReady
}: {
  bytes: Uint8Array
  onReady(): void
}): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  const [painted, setPainted] = useState(false)
  const ready = useRef(onReady)
  ready.current = onReady
  useEffect(() => {
    let alive = true
    const task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true
    })
    void task.promise
      .then((document) => {
        if (alive) setPdf(document)
      })
      .catch((reason) => {
        if (alive) setError(String(reason))
      })
    return () => {
      alive = false
      void task.destroy()
    }
  }, [bytes])
  const notify = useRef(() => {
    setPainted(true)
    ready.current()
  }).current
  return (
    <div className="pdf-preview">
      <div className="pdf-preview-toolbar">
        <span className="eyebrow">FRAMEBOOK / {t('Page preview')}</span>
        <div className="spacer" />
        <button
          className="icon-button"
          aria-label={t('Previous page')}
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ←
        </button>
        <span className="pdf-page-counter">
          {page} / {pdf?.numPages ?? '—'}
        </span>
        <button
          className="icon-button"
          aria-label={t('Next page')}
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage(page + 1)}
        >
          →
        </button>
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          aria-label={t('Zoom out')}
          disabled={zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          −
        </button>
        <button className="text-button" onClick={() => setZoom(1)}>
          {zoom === 1 ? t('Fit width') : `${Math.round(zoom * 100)}%`}
        </button>
        <button
          className="icon-button"
          aria-label={t('Zoom in')}
          disabled={zoom >= 2}
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
        >
          ＋
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : pdf ? (
        <div className="pdf-preview-layout">
          <aside className="pdf-page-list" aria-label={t('Pages')}>
            {Array.from({ length: pdf.numPages }, (_, index) => (
              <button
                key={index}
                className={page === index + 1 ? 'active' : ''}
                aria-label={t('Page {page}', { page: index + 1 })}
                aria-current={page === index + 1 ? 'page' : undefined}
                onClick={() => setPage(index + 1)}
              >
                <PdfCanvas document={pdf} page={index + 1} thumbnail />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </aside>
          <div className="pdf-page-stage" key={page}>
            {!painted && <span className="preview-loading">{t('Preparing page…')}</span>}
            <PdfCanvas document={pdf} page={page} zoom={zoom} onReady={notify} />
          </div>
        </div>
      ) : (
        <div className="preview-loading">{t('Preparing page…')}</div>
      )}
    </div>
  )
}
