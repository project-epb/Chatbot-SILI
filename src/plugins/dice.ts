import { Context, h } from 'koishi'
import BasePlugin from './_boilerplate'

export interface DiceConfig {
  count: number
  points: number
  bonus: number
}
export interface DiceResult {
  history: number[]
  pure: number
  total: number
}
export enum SpecialResults {
  NORMAL,
  CRITICAL,
  FAIL,
}

export default class PluginDice extends BasePlugin {
  DICE_REG = /^(\d+)?[dD](\d+)([+-]\d+)?$/

  constructor(public ctx: Context, public options: any) {
    super(ctx, options, 'dice')
    this.initCommands()
  }

  private initCommands() {
    this.ctx
      .command('dice <difficulty:posint> [dice]', '掷骰子', {
        minInterval: 1000,
      })
      .alias('掷骰子', '投掷', '检定', 'r', 'roll')
      .action(async ({ session }, difficulty, dice) => {
        if (!difficulty) return '没有指定难度值！'

        const { count, points, bonus } = this.parseDice(dice)
        if (count > 100) return '掷出了一卡车骰子……这，这不对吧！'
        if (count < 1) return '掷出了一个空气骰子……等等，这是什么鬼啦！'
        if (points > 100) return '掷出了……玻璃球？'
        if (points < 3) return '掷出了……等等，这是哪个次元的骰子？'
        if (Math.abs(bonus) > 100) return '哎呀，加权太多啦！'

        const result = this.dice(count, points, bonus)

        return `${h.at(session.userId)}${this.printResult(
          difficulty,
          { count, points, bonus },
          result
        )}`
      })
  }

  /**
   * 掷出骰子，并获取最终结果
   * @param count 骰子的数量
   * @param points 骰子的点数
   * @param bonus 额外加权点数
   * @returns 骰子的结果
   */
  dice(count = 1, points = 20, bonus = 0): DiceResult {
    let history: number[] = []
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * points) + 1
      history.push(roll)
    }
    const pure = history.reduce((a, b) => a + b, 0)
    const total = pure + bonus

    return {
      history,
      pure,
      total,
    }
  }
  theoreticalMaximum(count: number, points: number, bonus: number) {
    return count * points + bonus
  }
  /**
   * 从字符串中解析骰子的数量、点数和额外加权点数等信息
   * @example 可能出现的字符串格式
   * ```
   * - ``, `d20`, `1d20` 一个20面骰
   * - `2d20+5` 两个20面骰，加权5
   * ```
   * @param str
   * @returns
   */
  parseDice(str: string): DiceConfig {
    if (!str) return { count: 1, points: 20, bonus: 0 }
    const reg = /^(\d+)?[dD](\d+)([+-]\d+)?$/
    const match = str.match(reg)
    if (!match) return { count: 1, points: 20, bonus: 0 }
    const [, count, points, bonus] = match
    return {
      count: count ? parseInt(count) : 1,
      points: parseInt(points),
      bonus: bonus ? parseInt(bonus) : 0,
    }
  }

  // 在难度x检定中掷出了x个x面骰，结果为x(+x)：成功/失败/大成功/大失败
  // 当骰子数量为1时，如果掷出了1点或最大点数，会有特殊的提示，此时不显示加权值，提示为大成功/大失败
  printResult(difficulty: number, dice: DiceConfig, result: DiceResult) {
    const { count, points, bonus } = dice
    const { pure, total } = result

    const success = total >= difficulty

    const specialType = this.checkSpecialResult(dice, result)
    let bonusText = ''
    let endText = ''
    switch (specialType) {
      case SpecialResults.CRITICAL:
        endText = '(๑•̀ㅂ•́)و✧ 大成功！'
      case SpecialResults.FAIL:
        endText = '(っ°Д°;)っ 大失败！'
      default:
        bonusText = bonus ? `(${bonus > 0 ? '+' : ''}${bonus})` : ''
        endText = success ? '(❁´◡`❁) 成功' : '¯\\_ (ツ)_/¯ 失败'
    }

    return `${endText}\n在难度 ${difficulty} 检定中掷出了 ${count} 个 ${points} 面骰，结果为 ${total}${bonusText}`
  }
  checkSpecialResult(dice: DiceConfig, result: DiceResult) {
    const { count, points } = dice
    const { pure } = result
    if (count === 1) {
      if (pure === 1) {
        return SpecialResults.FAIL
      } else if (pure === points) {
        return SpecialResults.CRITICAL
      }
    }
    return SpecialResults.NORMAL
  }
}
