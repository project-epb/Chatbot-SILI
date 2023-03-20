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
    if (!session.elements) return
    const textSegs = segment.select(session.elements, 'text')
    const pass = PluginSensitiveFilter.filter.verify(textSegs.join(' '))
    if (!pass) {
      const original = session.content
      session.elements.forEach((i, index) => {
        if (i.type === 'text') {
          session.elements![index].attrs.content =
            PluginSensitiveFilter.filter
              .filter(i?.attrs?.content || '')
              .text?.toString() || ''
        }
      })
      this.logger.info('send-has-sensitive', {
        before: original,
        after: session.content,
      })
    }
  }
}
