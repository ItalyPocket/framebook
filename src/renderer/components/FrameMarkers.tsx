import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { StillImage } from '../panels/StillImage'
import type { Frame } from '@shared/types'

export function FrameMarkers({ mediaId, duration }: { mediaId: string; duration: number }): JSX.Element {
  const frames = useStore((s) => s.doc?.frames)
  const selected = useStore((s) => s.selectedFrameId)
  const root = useRef<HTMLDivElement>(null)
  const [width,setWidth] = useState(400)
  const [popup,setPopup] = useState<{frames:Frame[];x:number;y:number} | null>(null)
  useEffect(() => { const node=root.current; if(!node) return; const observer=new ResizeObserver(() => setWidth(node.offsetWidth));observer.observe(node);return () => observer.disconnect() },[])
  useEffect(() => { if(!popup) return; const close=(e:KeyboardEvent):void => { if(e.key==='Escape') setPopup(null) };window.addEventListener('keydown',close);return () => window.removeEventListener('keydown',close) },[popup])
  const groups: Frame[][]=[]
  for(const frame of [...(frames ?? [])].filter((f) => f.mediaId===mediaId).sort((a,b) => a.timeS-b.timeS)) {
    const last=groups[groups.length-1]
    if(last && (frame.timeS-last[0]!.timeS)/Math.max(duration,1)*width<14) last.push(frame)
    else groups.push([frame])
  }
  const seek=(frame:Frame):void => { useStore.setState({seekTime:frame.timeS,selectedFrameId:frame.id});setPopup(null) }
  return <div className="frame-markers" ref={root}>{groups.map((group) => <button key={group[0]!.id} className={`capture-marker ${group.some((f) => f.id===selected)?'selected':''}`} style={{left:`${Math.min(100,Math.max(0,group[0]!.timeS/Math.max(duration,1)*100))}%`}} title={`${group.length>1?group.length+' · ':''}${group[0]!.timeS.toFixed(2)}s`} onMouseDown={(e) => e.stopPropagation()} onMouseEnter={(e) => {const rect=e.currentTarget.getBoundingClientRect();setPopup({frames:group,x:Math.max(8,Math.min(rect.left,window.innerWidth-260)),y:Math.max(8,rect.top-220)})}} onFocus={(e) => {const rect=e.currentTarget.getBoundingClientRect();setPopup({frames:group,x:Math.max(8,Math.min(rect.left,window.innerWidth-260)),y:Math.max(8,rect.top-220)})}} onClick={(e) => {e.stopPropagation();if(group.length===1) seek(group[0]!);else {const rect=e.currentTarget.getBoundingClientRect();setPopup({frames:group,x:Math.max(8,Math.min(rect.left,window.innerWidth-260)),y:Math.max(8,rect.top-220)})}}}>{group.length>1?group.length:''}</button>)}{popup && createPortal(<div className="marker-popup" style={{left:popup.x,top:popup.y}} onMouseLeave={() => setPopup(null)}><button className="text-button" onClick={() => setPopup(null)}>×</button>{popup.frames.filter((f) => frames?.some((current) => current.id===f.id)).map((frame) => <button key={frame.id} onClick={() => seek(frame)}><StillImage frame={frame} /><span>{String((frames?.findIndex((f) => f.id===frame.id) ?? 0)+1).padStart(3,'0')} · {frame.label} · {frame.timeS.toFixed(2)}s</span></button>)}</div>,document.body)}</div>
}
