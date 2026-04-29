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
      return { enableThinking: true, thinkingBudget: 2048 }
    case 'high':
      return { enableThinking: true, thinkingBudget: 4096 }
    case 'xhigh':
    case 'max':
      return { enableThinking: true, thinkingBudget: 8192 }
    case 'low':
    default:
      return { enableThinking: true, thinkingBudget: 1024 }
  }
}
