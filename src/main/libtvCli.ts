import { app } from 'electron'
import { access, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { spawn, type ChildProcess } from 'child_process'

export async function libtvCommand(args: string[], onSpawn?: (child: ChildProcess) => void): Promise<unknown> {
  const binary = process.env.SBR_SMOKE_DIR && process.env.SBR_LIBTV_BIN ? process.env.SBR_LIBTV_BIN : join(homedir(), '.libtv', 'libtv')
  await access(binary).catch(() => { throw new Error('请先安装 LibTV CLI') })
  const cwd = join(app.getPath('userData'), 'LibTV')
  await mkdir(cwd, { recursive: true })
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env: { ...process.env, LIBTV_DEBUG: '0' } })
    onSpawn?.(child)
    let output = ''
    let error = ''
    child.stdout?.on('data', chunk => { output += String(chunk) })
    child.stderr?.on('data', chunk => { error = (error + String(chunk)).slice(-4000) })
    child.once('error', reject)
    child.once('close', code => {
      if (code !== 0) { reject(new Error(error.replace(/token=[^\s&]+/g, 'token=…') || 'LibTV 操作失败')); return }
      try { resolve(JSON.parse(output.trim())); return } catch {}
      const lines = output.trim().split('\n').filter(Boolean)
      for (const line of lines.reverse()) { try { const value: unknown = JSON.parse(line); if (value && typeof value === 'object') { resolve(value); return } } catch {} }
      if (args[0] === 'login') resolve({ ok: true })
      else reject(new Error('LibTV 返回格式无法识别，请更新 CLI 后重试'))
    })
  })
}
export function libtvObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(libtvObjects)
  if (!value || typeof value !== 'object') return []
  const object = value as Record<string, unknown>
  return [object, ...Object.values(object).filter(item => item && typeof item === 'object').flatMap(libtvObjects)]
}
