import { t } from '@shared/i18n'
import { create } from 'zustand'
import type { LibTVFile, LibTVJob } from '@shared/libtv'

export interface CanvasTransfer { id: string; projectId: string; files: LibTVFile[]; job?: LibTVJob; error?: string }
export const useTransfers = create<{ transfers: CanvasTransfer[]; put(value: CanvasTransfer): void }>(set => ({
  transfers: [],
  put: value => set(state => ({ transfers: [...state.transfers.filter(item => item.id !== value.id), value].slice(-20) }))
}))
export async function uploadDirect(folder: string, projectId: string, files: LibTVFile[], transferId: string = crypto.randomUUID()): Promise<void> {
  const put = useTransfers.getState().put
  const transfer: CanvasTransfer = { id: transferId, projectId, files }
  put(transfer)
  try {
    const id = await window.sbr.libtvUpload(folder, projectId, files)
    const poll = async (): Promise<void> => {
      try {
        const job = await window.sbr.libtvStatus(id)
        if (!job) throw new Error(t('Upload status unavailable'))
        put({ ...transfer, job })
        if (job.state === 'running') setTimeout(() => void poll(), 600)
        else window.dispatchEvent(new Event('libtv-changed'))
      } catch (error) { put({ ...transfer, error: String(error) }) }
    }
    await poll()
  } catch (error) { put({ ...transfer, error: String(error) }) }
}
