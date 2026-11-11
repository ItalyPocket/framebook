const pending = new Map<string, Promise<string>>()
export function absMediaPath(folder: string, sourceFile: string): string {
  const separator = folder.includes('\\') ? '\\' : '/'
  return folder.replace(/[/\\]$/, '') + separator + sourceFile.replace(/[/\\]/g, separator)
}
export async function projectFileUrl(folder: string, relativePath: string, _mime: string): Promise<string> {
  const key = `${folder}::${relativePath}`
  if (pending.has(key)) return pending.get(key)!
  const request = window.sbr.mediaUrl(folder, relativePath).finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}
export function releaseProjectMedia(folder: string): void { pending.clear(); void window.sbr.releaseMedia(folder) }

export function mimeForMedia(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}
