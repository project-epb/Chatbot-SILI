import { URL, fileURLToPath } from 'node:url'

/**
 * @example ```ts
 * const __dirname = useDirname(import.meta.url)
 * ```
 */
export const useDirname = (importMetaUrl: string) => {
  return fileURLToPath(new URL('.', importMetaUrl))
}
