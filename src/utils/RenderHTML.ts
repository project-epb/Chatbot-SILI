import { Context } from 'koishi'
import type Puppeteer from '@koishijs/plugin-puppeteer'

export class RenderHTML {
  constructor(public ctx: Context) {}

  get ppt() {
    return this.ctx.puppeteer
  }

  async rawHtml(html: string, selector: string = 'body') {
    const page = await this.ppt.page()
    let file: Buffer | undefined
    try {
      await page.setContent(html)
      const $el = await page.$(selector)
      file = await $el?.screenshot({
        type: 'jpeg',
        quality: 90,
      })
    } finally {
      await page?.close()
    }
    return file
  }

  async html(body: string, selector: string = 'body') {
    const html = `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto+Sans+SC">
  <style>
    :root {
      font-family: 'Noto Sans SC';
      font-size: 14px;
      color: #252525;
    }
    html, body {
      margin: 0;
      padding: 0;
    }
    * {
      box-sizing: border-box;
    }
  </style>
</head>

<body>
${body}
</body>
</html>`
    return this.rawHtml(html, selector)
  }

  async text(text: string) {
    return this.html(
      `<pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
      'pre'
    )
  }

  async svg(svg: string) {
    return this.rawHtml(svg, 'svg')
  }

  hljs(code: string, lang = '', startFrom = 1) {
    const html = `
<link rel="stylesheet" href="https://unpkg.com/highlight.js@11.6.0/styles/atom-one-dark.css">
<style>
.hljs-ln-numbers {
  user-select: none;
  text-align: center;
  color: #ccc;
  border-right: 1px solid #CCC;
  vertical-align: top;
  padding-right: 5px;
}
.hljs-ln-code {
  padding-left: 10px;
}
</style>
<pre id="hljs-target" class="hljs ${lang ? 'lang-' + lang : ''}">${code
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>
<script src="https://unpkg.com/@highlightjs/cdn-assets@11.6.0/highlight.min.js"></script>
<script src="https://unpkg.com/highlightjs-line-numbers.js@2.8.0/src/highlightjs-line-numbers.js"></script>
<script>;(() => {
  const target = document.querySelector('#hljs-target')
  if (target.innerText.length > 100000) {
    return
  }
  hljs.lineNumbersBlock(target, { startFrom: ${Math.max(
    1,
    Number(startFrom)
  )} })
})()</script>
`

    return this.html(html, '#hljs-target')
  }
}

export function h(
  tag: string,
  props?: Record<string, any> | string,
  children?: string[] | string
) {
  const tagName = tag
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split(' ')[0]
  const isSelfClosed =
    ['br', 'hr', 'img', 'input', 'link', 'meta'].includes(tagName) ||
    tag.endsWith('/')
  const makePropString = (item: Record<string, any>) => {
    return Object.keys(item)
      .map((i) => {
        const key = i
        const val = item[i]
        if (typeof val === 'object') {
          return `${key}="${JSON.stringify(val).replace(/"/g, '&quot;')}"`
        }
        return `${key}="${val ?? ''}"`
      })
      .join(' ')
  }
  return `<${tagName}${
    !props
      ? ''
      : typeof props === 'string'
      ? ' ' + props.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : ' ' + makePropString(props)
  }${isSelfClosed ? ' /' : ''}>${
    typeof children === 'string' ? children : children?.join('') || ''
  }${!isSelfClosed ? `</${tagName}>` : ''}`
}
