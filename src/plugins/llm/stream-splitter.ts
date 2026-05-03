/**
 * 流式输出分片器：决定累积的 sendBuffer 何时切出一段发给用户。
 *
 * 在 koishi 这类「不能编辑已发消息」的平台上，把 LLM 的长流切成几条
 * 短消息发出。两条规则：
 *
 *   1. **AI 显式标记** `<chunk_break/>`：模型在合适处插入，看到就切。
 *      标记在 sanitize 阶段被丢弃（INTERNAL_PROTOCOL_TYPES）。
 *   2. **超长且多行兜底**：buffer 超过 maxChunkLen 且至少有一个 `\n`
 *      时，切到 maxChunkLen 内最后一个 `\n`，让用户先看到已经攒下的
 *      完整几行。如果整段没有换行（一连串无分行的长文），就继续等
 *      到 stream 结束 force-flush ——不要在句子中间硬切。
 *
 * 没有句末扫描、没有颜文字检测、没有硬切。短回复/无标记的情况下，
 * AI 自己生成完一次性发，体感 "稍微等一下整段才到"，比切错好。
 */

/** 模型显式断句标记。会被 sanitize 丢弃，不会原样到达用户。 */
export const CHUNK_BREAK_MARKER = '<chunk_break/>'

export interface SplitOptions {
  /**
   * 触发"超长 + 多行"兜底切的阈值。AI 没标记 + buffer 超过这个长度 +
   * 范围内有 `\n` 时，切到最后一个 `\n`。默认 500。
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
  const markerIdx = rest.indexOf(CHUNK_BREAK_MARKER)
  if (markerIdx >= 0) {
    const cut = markerIdx + CHUNK_BREAK_MARKER.length
    return {
      text: rest.slice(0, cut),
      nextIndex: fromIndex + cut,
    }
  }

  // 2. 超长 + 多行兜底
  if (rest.length >= maxLen) {
    const nl = rest.lastIndexOf('\n', maxLen - 1)
    if (nl >= 0) {
      const cut = nl + 1
      return { text: rest.slice(0, cut), nextIndex: fromIndex + cut }
    }
    // 没换行 → 继续等（让 AI 完成整段，宁可慢点也别在句子中间硬切）
  }

  return { text: '', nextIndex: fromIndex }
}
