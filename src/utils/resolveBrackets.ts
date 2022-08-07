export function resolveBrackets(str: string) {
  return str
    .replace(new RegExp('&#91;', 'g'), '[')
    .replace(new RegExp('&#93;', 'g'), ']')
    .replace(new RegExp('&amp;', 'g'), '&')
}
