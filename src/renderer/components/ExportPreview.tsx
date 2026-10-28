import { lazy, Suspense, useEffect, useState } from 'react'
import type { ExportPreview as Preview } from '@shared/workspace'
import { t } from '@shared/i18n'
import { Dialog } from './Controls'
import { useStore } from '../store'

const PdfPreview = lazy(() =>
  import('./PdfPreview').then((module) => ({ default: module.PdfPreview }))
)

function parseCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index++
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  row.push(cell)
  rows.push(row)
  return rows
}
export function ExportPreviewDialog({
  preview,
  onClose
}: {
  preview: Preview
  onClose(): void
}): JSX.Element {
  const [pdfReady, setPdfReady] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    const resources = (preview.images ?? []).map((image) =>
      URL.createObjectURL(
        new Blob([new Uint8Array(image.bytes)], {
          type: preview.kind === 'jpg' ? 'image/jpeg' : 'image/png'
        })
      )
    )
    setUrls(resources)
    return () => {
      resources.forEach((url) => URL.revokeObjectURL(url))
      void window.sbr.cancelPreview(preview.id)
    }
  }, [preview])
  return (
    <Dialog
      title={t('Export preview')}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="export-preview-body">
        {preview.pdf && (
          <Suspense fallback={<div className="preview-loading">{t('Preparing page…')}</div>}>
            <PdfPreview bytes={preview.pdf} onReady={() => setPdfReady(true)} />
          </Suspense>
        )}
        {preview.kind === 'csv' && (
          <div className="csv-preview">
            <table>
              <tbody>
                {parseCsv(preview.rows ?? '').map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) =>
                      index === 0 ? (
                        <th key={cellIndex}>{cell}</th>
                      ) : (
                        <td key={cellIndex}>{cell}</td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview.images && (
          <>
            <div className="frame-preview-stage">
              {urls[selected] && <img src={urls[selected]} alt={preview.files[selected]} />}
              <span>{preview.files[selected]}</span>
            </div>
            <div className="export-contact-sheet">
              {urls.map((url, index) => (
                <button
                  className={selected === index ? 'selected' : ''}
                  key={url}
                  onClick={() => setSelected(index)}
                >
                  <img src={url} alt="" />
                  <span>{preview.files[index]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={onClose}>
          {t('Cancel')}
        </button>
        <button
          className="btn primary"
          disabled={
            busy || (preview.kind === 'pdf' ? !pdfReady : !urls.length && preview.kind !== 'csv')
          }
          onClick={async () => {
            setBusy(true)
            try {
              const path = await window.sbr.confirmPreview(preview.id)
              if (path) {
                useStore.getState().toast(t('Export complete.'), 'success')
                onClose()
              }
            } catch (reason) {
              setError(String(reason))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t(busy ? 'Exporting…' : 'Confirm export')}
        </button>
      </div>
    </Dialog>
  )
}
