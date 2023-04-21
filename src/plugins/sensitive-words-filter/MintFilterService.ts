import { Context, Service } from 'koishi'
import { readFile } from 'fs/promises'
import Mint from 'mint-filter'
import { resolve } from 'path'

Context.service('mint')
export default class MintFilterService {
  constructor(public ctx: Context) {
    this.start()
  }
  protected async start() {
    const start = Date.now()
    console.info('[Mint] filter build start')
    const text = await readFile(resolve(__dirname, './badwords.ini'))
      .then((val) => val.toString())
      .catch((e) => {
        this.ctx.logger('MintFilter').warn('Failed to load badwords.ini', e)
        return ''
      })
    const words = text
      .split('\n')
      .map((i) => i.trim())
      .filter((i) => !!i && !i.startsWith('//') && !i.startsWith('#'))
    this.ctx.root.mint = new Mint(words)
    console.info(
      `[Mint] filter loaded ${words.length} words in ${Date.now() - start}ms`
    )
  }
}
