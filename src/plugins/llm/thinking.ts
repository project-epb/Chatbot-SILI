/**
 * Resolve the --think option string into provider features.
 * Accepted: low / medium / high / xhigh / max / no / none / false / off (case-insensitive).
 * Anything else (including unset) defaults to 'low'.
 */
export function resolveThinkingLevel(level: string | undefined): {
  enableThinking: boolean
  thinkingBudget: number
} {
  const normalized = (level ?? 'low').trim().toLowerCase()
  switch (normalized) {
    case 'no':
    case 'none':
    case 'false':
    case 'off':
      return { enableThinking: false, thinkingBudget: 0 }
    case 'medium':
    case 'mid':
      return { enableThinking: true, thinkingBudget: 4096 }
    case 'high':
      return { enableThinking: true, thinkingBudget: 8192 }
    case 'xhigh':
    case 'max':
      return { enableThinking: true, thinkingBudget: 16384 }
    case 'low':
    default:
      return { enableThinking: true, thinkingBudget: 1024 }
  }
}

/**
 * Clamp the thinking budget so the model still has room to actually answer.
 * Anthropic and most compatible providers require thinking_budget < max_tokens;
 * we additionally reserve a small headroom for the textual response itself.
 *
 * Returns 0 when there is no usable headroom (caller should treat as "off").
 */
export function clampThinkingBudget(
  budget: number,
  maxTokens: number,
  reserve = 512
): number {
  const headroom = maxTokens - reserve
  if (headroom <= 0) return 0
  return Math.max(0, Math.min(budget, headroom))
}
