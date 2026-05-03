/**
 * 流式输出分片器：决定累积的 sendBuffer 何时切出一段发给用户。
 *
 * 设计目的：在 koishi 这类「不能编辑已发消息」的平台上，把 LLM 的长流
 * 切成几条短消息发出，让用户尽早看到内容；同时不要切太碎也不要切在
 * 奇怪的位置。
 *
 * 策略（按优先级）：
 *   1. **明显段落边界**（`\n\n`）：在 `minChunkLen` 之后第一次出现就切
 *   2. **达到 targetChunkLen 后找句末**（。！？!?）：找窗口内最后一个
 *      句末符号切。次选软换行。
 *   3. **超过 maxChunkLen 强切**：找窗口内最后一个标点/空格作为兜底
 *      切点；再没有就硬切。
 *   4. 都没满足：返回空，让 caller 累积更多 token 再调。
 *
 * 老实现按 splitChars 计数 5 个就切，导致 markdown 列表（每行一个 \n）
 * 在 5 行后就发，但下一片只有几个字、且常切到段落中间。新实现以字符
 * 数为主轴，更接近"一段话讲完了再发"的人类直觉。
 */

const PARA_BREAK = '\n\n'
const SENTENCE_ENDS = new Set(['。', '！', '？', '!', '?'])
const SOFT_BREAK = new Set(['\n'])
const FALLBACK_BOUNDARIES = new Set([
  '。', '！', '？', '!', '?',
  '\n',
  '，', ',', '；', ';', '：', ':',
  ' ',
])
/**
 * 紧跟在句末标点之后、属于"同一个句子"的闭合字符。`「...！」` 中的
 * `」` 不该被切到下一片，否则用户会看到一行只有 `」`。
 */
const TRAILING_CLOSERS = new Set([
  '」', '』', '”', '"', '’', "'",
  '）', ')', '】', ']', '〕', '》', '〉',
])

export interface SplitOptions {
  /** 不切短于此长度的 chunk（避免一个字一条消息）。默认 40 字符。 */
  minChunkLen?: number
  /** 达到此长度后才主动找句末切。默认 120 字符。 */
  targetChunkLen?: number
  /** 超过此长度则强切（找次级边界，再没就硬切）。默认 280 字符。 */
  maxChunkLen?: number
}

export interface SplitResult {
  /** 这次该发出去的内容；空字符串表示"还不该切，继续累积"。 */
  text: string
  /** 切走 text 后，buffer 上下次的起点（绝对位置，相对原 fullText）。 */
  nextIndex: number
}

export function splitContent(
  buffer: string,
  fromIndex: number,
  opts: SplitOptions = {}
): SplitResult {
  const minLen = opts.minChunkLen ?? 40
  const targetLen = opts.targetChunkLen ?? 120
  const maxLen = opts.maxChunkLen ?? 280

  if (fromIndex >= buffer.length) {
    return { text: '', nextIndex: buffer.length }
  }
  const rest = buffer.slice(fromIndex)
  if (rest.length < minLen) {
    return { text: '', nextIndex: fromIndex }
  }

  // 优先级 1：段落边界（\n\n），且前面那段 ≥ minLen 才切——不然段落
  // 太短发出去也是抖。
  const paraIdx = rest.indexOf(PARA_BREAK)
  if (paraIdx !== -1 && paraIdx >= minLen) {
    const cut = paraIdx + PARA_BREAK.length
    return {
      text: rest.slice(0, cut),
      nextIndex: fromIndex + cut,
    }
  }

  // 优先级 2：达到 targetLen 后找句末（往后多看 50 字符防止刚好卡到句子中间）
  if (rest.length >= targetLen) {
    const window = rest.slice(0, Math.min(targetLen + 50, rest.length))
    const lastSentEnd = lastIndexInSet(window, SENTENCE_ENDS, minLen - 1)
    if (lastSentEnd >= 0) {
      const baseCut = lastSentEnd + 1
      const cut = extendOverTrailingClosers(rest, baseCut)
      // baseCut == rest.length 且未 extend 过 = `！` 是 raw buffer 末尾，
      // 后面的 `」` 可能还没到，等下个 token 一起切免得落单。
      // cut > baseCut（已 extend）或 cut < rest.length（后面还有内容）
      // 都说明语义完整，可以切。
      const extended = cut > baseCut
      if (cut < rest.length || extended) {
        return {
          text: rest.slice(0, cut),
          nextIndex: fromIndex + cut,
        }
      }
    }
    // 句末没找到，退到软换行（markdown 列表/header 也能切干净）
    const lastSoft = lastIndexInSet(window, SOFT_BREAK, minLen - 1)
    if (lastSoft >= 0) {
      const cut = lastSoft + 1
      return {
        text: rest.slice(0, cut),
        nextIndex: fromIndex + cut,
      }
    }
  }

  // 优先级 3：超 maxLen 强切（找次级标点，再没有就硬切）
  if (rest.length >= maxLen) {
    const window = rest.slice(0, maxLen)
    const lastBoundary = lastIndexInSet(window, FALLBACK_BOUNDARIES, minLen - 1)
    const cut = lastBoundary >= 0
      ? extendOverTrailingClosers(rest, lastBoundary + 1)
      : maxLen
    return {
      text: rest.slice(0, cut),
      nextIndex: fromIndex + cut,
    }
  }

  // 还不该切，等更多 token
  return { text: '', nextIndex: fromIndex }
}

/**
 * 找 str 中最后一个属于 set 的字符位置。仅在 [minPos, str.length) 范围内
 * 搜索——避免切出小于 minLen 的微 chunk。
 */
function lastIndexInSet(
  str: string,
  set: ReadonlySet<string>,
  minPos: number
): number {
  for (let i = str.length - 1; i >= minPos; i--) {
    if (set.has(str[i])) return i
  }
  return -1
}

/**
 * 把 cut 位置向后扩展，吃掉紧跟的闭合标点（`」` `』` `）` 等）。这样
 * `「...！」` 的 `」` 跟 `！` 留在同一片，避免下一片落单。
 *
 * 闭合标点之后再吃任意数量的 `\n`：让段落分隔（`\n\n`）跟着前一片走，
 * 下一片以新段落首字符开头，看起来更整齐。
 */
function extendOverTrailingClosers(str: string, cut: number): number {
  while (cut < str.length && TRAILING_CLOSERS.has(str[cut])) cut++
  while (cut < str.length && str[cut] === '\n') cut++
  return cut
}
