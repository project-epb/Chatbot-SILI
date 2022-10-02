/**
 * @example Extend your sites
 * ```ts
 * PluginMediawiki.prototype.INFOBOX_MAP.push({
 *   match: (url: URL) => {},
 *   cssClasses: '',
 * })
 * ```
 */
export const INFOBOX_MAP: {
  match: (url: URL) => boolean
  cssClasses: string
  siteName?: string
}[] = [
  {
    siteName: '萌娘百科',
    match: (url) => url.host.endsWith('moegirl.org.cn'),
    cssClasses: [
      // 标准信息框
      '.mw-parser-output .infotemplatebox',
      // 旧版
      '.mw-parser-output table.infobox',
      // 成句
      '.mw-parser-output table.infoboxSpecial',
    ].join(', '),
  },
  {
    siteName: 'Minecraft Wiki',
    match: (url) => url.host === 'minecraft.fandom.com',
    cssClasses: '.mw-parser-output .notaninfobox',
  },
  {
    siteName: '万界规划局',
    match: (url) => url.host.endsWith('wjghj.cn'),
    cssClasses: '.mw-parser-output .portable-infobox:not(.pi-theme-顶部提示小)',
  },
]
