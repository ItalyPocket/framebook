import { app, safeStorage } from 'electron'
import { readFile, writeFile, rm } from 'fs/promises'
import { join } from 'path'

const keyPath = (): string => join(app.getPath('userData'), 'draft-cloud.key')
export async function cloudKey(): Promise<string> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，无法读取云端密钥。')
  try { return safeStorage.decryptString(await readFile(keyPath())) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw new Error('无法读取云端密钥，请重新设置。')
  }
}
export async function saveCloudKey(value: string): Promise<void> {
  if (!value.trim()) { await rm(keyPath(), { force: true }); return }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，无法保存云端密钥。')
  await writeFile(keyPath(), safeStorage.encryptString(value.trim()), { mode: 0o600 })
}
export async function decryptDraft(content: Buffer): Promise<Record<string, any>> {
  const key = await cloudKey()
  if (!key) throw new Error('请先设置云端转换密钥。')
  const form = new FormData()
  form.append('jsonFile', new Blob([new Uint8Array(content)], { type: 'application/json' }), 'draft_content.json')
  let response: Response
  try {
    response = await fetch('https://htwmedia.dpdns.org/Home/DecryptDraft', {
      method: 'POST', headers: { AuthKey: key }, body: form, redirect: 'error', signal: AbortSignal.timeout(90000)
    })
  } catch { throw new Error('云端连接失败或超时，请检查网络后重试。') }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '云端密钥无效或已过期，请重新设置。' : `云端转换失败（${response.status}），请稍后重试。`)
  const text = await response.text()
  if (Buffer.byteLength(text) > 64 * 1024 * 1024) throw new Error('云端返回内容超过大小限制。')
  let data
  try {
    const result = JSON.parse(text)
    if (result.success !== true) throw new Error()
    data = typeof result.draft_content === 'string' ? JSON.parse(result.draft_content) : result.draft_content
  } catch { throw new Error('云端未返回有效草稿，请检查密钥和草稿版本。') }
  if (!data || !Array.isArray(data.tracks) || !data.materials) throw new Error('云端返回内容不包含有效时间线。')
  return data
}
