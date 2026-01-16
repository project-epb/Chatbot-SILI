import type { CookieJarItem } from 'fexios/plugins'
import { MediaWikiApi } from 'wiki-saikou/node'

const MOCK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'

const COOKIE_STORE = new Map<string, CookieJarItem[]>()

export async function useApi(baseURL: string): Promise<MediaWikiApi> {
  const USE_MOCK_HEADER = [
    {
      match: (url: string) => url.includes('huijiwiki.com'),
      headers: {
        'User-Agent': MOCK_UA,
      },
    },
    {
      match: (url: string) => url.includes('ngnl.wiki'),
      headers: {
        'User-Agent': MOCK_UA,
      },
    },
    {
      match: (url: string) => url.includes('.moegirl.org.cn'),
      headers: {
        'User-Agent': process.env.TOKEN_MOEGIRL_USER_AGENT,
      },
    },
  ]
  const USE_AUTHORIZATION: {
    match: (url: string) => boolean
    username: string
    password: string
  }[] = [
    {
      match: (url: string) => url.includes('.moegirl.org.cn'),
      username: process.env.MW_BOTPASSWORD_MOEGIRL_USERNAME,
      password: process.env.MW_BOTPASSWORD_MOEGIRL_PASSWORD,
    },
  ]

  const api = new MediaWikiApi({ baseURL })

  const mockHeaders = USE_MOCK_HEADER.find((i) => i.match(baseURL))
  if (mockHeaders) {
    console.info('[MWAPI]', 'Use mock headers:', baseURL, mockHeaders.headers)
    Object.assign(api.config.fexiosConfigs.headers, mockHeaders.headers)
  }

  const auth = USE_AUTHORIZATION.find((i) => i.match(baseURL))
  if (auth && auth.username && auth.password) {
    console.info('[MWAPI]', 'Authorization:', baseURL, auth.username)
    const cookies = COOKIE_STORE.get(`${baseURL}#${auth.username}`)
    if (cookies) {
      console.info('[MWAPI]', 'By cookies:', baseURL, auth.username)
      const items = COOKIE_STORE.get(`${baseURL}#${auth.username}`)
      if (items) {
        items.forEach((item) => {
          api.request.cookieJar?.setCookie(item)
        })
      }
    } else {
      console.info('[MWAPI]', 'By login:', baseURL, auth.username)
      await api
        .login(auth.username, auth.password)
        .then(() => {
          return api.get<{ query: { userinfo: { id: number } } }>({
            action: 'query',
            meta: 'userinfo',
          })
        })
        .then(({ data }) => {
          if (data.query.userinfo.id > 0) {
            console.info('[MWAPI]', 'Logged in:', baseURL, data.query.userinfo)
            COOKIE_STORE.set(
              `${baseURL}#${auth.username}`,
              api.request.cookieJar?.getCookies()
            )
          }
        })
        .catch((e) => {
          console.error('[MWAPI]', 'Login failed:', baseURL, auth.username, e)
        })
    }
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
