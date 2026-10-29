import { useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@shared/i18n'
import type { Frame } from '@shared/types'
import type { ExportPreview } from '@shared/workspace'
import { buildExportInputs, ensureStill } from '../lib/frameOps'
import { useStore } from '../store'
import { ExportPreviewDialog } from './ExportPreview'

export function FrameContext({ frame, point, onClose }: { frame: Frame; point: {x:number;y:number}; onClose():void }): JSX.Element {
  const [preview,setPreview]=useState<ExportPreview | null>(null)
  const [busy,setBusy]=useState(false)
  const exportImage=async (format:'png'|'jpg'):Promise<void> => {
    const state=useStore.getState()
    if(!state.projectFolder || !state.doc) return
    setBusy(true)
    try { setPreview(await window.sbr.preparePreview({frames:{projectName:state.doc.name,exportsRoot:`${state.projectFolder}/exports`,frames:await buildExportInputs([frame])},format})) }
    catch(error) {state.toast(String(error),'error');onClose()} finally {setBusy(false)}
  }
  if(preview) return <ExportPreviewDialog preview={preview} onClose={onClose} />
  const top=Math.max(8,Math.min(point.y,window.innerHeight-250))
  return createPortal(<div className="context-shield" onClick={onClose} onContextMenu={(e) => {e.preventDefault();onClose()}} onKeyDown={(e) => {if(e.key==='Escape') onClose()}}><div className="floating-menu media-context" role="menu" style={{left:Math.max(8,Math.min(point.x,window.innerWidth-260)),top,maxHeight:window.innerHeight-top-8}} onClick={(e) => e.stopPropagation()}>
    <button autoFocus disabled={busy} onClick={() => void exportImage('png')}>{t('Export PNG')}</button>
    <button disabled={busy} onClick={() => void exportImage('jpg')}>{t('Export JPG')}</button>
    <button disabled={busy} onClick={async () => {try {const folder=useStore.getState().projectFolder;const path=await ensureStill(frame.id,frame);if(folder && path) {const data=await window.sbr.readProjectFile(folder,path);await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([data],{type:'image/png'})})])}} catch(error) {useStore.getState().toast(String(error),'error')} onClose()}}>{t('Copy image')}</button>
    <button onClick={() => {useStore.getState().selectFrame(frame.id);onClose()}}>{t('Edit still')}</button>
    <button onClick={() => {window.dispatchEvent(new CustomEvent('libtv-upload',{detail:{frameIds:[frame.id]}}));onClose()}}>{t('Upload to LibTV')}</button>
  </div></div>,document.body)
}
