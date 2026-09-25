# 指南以「索引 + 分片」交付，`GUIDE.md` 仍是源

一个客户端 agent 一次运行只需要本支的步骤，但交付形态此前是整篇 `GUIDE.md`：一次 fetch、263 KB 全进上下文，实际执行的正文只占 44.5–57.8%。本决策把同一个文本按 **`when=` 门**切成 **索引**（头部 + 预答表 + Phase 0–2 + 路由表）与 **分片**（`guide/parts/*.md`）：运行先取索引，再只取自己那一支的分片；`GUIDE.md` 不变，harness 一行不改（`e2e/extract.mjs` 仍只读它），所以「指南即测试」不重开。

- **方向：`GUIDE.md` 是源，分片是它的生成视图。** `e2e/guide-parts.mjs --write` 从 `GUIDE.md` 切出分片与 `guide/parts.json`（每个分片的 runs 与全局顺序），`--check` 证明分片按清单粘回去与 `GUIDE.md` 逐字节一致；它**永不写 `GUIDE.md`**。反过来（分片为源、拼出 `GUIDE.md`）不可行：分片的文本在文档里是分散的（含多段的门控），一旦允许改分片，段边界与顺序信息就无处恢复。
- **索引里手写一张路由表，机器校验。** 路由表给每条 (形态, 布局) 两个事实：要取哪些文件、按什么顺序执行哪些 step id；`GUIDE_SETUP=yes` 与 `GUIDE_TNB=yes` 不在行里，各自一行说明「多取哪片、多跑哪步、插在哪步之后」（后者标记 `unrun`，因为没有任何 profile 命中它）。`e2e/router.mjs` 用 `extract.mjs` 的同一套 `when=` 语义重算计划，逐行比对：六行、两条规则、每个 `when=` 取值要么被某条 profile 命中、要么被声明为 `unrun`——双向都红。手写是刻意的：生成进 `GUIDE.md` 会让「源」变成两个。
- **跨步事实走 `.vite-plus-*` scratch，不共享 shell 状态。** 出生证明的六臂（`prov-*`）各是一步（带 `when=`），把四行值写进 `.vite-plus-prov-*`，共享步读回并断言存在。等价性已逐 profile 证明：新旧两版对同一答案产生四行文本逐字一致。
- **重复片段有名字，副本必须逐字一致。** `e2e/fragments.mjs` 声明「哪几段被复制了几份、怎么找到它们」，要求副本数量精确、文本逐字相同（只忽略缩进）：一份漂移、或多一份少一份，都红。
- **验证段是「本次运行建了什么」的断言集，不覆盖分支之外。** Phase 6 增补交付物断言（`AGENTS.md` 约束段与闭合行、继承 ADR 落在记录点、`docs/agent-notes.md` 的 traps 段、`docs/provenance.md` 的落点来源、`skills-lock.json` 与安装目录一致）与结尾的断言计数；两处 `case` 补 `*)` 兜底。Phase 7 变成通用骨架 + 从 `docs/provenance.md` 读回 + 本支 `report-*` 步打印的 3–5 行。

## Considered Options

- **按 profile 切文件**（九个文件，每个一套完整步骤）— 拒绝：`when=` 块散布全文，共享步骤夹在中间，按 profile 切会让共享步骤出现九份，正是「一个事实一个家」要防的。
- **只在 `GUIDE.md` 里加门控、不切分片** — 拒绝：门控对 harness 无条件，对客户端 agent 只省「读到不执行」的成本；分片才真正把那部分字节移出上下文。
- **正文做成抽取期 snippet**（`extract.mjs` 组装重复片段）— 拒绝（本轮）：正文不再逐字等于所执行文本，会重开 ADR-0006；`fragments.mjs` 用「副本一致」拿到大部分收益而不动那个前提。
- **路由表生成进 `guide/index.md`** — 拒绝：那会让生成的索引反写指南源文本，索引与 `GUIDE.md` 的边界立刻变成两个事实；手写 + `router.mjs --print` 提供同样的可维护性。
- **保留头部六形态百科，只加路由表** — 拒绝：那片散文一次运行只用一行，其余是别的形状的事实；每形状一句话进路由表附近，详细事实留在各自的 `when=` 步骤旁。

## Consequences

- 实测（本轮状态，`guide/parts.json` 的字节数）：`GUIDE.md` 281 KB；索引 35 KB + 共享分片 `core` 96 KB 是每次运行都读的，分支分片 11–62 KB 按本支取。一次运行读 142.5–192.8 KB（全文的 51–69%），比读整篇少 88–138 KB。共享的 96 KB 是这块收益的上界：其中验证段约 25 KB（ADR-0006：它只能有一个、不能拆不能门控），其余是每个形状都执行的核心步骤与序言——想再降，得动正文本身（评审里的 pruning 杠杆，未做）。
- `GUIDE.md` 仍是 harness 读的单文件视图，逐字节等于分片按序粘回的结果。
- `GUIDE.md` 的任何字节改动都必须重切分片（`node e2e/guide-parts.mjs --write`），否则 `coverage.mjs --self-check`（`run.sh` 第一步就跑）红；改了 `when=` 门或增删步骤，还要用 `router.mjs --print` 重出路由表并重跑。
- 增删一个 step id 会同时改变路由表与（可能）重复片段计数：两者都是「改一处就要同步」的显式账，机器会指出差在哪一行。
- `e2e/router.mjs`、`e2e/fragments.mjs` 与 `guide-parts.mjs` 一起由 `coverage.mjs --self-check` 调用，故矩阵与单 profile 运行都从同一扇门进来。
- 交付形态的端到端证据仍是全矩阵：9 个 profile 全部跑通并重写 `docs/verification.md`。
- 真实运行观察（客户端 agent 是否按索引只取本支分片）不在本轮 harness 内：它是这个交付形态的下一个证据，见交接文档第 3 步。
