let running = 0
const waiting: (() => void)[] = []
export async function mediaWork<T>(operation: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve))
  else running++
  try { return await operation() } finally { const next = waiting.shift(); if (next) next(); else running-- }
}
