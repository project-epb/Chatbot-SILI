import { interpolate } from 'koishi'

import {
  DiceExpressionRoll,
  DiceRollResult,
  DieRoll,
  ExpressionRoll,
  FateDieRoll,
  GroupRoll,
  MathFunctionRoll,
  RollBase,
} from 'dice-roller-parser'

export namespace PlaintextRollRender {
  const i18n = {
    success: '(❁´◡`❁) 成功',
    failure: '¯\\_ (ツ)_/¯ 失败',
    criticalSuccess: '(๑•̀ㅂ•́)و✧ 大成功！',
    criticalFailure: '(っ°Д°;)っ 大失败！',
    plus: '加上',
    minus: '减去',
    simplePlus: '加权',
    simpleMinus: '降权',
    coinFront: '正面',
    coinBack: '反面',
    nCoins: '{{count}}枚硬币',
    numberRoll: '结果为{{value}}',
    dieRoll: '投出了{{count}}个{{die}}面骰，结果为{{value}}',
  }

  enum CriticalType {
    SUCCESS = 'success',
    FAILURE = 'failure',
  }

  export function render(roll: RollBase) {
    const type = roll.type

    let text = ''
    switch (type) {
      case 'number': {
        text = renderNumber(roll as RollBase)
        break
      }
      case 'die': {
        text = renderDie(roll as DiceRollResult)
        break
      }
      default: {
        throw new Error('Roll type not implemented: ' + type)
      }
    }

    roll.label && (text += ` (${roll.label})`)
    return text
  }

  function formatDieRoll(roll: DieRoll) {
    return `${roll.valid ? '🎲' : '🚫'}${roll.die}${roll.value !== roll.die ? `(=${roll.value})` : ''}`
  }

  // 纯数字
  function renderNumber(roll: RollBase) {
    return interpolate(i18n.numberRoll, { value: roll.value })
  }

  // 简单骰子
  function renderDie(roll: DiceRollResult) {
    const count = roll.count.value
    const dieValue = roll.die.value
    const rolls = roll.rolls as DieRoll[]

    const hasCritical = rolls.find(
      (r) =>
        r.critical === CriticalType.SUCCESS ||
        r.critical === CriticalType.FAILURE
    )

    let successText = roll.success ? i18n.success : i18n.failure
    if (hasCritical) {
      successText =
        hasCritical.critical === CriticalType.SUCCESS
          ? i18n.criticalSuccess
          : i18n.criticalFailure
    }

    //
    const rollsText =
      rolls
        .map(
          (r) =>
            `${r.valid ? '🎲' : '🚫'}${r.die}${r.value !== r.die ? `` : ''}}`
        )
        .join(' + ') + ` = ${roll.value}${roll.label ? ` (${roll.label})` : ''}`

    return `${successText}\n${interpolate(i18n.dieRoll, { count, die: dieValue, value: roll.value })}\n${rollsText}`
  }
}
