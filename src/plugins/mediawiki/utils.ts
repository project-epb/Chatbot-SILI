import { MediaWikiApi } from 'mediawiki-api-axios'

const MOCK_HEADER = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36 Edg/92.0.902.78',
}
const USE_MOCK_HEADER = ['huijiwiki.com']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useApi(baseURL: string): MediaWikiApi {
  const api = new MediaWikiApi(baseURL)
  if (USE_MOCK_HEADER.some((sub) => baseURL.includes(sub))) {
    api.defaultOptions = { headers: MOCK_HEADER }
  }
  return api
}

export function getWikiTitleDBKey(raw: string): string {
  const title = raw
    .replace(/[\s_]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
  return title[0].toUpperCase() + title.slice(1)
}
export function getWikiDisplayTitle(raw: string) {
  const title = raw.replace(/[\s_]+/g, ' ').trim()
  return title[0].toUpperCase() + title.slice(1)
}
export function parseTitlesFromText(str: string) {
  str = resolveBrackets(str)
  const reg = /\[\[(.+?)\]\]/g
  return Array.from(
    new Set(
      Array.from(str.matchAll(reg))
        .map((i) => i[1].split('|')[0])
        .map(getWikiTitleDBKey)
    )
  ).filter((i) => !!i)
}

export function getUrl(base: string, params = {}, script = 'index'): string {
  const query = Object.keys(params).length
    ? '?' + new URLSearchParams(params)
    : ''
  return `${base.replace(
    '/api.php',
    `/${script ? script.trim() : 'index'}.php`
  )}${query}`
}

export function isValidApi(api: string | URL): boolean {
  let url: URL
  try {
    url = new URL(api)
  } catch (err) {
    return false
  }
  const { protocol, pathname } = url
  if (protocol.startsWith('http') && pathname.endsWith('/api.php')) {
    return true
  }
  return false
}

export function resolveBrackets(str: string): string {
  return str
    .replace(new RegExp('&#91;', 'g'), '[')
    .replace(new RegExp('&#93;', 'g'), ']')
}
