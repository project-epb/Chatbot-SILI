export function safelyStringify(value: any, space = 0) {
  const visited = new WeakSet()

  const replacer = (key: string, val: any) => {
    // 处理 BigInt
    if (typeof val === 'bigint') {
      return val.toString()
    }

    // 处理 Set
    if (val instanceof Set) {
      return Array.from(val)
    }

    // 处理 Map
    if (val instanceof Map) {
      return Array.from(val.entries())
    }

    // 处理 function
    if (typeof val === 'function') {
      return val.toString()
    }

    // 处理自循环引用
    if (typeof val === 'object' && val !== null) {
      if (visited.has(val)) {
        return '<circular>'
      }
      visited.add(val)
    }

    return val
  }

  return JSON.stringify(value, replacer, space)
}
