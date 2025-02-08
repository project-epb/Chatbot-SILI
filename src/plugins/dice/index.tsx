import { Context, h, interpolate } from 'koishi'

import BasePlugin from '~/_boilerplate'

import {
  getUserIdFromSession,
  getUserNickFromSession,
} from '$utils/formatSession'
import { DiceRoller } from 'dice-roller-parser'

import { PlaintextRollRender } from './PlaintextRollRender'

export default class PluginDice extends BasePlugin {
  readonly dice: DiceRoller

  constructor(ctx: Context, config: unknown) {
    super(ctx, config, 'dice')
    this.dice = new DiceRoller(null, 1000)
    this.initCommands()
  }

  private initCommands() {
    this.ctx
      .command('dice [dice]', '掷骰子', {
        minInterval: 1000,
      })
      .alias('掷骰子', '投掷', '检定', 'r', 'roll')
      .usage(
        'dice [骰子表达式]\n例如“两个20面骰，加权5，大于等于12”：dice 2d20+5>=12'
      )
      .usage(
        '遵循 Roll20 规范，参考：https://help.roll20.net/hc/en-us/articles/360037773133-Dice-Reference'
      )
      .option('no-critical', '-C 不检查大成功/大失败', { type: 'boolean' })
      .action(async ({ session, options }, diceStr) => {
        diceStr = (diceStr || '1d20').replace(/\s/g, '')
        const ast = this.dice.parse(diceStr)
        const result = this.dice.rollParsed(ast)
        const text = PlaintextRollRender.render(result)
        return (
          <>
            <quote id={session.messageId}></quote>
            {text}
          </>
        )
      })
  }
}
