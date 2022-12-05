import { Context, Session, segment } from 'koishi'
import BasePlugin from '../_bolierplate'
import { useFilter } from './useFilter'

export default class PluginSensitiveFilter extends BasePlugin {
  static filter = useFilter()

  constructor(public ctx: Context) {
    super(ctx, {}, 'sensitive-filter')
    ctx.before('send', this.onBeforeSend.bind(this))
  }

  onBeforeSend(session: Session) {
    const seg = segment.parse(session.content)
    const textSegs = segment.select(seg, 'text')
    const pass = PluginSensitiveFilter.filter.validator(textSegs.join(' '))
    if (!pass) {
      seg.forEach((i, index) => {
        if (i.type === 'text') {
          seg[index].attrs.content = String(
            PluginSensitiveFilter.filter.filterSync(i?.attrs?.content || '')
              .text
          )
        }
      })
      const parsedContent = seg.join('')
      this.logger.info('send-has-sensitive', {
        before: session.content,
        after: parsedContent,
      })
      session.content = parsedContent
    }
  }
}
