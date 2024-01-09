import { Session, Universal, segment } from 'koishi'

export class BulkMessageBuilder {
  #figure = segment('message', { forward: '' })
  #bot: Universal.Author
  #author: Universal.Author
  #content: string
  #isPrependOriginal = false
  constructor(public session: Session) {
    this.#content = session.content
    this.#bot = {
      userId: this.session.bot.userId,
      nickname: this.session.bot.nickname || this.session.bot.username || 'BOT',
    }
    this.#author = {
      userId: session.author!.userId,
      nickname:
        session.author?.nickname ||
        session.author?.username ||
        session.author!.userId,
    }
  }

  all() {
    return this.#figure
  }
  get figure() {
    return this.#figure
  }

  addLine(author: Universal.Author, message: string) {
    this.#figure.children.push(segment('message', author, message))
    return this
  }
  botSay(msg: string) {
    this.addLine(this.#bot, msg)
    return this
  }
  authorSay(msg: string) {
    this.addLine(this.#author, msg)
    return this
  }
  prependOriginal() {
    if (this.#isPrependOriginal) return this
    this.#isPrependOriginal = true
    this.#figure.children.unshift(
      segment('message', this.#author, this.#content)
    )
    return this
  }
}
