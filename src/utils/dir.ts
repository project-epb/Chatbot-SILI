import { URL, fileURLToPath } from 'node:url'

/**
 * @example ```ts
 * const __dirname = getDirName(import.meta.url)
 * ```
 */
export const useDirname = (importMetaUrl: string) => {
  return fileURLToPath(new URL('.', importMetaUrl))
}
