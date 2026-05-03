# LLM Plugin Refactor — 自主完成笔记

> 用户授权我在他洗澡时分步推进 + 自主 commit。这是给他验收时看的。

## 7 个独立 commit（按顺序）

```
09d97d0  refactor(llm): extract SystemPromptBuilder into services/system-prompt.ts
2e1e878  refactor(llm): extract ChatHistoryService into services/chat-history.ts
501f09a  refactor(llm): extract CommandCatalogService into services/command-catalog.ts
1bfddb8  refactor(llm): extract ActiveChatRegistry into services/active-chats.ts
187acb0  refactor(llm): extract MemoryForkScheduler into services/memory-fork-scheduler.ts
19d9504  refactor(llm): split admin commands into commands/admin.tsx subplugin
c25609f  refactor(llm): split chat command into commands/chat.tsx subplugin
```

每步：抽出 → 修改 import/调用点 → vitest 全绿 + tsc 干净 → commit。任一步可独立 revert。

## 文件大小变化

| 文件 | 之前 | 之后 |
|---|---|---|
| `index.tsx` | 1578 | **342** (−78%) |

新建：
- `services/system-prompt.ts` 145
- `services/chat-history.ts` 75
- `services/command-catalog.ts` 75
- `services/active-chats.ts` 66
- `services/memory-fork-scheduler.ts` 160
- `commands/admin.tsx` 305
- `commands/chat.tsx` 558（最大块，最后做）

llm/ 总行数：3339 → 4168（+25%，主要是 service class 的样板代码：JSDoc、interface、构造器）。**单文件复杂度大幅下降换来一些总行数膨胀**，符合预期。

## 子插件 vs 内部 service 选择

按你的提示，commands 用 koishi 子插件模式（`ctx.plugin(SubPlugin)`），享受自动生命周期清理。services 是普通 TS class，挂在 plugin 实例上，不走 cordis Service。

- `AdminCommands` / `ChatCommand` extends `BasePlugin`，static inject `['llm', 'database']`，构造时注册命令
- 子插件 stateless，所有依赖通过 `ctx.llm.xxx` 访问父 plugin

## 顺手干掉的死代码

`PluginLLM._adjustDpskV4Prompt` 是给 DeepSeek V4 做"system prompt 拼到 user message"的旁路。在抽 chat command 时确认**已经无任何调用方**——整个文件 grep 唯一一处就是声明本身。删了。git history 留着，未来如果 DSv4 又需要这个 hack 知道去哪找。

## 几个值得提的判断

### MemoryForkScheduler 不直接依赖 PluginLLM 类
用 structural-typed `MemoryForkSchedulerDeps` interface 描述需要的成员，避免 `services/` ↔ `index.tsx` 循环 import。`new MemoryForkScheduler(this)` 在 plugin 构造时，TS 结构 typing 自动满足。

### `resolveMemoryKey` 改 public
原本 private，给 chat action 用。子插件需要也用，所以改 public。注释里明说原因。

### 复用 sticker 的 BasePlugin 模式
你给的参考是 `plugins/sticker/`：父插件 `ctx.plugin(子插件类)` 一行加载，子插件继承 BasePlugin。我严格照这个模式做了 admin/chat。

### catalog 自己 bind ready hook
`CommandCatalogService.bind()` 在 plugin 构造时调用，挂上 `ctx.on('ready')`。比把 hook 散在 plugin 主体里更内聚。

## 没做（你看是否还要）

1. **更细的命令拆分**：`reset.ts` 单独？我没做，admin 二分够清晰
2. **抽更多东西到 services/**：比如 chat command 的 envelope 构造可以再抽 `services/envelope.ts`，但这会让 commands/chat.tsx 看起来"空"，反而难读。当前 558 行的 chat.tsx 内聚度合适
3. **加新单测**：service class 没专门写测试。现有 9 文件 / 133 测试都是纯函数和老 service 的测试，全绿。要不要给新 service 补测我交给你定
4. **删 `getCatalog()` 转发方法**：`PluginLLM.getCatalog()` 现在只是转发到 `this.catalog.list()`。tools.ts 里通过 `(ctx as any).llm.getCatalog?.()` 调它。可以改成 `(ctx as any).llm.catalog.list()` 然后删 getCatalog。我没做是为了不动 tools.ts，避免出错

## 验证结果

- vitest：每步 9 文件 / 133 测试全绿
- tsc：llm/ 目录无新错（仓库 baseline 错误如 `minInterval` 与本次改动无关）
- 容器：重启正常，catalog rebuild + image-cache cleanup 日志输出，`[I] INIT 🌈 SILI启动成功~`

## 你回来后可以验

```
;chat 你好
;chat 详细介绍 React Fiber 架构      # 长输出
;chat 好了别说了                     # mid-stream 打断 + silent
;chat 我们刚刚聊到哪了                # history 续接
;llm.providers                       # admin 子插件
;llm.memory --read                   # admin 子插件
;llm.reset                           # admin 子插件
```

如果有任何路径出问题，单独 revert 对应 commit 即可（每步独立）。
