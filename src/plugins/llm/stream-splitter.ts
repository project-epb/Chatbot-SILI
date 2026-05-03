/**
 * 流式输出分片器：决定累积的 sendBuffer 何时切出一段发给用户。
 *
 * 在 koishi 这类「不能编辑已发消息」的平台上，把 LLM 的长流切成几条
 * 短消息发出。两条规则：
 *
 *   1. **AI 显式标记** `<msg_break/>`：模型在合适处插入，看到就切。
 *      标记在 sanitize 阶段被丢弃（PROTOCOL_ONLY_ELEMENT_TYPES）。
 *   2. **超长 + 多行兜底**：buffer 超过 maxChunkLen 且至少出现一个
 *      `\n` 时，切到第一个 `\n` —— 哪怕 `\n` 出现在 maxLen 之后，
 *      也意味着"前面那行已经写了至少 maxLen 个字符，发出去了"。
 *      整段没换行 → 继续等 stream 结束 force-flush，不在句子中间硬切。
 */

import { PROTOCOL_MARKERS } from './protocol'

const MARKER = PROTOCOL_MARKERS.MSG_BREAK

export interface SplitOptions {
  /**
   * 触发"超长 + 多行"兜底切的阈值。AI 没标记 + buffer 超过这个长度 +
   * 出现 `\n` 时，切到第一个 `\n`。默认 500。
   */
  maxChunkLen?: number
}

export interface SplitResult {
  /** 这次该发出去的内容；空字符串表示"还不该切，继续累积"。 */
  text: string
  /** 切走 text 后的 buffer 起点（绝对位置）。 */
  nextIndex: number
}

export function splitContent(
  buffer: string,
  fromIndex: number,
  opts: SplitOptions = {}
): SplitResult {
  const maxLen = opts.maxChunkLen ?? 500

  if (fromIndex >= buffer.length) {
    return { text: '', nextIndex: buffer.length }
  }
  const rest = buffer.slice(fromIndex)

  // 1. AI 显式标记
  const markerIdx = rest.indexOf(MARKER)
  if (markerIdx >= 0) {
    const cut = markerIdx + MARKER.length
    return {
      text: rest.slice(0, cut),
      nextIndex: fromIndex + cut,
    }
  }

  // 2. 超长 + 多行兜底
  if (rest.length >= maxLen) {
    const nl = rest.indexOf('\n')
    if (nl >= 0) {
      const cut = nl + 1
      return { text: rest.slice(0, cut), nextIndex: fromIndex + cut }
    }
  }

  return { text: '', nextIndex: fromIndex }
}
