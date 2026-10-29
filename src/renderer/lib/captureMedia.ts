import { useStore } from '../store'
import { ensureStill } from './frameOps'

const pending = new Map<string,Promise<void>>()
export function ensureCapture(frameId:string):Promise<void> {
  const state=useStore.getState()
  const folder=state.projectFolder
  if(!folder) return Promise.resolve()
  const key=`${folder}:${frameId}`
  const existing=pending.get(key)
  if(existing) return existing
  const task=(async () => {
    const relative=`media/captures/${frameId}.png`
    try {await window.sbr.readProjectFile(folder,relative);return} catch { }
    const frame=state.frame(frameId)
    if(!frame) return
    const path=await ensureStill(frameId,frame)
    if(!path) throw new Error('Could not extract the frame image.')
    await window.sbr.materializeCapture(folder,frameId,path)
  })().finally(() => pending.delete(key))
  pending.set(key,task)
  return task
}
