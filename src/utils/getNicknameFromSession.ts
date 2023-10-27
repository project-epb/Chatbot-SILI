import { Session } from 'koishi'

export function getNicknameFromSession(session: Session) {
  return (
    session.username ||
    session.author?.nickname ||
    session.author?.username ||
    session.author.userId
  )
}
