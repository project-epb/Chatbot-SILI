import { Context, Service } from 'koishi'
import {} from 'koishi-plugin-puppeteer'

export class HTMLService extends Service {
  static using = ['puppeteer']

  constructor(public ctx: Context) {
    super(ctx, 'html')
  }

  get ppt() {
    return this.ctx.puppeteer
  }

  async rawHtml(html: string, selector: string = 'body') {
    const page = await this.ppt.page()
    let file: Buffer | undefined
    try {
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 15 * 1000,
      })
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
  <!-- <link rel="stylesheet" href="https://fonts.googlefonts.cn/css?family=Noto+Sans+SC"> -->
  <style>
    :root {
      font-family: 'Noto Sans SC', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
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
  padding-right: 0.5rem !important;
}
.hljs-ln-code {
  padding-left: 1rem !important;
}
.hljs-ln-line {
  white-space: break-spaces;
  max-width: calc(100vw - 6rem);
  word-wrap: break-word;
}
code.hljs {
  position: relative;
}
code.hljs[class*='lang-']:before {
  position: absolute;
  color: #fff;
  z-index: 3;
  line-height: 1;
  top: 1rem;
  right: 1rem;
  background-color: #000;
  padding: 0.2rem 0.4rem;
  border-radius: 1rem;
}
code.hljs[class~='lang-js']:before,
code.hljs[class~='lang-javascript']:before {
  content: 'js';
}
code.hljs[class~='lang-lua']:before {
  content: 'lua';
}
code.hljs[class~='lang-ts']:before,
code.hljs[class~='lang-typescript']:before {
  content: 'ts';
}
code.hljs[class~='lang-html']:before,
code.hljs[class~='lang-markup']:before {
  content: 'html';
}
code.hljs[class~='lang-md']:before,
code.hljs[class~='lang-markdown']:before {
  content: 'md';
}
code.hljs[class~='lang-vue']:before {
  content: 'vue';
}
code.hljs[class~='lang-css']:before {
  content: 'css';
}
code.hljs[class~='lang-sass']:before {
  content: 'sass';
}
code.hljs[class~='lang-scss']:before {
  content: 'scss';
}
code.hljs[class~='lang-less']:before {
  content: 'less';
}
code.hljs[class~='lang-stylus']:before {
  content: 'stylus';
}
code.hljs[class~='lang-go']:before {
  content: 'go';
}
code.hljs[class~='lang-java']:before {
  content: 'java';
}
code.hljs[class~='lang-c']:before {
  content: 'c';
}
code.hljs[class~='lang-sh']:before {
  content: 'sh';
}
code.hljs[class~='lang-yaml']:before {
  content: 'yaml';
}
code.hljs[class~='lang-py']:before {
  content: 'py';
}
code.hljs[class~='lang-docker']:before {
  content: 'docker';
}
code.hljs[class~='lang-dockerfile']:before {
  content: 'dockerfile';
}
code.hljs[class~='lang-makefile']:before {
  content: 'makefile';
}
code.hljs[class~='lang-json']:before {
  content: 'json';
}
code.hljs[class~='lang-ruby']:before {
  content: 'rb';
}
code.hljs[class~='lang-python']:before {
  content: 'py';
}
code.hljs[class~='lang-bash']:before {
  content: 'sh';
}
code.hljs[class~='lang-php']:before {
  content: 'php';
}
code.hljs[class~='lang-wiki']:before {
  content: 'wiki';
}
</style>
<pre screenshot-target class="hljs"><code class="hljs ${
      lang ? 'lang-' + lang : ''
    }">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
<script src="https://unpkg.com/@highlightjs/cdn-assets@11.6.0/highlight.min.js"></script>
<script src="https://unpkg.com/highlightjs-line-numbers.js@2.8.0/src/highlightjs-line-numbers.js"></script>
<script>;(() => {
  const target = document.querySelector('pre[screenshot-target] code')
  if (target.innerText.length > 100000) {
    return
  }
  hljs.highlightElement(target)
  hljs.lineNumbersBlock(target, {
    startFrom: ${Math.max(1, Number(startFrom))},
    singleLine: true,
  })
})()</script>
`

    return this.html(html, `pre[screenshot-target]`)
  }
}
