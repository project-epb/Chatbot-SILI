import { readFileSync } from 'fs'
import Mint from 'mint-filter'
import { resolve } from 'path'

export function useFilter(): Mint {
  if (globalThis.mintFilter) {
    console.info('[Mint] using cache')
    return globalThis.mintFilter
  }
  const start = Date.now()
  console.info('[Mint] filter build start')
  const text = readFileSync(resolve(__dirname, './badwords.ini')).toString()
  const words = text
    .split('\n')
    .map((i) => i.trim())
    .filter((i) => !!i && !i.startsWith('//') && !i.startsWith('#'))
  globalThis.mintFilter = new Mint(words)
  console.info('[Mint] filter build end', Date.now() - start)
  return globalThis.mintFilter
}
