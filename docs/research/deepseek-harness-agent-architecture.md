# DeepSeek Harness 的 agent 开发架构：调研与可提炼性分析

本文件回答三个问题，按顺序：

1. **DSH 是怎么设计的**——偏 agent 开发的那一面：仓库如何对 agent 说话、技能如何组织、约束在哪里生效、决策如何被结构化。
2. **哪些可以提炼为通用项目的架构设计**——逐条判定"通用原则 / 可移植模式 / DSH 特有"，并给出判据。
3. **能不能补进本仓库的指南**——给出落点、规则草案与明确的不做清单。

| | |
|---|---|
| 调研对象 | `../deepseek-harness`（DeepSeek Harness，`@deepseek-ai/dsh-root` v0.1.7-rc.1） |
| 目标快照 | git `46a7f68b0922371ce7144b668b90e377d8e799f4`（2026-09-23 21:03 +0800，PR #5073） |
| 调研日期 | 2026-09-24（CST） |
| 本仓库快照 | git `9559f73`（dev 分支，工作区干净） |
| 一手来源 | 只有 `../deepseek-harness` 的源码与文档；网络材料一律未用于 DSH 的事实陈述 |
| 引用格式 | `../deepseek-harness/<相对路径>:<行号>`，行号以目标快照为准 |

## 摘要

**DSH 是什么**：一个 all-plugin 的 agent 宿主——连模型适配器、工具注册表、会话日志与 agent 主循环本身都是插件，因此"扩展"默认意味着在旁边挂一个插件，而不是改主循环。

**五条轴各一句**：

- **A 仓库契约**：三层可寻址结构——根 `AGENTS.md` 只放常备命令（一条 1–3 行 + 链接其家）、子树文件只写差异、规则正文点名它的门禁；决策理由进 Agent Notes（生命周期编码在路径里，`## Alternatives considered` 由门禁强制）；42 个文档 leaf gate 由 `run-gates.ts` 聚合、进 CI。
- **B 技能**：运行时是"六根 rank 发现 + 最小 frontmatter + catalog 常驻（name + 500 字符 description）/ body 按名加载"的渐进披露；内容层是十部位模板（触发器式 description、"guidance, not a script"、sources-of-truth 外链、anti-pattern、输出契约、`references/` 按需）。**body 无上限**是它自己承认的风险。
- **C 运行时约束**：六层各自 fail-closed 的纵深（OS sandbox → 进程内 fs fence → tool pipeline → loop guard → context 预算 → 人类审批），每层违反都表达成**模型可读的确切 marker**；升级路径 10 跳，`allowed-once` 是唯一授权。
- **D 决策方式**：没有集中 planner；决策挂在 `agent/pre-step` / `agent/request-error` / `agent/turn-stopping` 三个接缝上，注入语义（`followup` / `steer` / `inject`）编码决策权归属。plan 与 todo 是**纯引导**，goal 与 approval 有真闸，委派四判据全部写在模型可见文本里。
- **E 组合架构**：capability seam 三角 + "注册是 effect" + 六级组合阶梯，每一级都有一个把"越过这一级"变成构建失败的 gate；架构图从声明生成并逐字节校验新鲜度。

**可提炼性结论**：可搬的是**载体结构与判据**（一条事实一个家、被拒替代必记、规则标注可校验性、陷阱准入判据、失败→动作对照表），需要一点工具的是**纪律性检查**（entrypoint 分类表、ratchet、生成物新鲜度、plane 检查），而所有**执行**（sandbox、审批瀑布、会话日志、goal 续轮、compaction、组合阶梯、Agent Teams）都留在宿主里——脱离宿主它们只剩口号。判定逐条见 §8.2（40 行）。

**对本仓库的结论**：**能补，但只补六条规则与一个落位契约**（§9.2），并明确列出不做清单（§9.3）。理由是本仓库没有工具链（68 个 Markdown，无 `package.json`、无 CI），DSH 式门禁只能作为**指南发给目标项目的 payload**；而凡是与 `.agents/skills/writing-for-agents` 重复的搬运都是 no-op，已删。（后续落地情况见上方「落地状态」。）

## 落地状态（2026-09-24）

本报告是提交时的快照；它的 §9 提案随后**部分**落地。报告用 P 编号、清单用 C 编号，对应关系：

| 提案 | 条目 | 状态 |
|---|---|---|
| P1 一条事实一个家 | `C42` | 已发货 |
| P2 决策记录保留被拒替代 | `C43` | 已发货 |
| P11 会漂移的事实写明复查条件 | `C44` | 已发货 |
| P9 被拦下时的升级纪律 | `C45` | 已发货 |
| P5 陷阱准入判据 | `C46` | 已发货 |
| P3 每条规则说得出"谁判它红" | ——（未编号） | 按选择不发：元规则，见 `docs/adr/0013` 的 `## Considered Options` |

- **发货形态**：目标项目 `AGENTS.md` 新增 `### Documents and decisions`（`C42`–`C44`）与 `### Toolchain` 追加一条（`C45`），`docs/agent-notes.md` 框架段一段（`C46`），外加 `docs/provenance.md` 的 `## What to re-check when upstream moves` 表（`C44` 的数据侧，同时是议题 #8 的"上游漂移清单"在目标项目的落点）。仓库侧的决定记在 `docs/adr/0013`；目标项目的第 5 份继承 ADR 暂缓。
- **验证**：改动是 `53d2a7e`，验证记录是 `35b822b`。`node e2e/coverage.mjs --self-check` 报 162 条发货行 / 73 个条目 / 13 个 ADR，九 profile 全矩阵 9/9 PASS（`e2e/record.mjs` 重写 `docs/verification.md`）。这五条**没有新增断言**：新项目无法"违反"到能被断言的程度，硬加只会造出"看起来有闸"的假绿；它们的机械保证只有"按形态发货、且没有未认领的文本"。
- **两处此后的更正**：§9.0 说本仓库"没有自己的 `scripts/`"已不成立——已有 `e2e/` 这套 harness（18 个在库文件；`package.json` 与 CI 仍然没有）；§9.6 写的"`GUIDE.md` 1109 行"是当时的快照，落地时已是 4,691 行。

## 0. 方法

**分工。** 报告由五条互不重叠的调研轴组成，每条由一名后台 agent 独立完成一手阅读，Lead 另做三件事：亲自读骨架文档（`docs/architecture.md`、`.agents/notes/README.md`、`docs/AGENTS.md`、`packages/AGENTS.md`、`AGENTS.md`、`docs/glossary.md`、`docs/postmortem/README.md`）用于交叉验证；把每份笔记的引用过一遍机器校验；独占撰写第 8、9 节（可提炼性判定与本仓库落点）。

| 轴 | 问题 | 笔记 |
|---|---|---|
| A | 仓库级 agent 操作契约：指令分层、Agent Notes、postmortem、门禁、写作标准 | `.scratch/dsh-research/A-repo-agent-contract.md` |
| B | 技能系统：发现→目录→调用→注入→上限，以及 14 个技能的解剖 | `.scratch/dsh-research/B-skills.md` |
| C | 运行时约束：沙箱、守卫、审批/升级、钩子、输出上限 | `.scratch/dsh-research/C-constraints-runtime.md` |
| D | 决策方式：plan / goal / todo / 委派 / 压缩 / 人机决策点 | `.scratch/dsh-research/D-decision-making.md` |
| E | 组合与扩展架构：capability seam、Cordis、生成物、不变量 | `.scratch/dsh-research/E-composition-architecture.md` |
| F | 面向模型的设计契约（Model Experience）：工具/prompt 怎么写给模型看 | 本报告 §6，Lead 亲自（无独立笔记） |

**验证。** 每份笔记的 `路径:行号` 引用由 `.scratch/dsh-research/verify-citations.py` 统一校验（140 条 DSH 引用全部解析成功；笔记内 500 条引用同样全部解析）；报告正文里带行号的关键断言，由 Lead 抽读原文复核（A/B/C/D/E 各抽 3–8 条，逐字比对）。区分两件事并分别标注：**代码里被执行的**（有脚本/测试/不变量为证）与**只在文档里被规定的**（是规范，不是强制）。

**关于那五份笔记。** 它们按本仓库惯例放在 `.scratch/dsh-research/`（该前缀被 `.gitignore` 排除，属本地研究草稿，与 `.scratch/facts/` 同级）。本报告**自足**：所有结论、数字与引用都已写进正文，笔记只是逐条考证的底稿。README 里"见 `X.md:12-34`"这类指向笔记的引用，在提交后的仓库里不可达——保留它是为了让复核者能回到草稿，而不是要求读者去读它。

**局限。** 只描述该快照；不预测 DSH 的演进方向。DSH 的多数机制是宿主运行时的行为，脱离宿主讨论其"运行性"没有意义——第 8 节因此把"机制本身"与"它背后的原则"分开判定。

## 1. 骨架：DSH 是什么

一句话：**DSH 是一个 all-plugin 的 agent 宿主**——连模型适配器、工具注册表、会话日志和 agent 主循环本身都是插件，因此"扩展"默认意味着"在旁边挂一个插件"，而不是改主循环（`docs/architecture.md:11-13`）。

对本报告重要的四条结构性事实：

1. **组合阶梯**：package → plugin → preset → bundle → profile → app。一次 `dsh` 启动是把有序层叠在空配置上组合出来的插件树；bundle 是配置行及其代码的分发格式，profile 命名一组 bundle，patch 按行 id 替换整条配置（`docs/architecture.md:15-29`）。"应用只能由具名 profile 启动"是**被门禁执行的**规则（`docs/architecture.md:43-49`，`scripts/verify-application-entrypoints.ts`）。
2. **循环与事件**：`step` = 一次模型请求 + 它触发的工具调用；`turn` = 零或多个 step；事件是扩展点，分三个域——会话事件（durable fact）、`agent/*`（活在 flight 的拦截）、capability 事件（给 seam 挂策略/适配器）（`docs/architecture.md:74-109`）。waterfall 监听器**必须**调用 `next()` 委托（`AGENTS.md:135`）。
3. **会话日志是唯一真相来源**：`deriveMessages()` 从日志投影模型历史；**"模型可见 ⟺ 已记录"**，并有运行时不变式断言；任何新的模型可见输入都必须新增一个会话事件（`docs/architecture.md:119-127`）。
4. **capability seam**：一个可替换能力由三个角色构成——Service Definition / Service Provider / Consumer，"缺一个角色就不叫 seam"（`docs/architecture.md:129-135`，`docs/glossary.md:7-9`）。

## 2. 轴 A：仓库级 agent 操作契约

DSH 的 agent 契约不是"一份大 prompt"，而是**三层可寻址结构**：根 `AGENTS.md` 只放"每次会话都要在场"的常备命令；子树 `AGENTS.md` 只放该子树的差异；**凡是能机器判定的约定，规则正文里写出它的门禁名**（`../deepseek-harness/scripts/run-gates.ts:23-41`）。

### 2.1 根 `AGENTS.md`：一条规则 = 一条理由链接

- 182 行、11 个章节：入场契约（`:1-3`）、版本与持久化状态（`:5-11`）、仓库布局（`:13-80`）、命令（`:82-106`）、沙箱失败纪律与证据选择（`:108-119`）、密钥（`:121-125`）、**34 条约定**（`:127-162`）、防御模式（`:164-166`）、类型与文档（`:168-174`）、自我编辑规则（`:176-178`）、vendor 政策（`:180-182`）。
- 每条约定 1–3 行、加粗领起、句尾括号给出理由的"家"：`**Registrations are effects**`（`:131`）、`**Waterfall listeners MUST call next()**`（`:135`）、`**Model-visible ⟺ logged**`（`:136`）、`**Plugins, not loop changes**`（`:137`）。42 条链接的落点分布：`docs/` 21、Agent Note 13、`packages/` 2、skills 2（`A-repo-agent-contract.md:32`）。
- 粒度是硬要求，不是风格：`docs/AGENTS.md:21` 规定根文件是 *"Standing orders: rules an agent needs in context in every session, one to three lines each, linking its home"*。
- **谁能机器判定、谁不能**：根文件点名门禁的只有 4 处（`verify-cordis-config` `:130`、`verify-client-ui-i18n` `:154`、`verify-export-jsdoc` `:170`、`verify-doc-budgets` `:178`）加两处本地检查（`git diff --cached --check` `:162`、CI 覆盖率门禁 `test:coverage` `:118`）；其余是陈述型，由测试与人工评审兜底——这是分工，不是遗漏，因为 "CI owns exhaustive coverage and the platform matrix"（`:117`）。同时"能机械判定"是**义务**：*"Wire mechanically checkable invariants into an executed top-level gate and prove each changed acceptance path rejects an invalid case."*（`:172`）。
- **自我编辑规则**（`:176-178`）三条：`CLAUDE.md` 是符号链接，改真文件；规则自足但必须外链深层理由；先压缩、确无空间才抬 `verify-doc-budgets` 的 ceiling。
- 多宿主共用一份真源：4 个 `CLAUDE.md` 都是同目录 `AGENTS.md` 的符号链接，`.claude/skills -> ../.agents/skills` 让 Claude Code 直接读同一套 skill（`A-repo-agent-contract.md:51`）。
- 加载语义有回归夹具：`snapshots/session/agent-instructions/` 把候选文件名（`AGENTS.md`/`CLAUDE.md`，本地覆盖 `*.local.md`）、`<system-reminder>` 注入形态、以及 **"More specific instructions take precedence over broader ones"** 都钉在录制的 session 里（`snapshots/session/agent-instructions/session.v3.jsonl:11`）。

### 2.2 分层与嵌套：只在差异存在处建文件

全仓 21 个指令文件（实测行数见 `A-repo-agent-contract.md:59-78`）。四个可复制特征：

1. **每个子树文件开头声明与上级的关系**，不重复上级：*"supplement the repo-wide conventions"*（`packages/AGENTS.md:3`）。
2. **只在差异真实存在处建文件**：约 80 个包只对应 6 个包区文件（`packages/` 加 `client`/`web`/`experimental`/`schedule`），其余靠根文件。
3. **子树写法可以升级**：`packages/client/AGENTS.md`（156 行）从 bullet 清单升级为 H2 分节 + 编号规则 + checklist，因为该栈有强制的注册面/依赖面清单（`:136-156`）。
4. 但预算只覆盖 manifest 里 8 个文件（`scripts/doc-budgets.manifest.json:1-10`），所以"subtree `AGENTS.md` ≤ 600"对多数子树是**声明而非门禁**（`docs/AGENTS.md:58`）。

### 2.3 Agent Notes：决策记录的完整生命周期

- **是什么**：*"records a decision or proposal that affects this codebase — the why and what we gave up, the parts code and docs can't carry"*（`.agents/notes/README.md:5`）。
- **何时必需**：*"in the same PR only for lasting decision rationale that code, tests, and existing documentation do not explain"*（`:46`）；机械/局部改动豁免（`:48`）；改已有 owner note 即满足要求，不得新建重复；**每条新 note 触发取代检查**，同一 PR 内归档被完全取代的 implemented 三元组（`.agents/notes/AGENTS.md:5`）。
- **路径即状态**：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`（`:9`）；lifecycle 三类 `proposed/`/`implemented/`/`rejected/`，class 是闭集六种（`:25-32`，常量在 `scripts/agent-note-tree.ts:19`）；日期是"首次提出"日；note 互引必须用相对链接以便机器校验（`:17`）；**禁止中心化索引**，门禁对 `INDEX.md` 直接报错（`scripts/agent-note-tree.ts:47-50`）。
- **格式由门禁逐行校验**：头部三行 + `Status:` 必须与所在目录一致（`:60-73`）；正文首节必须是 `## Problem`（`:78`）；implemented 的骨架是 Decision / Consequences，且**禁止提案期措辞**（`## Proposal`/`## Plan`/`## Acceptance criteria` 被 gate 拒绝，`:103`）。
- **`## Alternatives considered` 是强制的**，理由原文：*"A decision recorded without what it beat invites re-litigation — the failure Agent Notes exist to prevent."*（`:111`）。
- **归档 = 封存**：只允许四件事（移动完整三文件、插入同一行 `Archived:`、重录 sidecar、修复入链，`:40`）；封存后永久冻结且 *"do not treat it as authority for current behavior"*（`:42`）；`manifest.json` 记 1917 个 sha256 条目，验证器拒绝丢失/哈希变化/三元组不完整（`scripts/archived-agent-notes.ts:165-183`）。
- **规模实测**：活跃 538（proposed 39 / implemented 485 / rejected 14），冻结 639；implemented 中 `architecture` 185、`feature` 123、`process` 67（`A-repo-agent-contract.md:121-132`）。**冻结多于活跃**——这套机制的真实成本在"维持 implemented note 与现实同步"（`.agents/notes/implemented/AGENTS.md:5-7`）。

### 2.4 门禁：一条文档规则如何变成可执行检查

- **调度**：`pnpm run doc-sync` → `run-gates.ts` 聚合 **42 个 leaf gate**；`test:docs`（`doc-quick`）只取 `quick: true` 的 20 个、不含 build；两者都进 CI（`scripts/run-gates.ts:381-384`、`:479-489`、`:845-847`）。口径要小心：`scripts/verify-*` 文件共 69 个（含 27 个 `.spec.ts`），**非 spec 的门禁脚本也是 42 个，但与 doc-sync 的 42 个 leaf gate 不是同一批**（`A-repo-agent-contract.md:343`）。本地 hook 刻意很窄：pre-commit 只做 staged 的 lint/whitespace/vendor 五项，pre-push 只跑 typecheck（`lefthook.yml:5-38`、`:52-55`）。
- **"规则 → 门禁"的四种耦合**：① 规则正文内联门禁名（`docs/AGENTS.md:41` 的 `(verify-md-wrap)`、`:50` 的 `pnpm run verify-doc-budgets`）；② 允许清单必须带理由且**拒绝陈旧条目**（`scripts/verify-subsystem-pages.ts:80-84`）；③ **门禁自证不空转**——要求发现语料非空，否则报错（`scripts/AGENTS.md:3`、`scripts/verify-concrete-terms.ts:55-61`）；④ 门禁自己有测试，反向推导清单是否仍成立（`scripts/doc-standard.spec.ts:335-342`、`:385-395`）。
- **`change-scope` 是有意的非门禁**：`pnpm run change-scope --base <ref>` 只把"这次改动到底碰了什么"变成可引用的事实，不判定对错，供 `dsh-pre-push-checks` 选证据（`scripts/change-scope.ts:12-30`、`.agents/skills/dsh-pre-push-checks/SKILL.md:19-25`）。

### 2.5 写作约定里最硬的三条

- **tier 表**：`docs/AGENTS.md:19-33` 用 13 行定义"一条事实一个家"（根 AGENTS.md / 子树 AGENTS.md / architecture / subsystems / Agent Notes / postmortem / persistence history / cookbook / user docs / package README / 生成物 / skills），每行同时写"不属于这里的内容"。
- **散文标准**：current-state（历史留在 commit/PR/note/postmortem，`docs/AGENTS.md:39`）；一段一物理行（`:41`）；围栏 `ts` 必须能编译（`:42`）；**直接命名 actor 与事实**——注意它把"gate""vocabulary""surface"都列为要替换的隐喻（`:46`）；slop 清单 9 条（`:62-72`）。
- **字数预算**：ceiling 在 manifest（8 条），门禁同时拒绝"超预算"和"预算文件消失"（`scripts/verify-doc-budgets.ts:36`、`:42`）；变红时的固定顺序是 **Relocate → Condense → Raise**，抬 ceiling 要在 PR 里辩护（`docs/AGENTS.md:52-56`）。

### 2.6 值得抄的"诚实"：自陈极限与实测漂移

DSH 的门禁文档自己写明绿了什么、没证什么：

- 双语配对门禁：*"a green gate means the pair was confirmed consistent at these exact contents, **not that the confirmation was sound**"*（`docs/i18n/README.md:40`）。
- `verify-skill-invocation-metadata` 只在存在 `agents/openai.yaml` 的目录上生效，而该文件被 gitignore → 仓库内 0 命中，**CI 上空转**（`scripts/verify-skill-invocation-metadata.ts:31-38`，见 §3.3）。
- 实测漂移：根文件说 `CLAUDE.md` 链接"root and `packages/`"，实际有 4 处；`docs/AGENTS.md:58` 要求"至少保留 5% 余量"，而实测 8 个受预算文件里除 `defensive-patterns.md` 外余量 0–4.4%，`architecture.md` 与 `cordis-primer.md` 恰好顶格（`A-repo-agent-contract.md:224-225`、`:339-341`）。

这三条不是缺陷本身，而是**规则与现实可被复核的证据**——一个把规则写成可验证断言、并允许读者发现漂移的仓库。

## 3. 轴 B：技能系统

DSH 里 "skill" 是两件事（`docs/subsystems/skills.md:5`，`packages/skill/skill/README.md:12`）：

- **运行时能力族**：`dsh-skill`（Service Definition，`ctx.skills`）、`dsh-skill-filesystem` 等 provider、`dsh-tool-skill`（Consumer：发布目录 + 暴露 `skill` 工具）。
- **内容文件**：仓库自有的 14 个 `.agents/skills/<name>/SKILL.md`。本地 provider 默认把 `<projectRoot>/.agents/skills` 当作 rank 200 的扫描根（`packages/skill/skill-filesystem/src/index.ts:251`），所以同一份内容既被 DSH 读，也被 `../deepseek-harness/.claude/skills` symlink 给 Claude Code 读（`.agents/skills/.gitignore:1`）。

### 3.1 运行时设计

- **发现**：六个 rank 的扫描根（project `.dsh` 100 → project `.agents` 200 → custom 300 → user `.dsh` 400 → `~/.agents` 500 → bundled 600，`packages/skill/skill-filesystem/src/index.ts:245-265`）；每个根**只列一层**——`<name>/SKILL.md` 或 `<name>.md`，递归 `**/SKILL.md` 被明确拒绝（同文件 `:723-751`；理由见 `.agents/notes/archived/feature/2026-07-05-skill-system.md:46`）。没有内建 system skill。
- **schema 最小**：必需 `name`（kebab-case）+ `description`（非空）；可选 `whenToUse`、`metadata`，以及调用策略 `disable-model-invocation` / `user-invocable`（`packages/skill/skill-filesystem/src/index.ts:797-840`、`:1000-1010`）。策略值解析**fail closed**——不认识的值抛错、整条丢弃，因为"忽略它等于默认放行"（`.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.md:19`）。旧 camel-case 拼写直接报错（`:1012-1016`）。
- **校验姿态分两级**：文件级 **warn-and-skip**（坏文件绝不打断所有请求，`:807-828`）；provider 契约级 **fail fast**（`candidate.provider !== providerName` 抛错，`packages/skill/skill/src/index.ts:707-739`）。代价被明写：模型分不清"没有这个 skill"和"这个 skill 非法"（`packages/skill/skill-filesystem/README.md:150`）。
- **进上下文的方式**：常驻的只有 catalog——`agent/pre-step` 里发布的一条 durable user-role `<system-reminder>`，形如 `<available_skills>` 列表，**只含 name 与截断后的 description**，并附两条行为指令（命中就用 `skill` 工具加载；加载前不要推断或执行 skill 指令）（`packages/skill/tool-skill/src/index.ts:213-277`、`:266`）。body 由模型调 `skill({name})`（tool result）或人的 `/name` 手势（injected instructions）触发，两条路径共用同一个 `renderSkillContent()`，因此模型永远看到同一种形状（`packages/skill/skill/src/index.ts:170-183`）。二级披露靠 `<skill_resources>`：只给 provider base 与"只在需要时加载被引用资源"，harness 既不枚举也不抓取（`packages/skill/tool-skill/README.md:245`）。
- **预算**：唯一的截断是 catalog description（默认 500 字符，`:27`、`:391-394`）；**body 无大小上限**，是写进 Known Limitations 的已知风险（`packages/skill/tool-skill/README.md:244`）。catalog 无条数上限，token 成本随 skill 数与上限线性增长（`:132`）。catalog 变化时**整表替换**（`:247`），incomplete 时**完全不发**、保留 last-good（`packages/skill/tool-skill/src/index.ts:225`）。

### 3.2 内容层解剖（从 14 个真实 skill 归纳）

十个部位，按出现顺序（`B-skills.md:231-246` 逐条给了出处）：

1. frontmatter：`name` + 一句话 description，写成"读者何时该打开我"，多数以 `Use when` / `Use before` 开头并补第二次触发条件与排除；
2. H1 任务名；
3. 开场定位段：这是什么判断的 owner、**"guidance, not a script/checklist"** 式的范围免责、相邻 owner 链接；
4. `Sources of truth` 外链清单（`dsh-code-review:10-20` 是标准形态）；
5. 主体：procedural（编号步骤 + 可复制命令）或 declarative（粗体 lead 的规则 bullet）；
6. 决策表 / triage（`dsh-client-ui-ux:27-32` 按消息寿命选 feedback surface；`dsh-speed-up-perf:37-47` 的 measurement card）；
7. anti-pattern / 拒绝清单（`dsh-ci-test-reliability:104-112` 的 7 条 flake-masking 禁止项）；
8. 输出契约（`dsh-code-review:53`：defect / location / impact / evidence，blocker 与 suggestion 分离）；
9. 该跑哪些 gate（`dsh-doc:116-127`）；
10. 支持文件指针：`references/`（校准例子，按需加载）、`templates/`、`scripts/`（可执行件下沉，SKILL.md 只留命令行与行为契约）。

"范围免责"不是自觉，是写进标准的：`dsh-prose-standard:56` 要求 *"Skills and agent instructions: state behavioral guardrails and explicit scope limitations such as 'guidance, not a script/checklist.' Keep the workflow concise and link its source of truth."* —— 7 个 skill 在正文开头照此声明自己是 guidance（`B-skills.md:207`）。

### 3.3 强制力：哪些是真门禁

- `verify-md-links` / `verify-mermaid` 把 `.agents/skills/**/*.md` 纳入断链检查（`scripts/verify-md-links.ts:28`）。
- `scripts/doc-standard.spec.ts:299-345` 用测试**钉住** `dsh-doc` 的内容（6 个文件不得出现 `prototype` 字样、必须链接参考示例、`templates/*.md` 必须与 `KIND_TEMPLATES` 一一对应）。
- `verify-skill-invocation-metadata` 只扫**存在** `agents/openai.yaml` 的目录（`scripts/verify-skill-invocation-metadata.ts:31-38`）；该文件被 gitignore，所以仓库内 **0 个目录命中**——这条门禁在 CI 上是空转的，只在 Codex 用户本地生效（`B-skills.md:223`）。**这是本报告要保留的一个教训：门禁的覆盖范围本身要被检查，否则"有门禁"和"被门禁覆盖"是两件事。**
- wordcount budget **不覆盖 skills**：`scripts/doc-budgets.manifest.json` 只列 8 个 standing doc；skill 长度靠 review 治理（`docs/AGENTS.md:58`）。skill 侧唯一硬上限是 catalog description 的 500 字符。

### 3.4 DSH 自己承认的成本

body 无上限可吃掉下一轮大量上下文；catalog 整表替换按目录规模付 token；同名遮蔽不可见（同 layer first-wins 只记日志，跨 layer 静默覆盖，没有 API 查看被遮蔽者，`packages/skill/skill/README.md:141`）；registry 无 TTL，失效必须由 provider 自己的观测驱动（`:138`）；发现只有一层，嵌套 skill 树与包清单被忽略（`packages/skill/skill-filesystem/README.md:148`）；skill 之间的 overlap 靠"one home per fact"（`docs/AGENTS.md:17`）这类归属规则治理，**没有**运行时去重或冲突检测（只按 name 去重）。

## 4. 轴 C：运行时约束

一句话：DSH 的边界不是单一"安全内核"，而是**多条各自 fail-closed 的 capability seam 叠成的纵深**；每一层的违反都被刻意表达成**结构化、模型可读的 marker**，而不是静默失败（`../deepseek-harness/packages/shell/tool-bash/src/index.ts:105`）。

### 4.1 分层

| 层 | 约束什么 | 谁拥有 | 违反如何上浮 |
|---|---|---|---|
| process sandbox（OS 级） | 被封装子进程及其后代的**文件写效果**；network / process visibility 明确不在词汇表内 | `ctx.sandbox` seam + `dsh-sandbox-local`（bwrap / Landlock / Seatbelt / Windows ACL） | 后端 dialect 的 stderr 签名被判为 `denied`；runner 自身失败抛 `SandboxUnavailableError` |
| filesystem fence（进程内） | `write`/`edit` 目标是否落在 writable roots 内；读一律放行 | `dsh-fs-sandbox` + `dsh-sandbox-policy` | `FS_SANDBOX_DENIED` → tool 层映射成同一个 `[sandbox: …]` marker + 升级提示（`packages/fs/tool-fs/src/sandbox.ts:130`） |
| tool（单次调用） | 这次调用能否执行：pre-execute 策略（allow/deny/cancel/ask）+ monotonic guard + 参数/输出 schema | `ctx.tools` | deny → `{ isError: true, content: [Error: <reason>], error.info.code }`（`packages/core/tools/src/index.ts:1520`）；ask 未拿到 `allowed-once` 一律 deny（`:1750`） |
| loop（时序/预算） | 单次调用 wall-clock、重复同一调用 | `packages/guard/`（默认随 base bundle 启用） | timeout → `TOOL_TIMEOUT`；repeat → 注入 reminder（**不 veto**） |
| context（输入/输出预算） | 单条结果 token/byte 预算、整段 history 的窗口占用 | `dsh-spill-policy`、`dsh-compaction-basic`、各 tool 自带 cap | spill → head/tail 预览 + locator；compaction → surface replace 成一条 summary；cap → 显式 `[result truncated]` |
| human（审批） | 一次具体动作是否放行（sandbox 升级、hook 的 ask） | `ctx.approval` + UI/ACP answerer | 闭集 outcome，`allowed-once` 之外全部 deny |

（完整表见 `C-constraints-runtime.md:18-25`。）

### 4.2 guard：只给 deny，不给 allow

- `repeat-tool-reminder` 观察精确重复的调用（阈值默认 `[3,5,8]`），**只提醒不否决**；误配置在 load 时 throw，不做静默兜底（`packages/guard/repeat-tool-reminder/src/index.ts:53`、`:137`）。它挂在 `tools/post-execute`，**被 deny 的调用也会收到提醒**——"模型猛敲被拒调用"正是要打断的 loop（`:220`）。
- `timeout-policy` 是协作式 deadline：临时替换 `exec.signal` 再还原，只有自己的 timer 赢了才把结果换成 `TOOL_TIMEOUT`；未声明 `timeoutMs` 的工具不设 deadline（`packages/guard/timeout-policy/src/index.ts:29`、`:56`）。
- **monotonic ToolGuard**：返回 reason 即拒绝，返回 `undefined` 保持现状——**返回值刻意没有 allow**，所以 listener 顺序不可能把 denial 变回 permission；同 scope 取"第一个 denial"（`packages/core/tools/src/index.ts:730`、`:766`，`docs/subsystems/tools.md:325`）。

### 4.3 sandbox：per-call policy + 后端方言

- `SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'`，**只治理文件效果**（`packages/sandbox/sandbox/src/index.ts:29`）。policy 是 per-call 参数（mode + 绝对 workspaceRoot + 可选 sessionId），不是 provider 的全局状态，因此"bash 只读而某个子 agent 能写自己的 state 目录"可以同时成立；升级重试 = 带更宽 policy 的**新调用**（`:62`）。
- 优先级：获批的显式 mode > session 最后一条 `sandbox/mode` 事件 > 部署默认（默认 `read-only`，fail-safe）（`packages/sandbox/sandbox-policy/src/index.ts:164`）。
- enforcement 是**被报告的事实**：`full` = 后端治理了 mode 承诺的每个文件效果，`partial` = 只有子集（旧 Landlock ABI、Windows ACL 阶梯）（`packages/sandbox/sandbox/src/index.ts:54`）。
- **denial 方言逐后端不同，consumer 只匹配本后端签名**（bwrap `read-only file system`、landlock `permission denied`、seatbelt `operation not permitted`、windows-acl 四条）：合成跨后端 union 会声称某后端永不会产生的 denial（`packages/sandbox/sandbox-local/src/index.ts:207`）。分类优先级是 **runner 失败 > denial**，因为"runner 失败 = 命令根本没跑，denial = confinement 生效并挡住了"（`packages/shell/bash-sandbox/src/index.ts:120`）。

### 4.4 升级路径（被拒 → 模型看到什么 → 怎么问 → 谁答 → 记录什么）

1. 内核/fence 拒绝 → 2. consumer 排除 runner 自身失败后归因 → 3. 模型看到确切 marker `[sandbox: file access denied under <mode> mode]` 与升级提示 `[sandbox: escalation available — retry this exact <subject> once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`（`packages/sandbox/sandbox/src/escalation.ts:71`、`:84`）→ 4. 模型在**同一 turn** 重试**同一条**命令一次，带最小更宽 mode 与非空 justification → 5. 执行期按该次 call 的 effective mode 重新判"是否严格更宽"，不是则 throw（**不依赖 schema enum**，`:159`）→ 6. 经 `ctx.approval.request()` 问人 → 7. `approval/asked` + `approval/decided` 成对落盘（log-only，不进 transcript）→ 8. UI answerer 或 ACP one-shot 机器策略作答，`never` 策略在 waterfall 之前就返回 `rejected` → 9. `allowed-once` 只对这一次调用生效 → 10. 被拒的 escalation 对该命令是终局，但不禁止之后其它命令；若 session 声明 approval prompts disabled，**denial 就是终局**（`packages/shell/tool-bash/src/index.ts:109`、`:115`、`:118`）。

（逐跳引用见 `C-constraints-runtime.md:215-230`。）

### 4.5 approval 的 fail-closed 是"服务内部"的

`ApprovalOutcome` 是闭集 `allowed-once | rejected | cancelled | unavailable`，只有 `allowed-once` 是授权；answerer **缺失 / 非 owner / 抛错 / 返回非词表值**都归一为 `unavailable`——"rather than opening the gate"（`docs/subsystems/approval.md:21-29`）。`never` 策略在**服务内部、瀑布分发之前**直接返回 `rejected`，所以后注册的 answerer 即使 `prepend` 也无法绕过（`:33`、`:86`）。提问**故意不带 tool arguments**：answerer 靠 `callId` 把提示挂到已经流式展示过的 tool call 上，避免渲染第二份会漂移的副本（`:53`）。策略切换用 `systemPrompt.context()` 追加 cache-safe 快照，不改写稳定 system prompt 前缀（`packages/interaction/user-approval/src/index.ts:162`）。

### 4.6 hooks：桥接的边界写得很清楚

hook 复用 Claude Code / Codex 的 `hooks.json` command hook（`SessionStart`/`UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`Stop`/`SubagentStart|Stop`），**取最严 outcome 合并**（`deny > ask > allow`，`packages/hooks/hook-protocol/src/merge.ts:3`）：`PreToolUse` 的 deny 拒绝调用、`PostToolUse` 的 deny 把纠正反馈变成 error result、blocking 的 `Stop` 反向**强制继续**（`agent.steer()` 注入一条 user message）（`packages/hooks/hooks-claude-code/src/index.ts:244`、`:257`、`:278`）。**input rewrite 不支持**——`updatedInput` 只被解析、记日志并 warn（"not yet honored"）（`packages/hooks/hook-protocol/src/types.ts:131`）。已知缺口（代码内 TODO）：`continue:false` 的 run-level halt 未接上、Stop hook 连续强制继续**没有上限保护**——这是 loop guard 之外当前真实存在的 runaway 风险面（`packages/hooks/hooks-claude-code/src/index.ts:195`、`:275`）。

### 4.7 无界输入如何被 bound

- **spill**：超预算结果落盘，替换为 head + `[...]` + tail + notice（含 locator 与 retrieval hint），head/tail 各得一半预算，图片不切分（`packages/spill/spill-policy/src/index.ts:103`、`src/retention.ts:48`）。取舍是 **best-effort**：没有 spillStore、notice 超预算、无 session owner 等任何失败都只 warn 并保留 inline，**绝不把一次成功调用变成 error**（`:127`）。存储侧是安全属性：私有 0700 root、session 子目录、`open(path,'wx',0o600)` 独占写（`docs/subsystems/spill.md:92`）。
- **per-tool cap 是硬要求**：`packages/AGENTS.md:16` 要求把 byte/token/item/time 上限加在**完整产出**（含包装与元数据）上，并"test tiny and exact limits, oversized single chunks, and multibyte byte limits"。
- **compaction**：`pressure` / `context-overflow` 两种触发，默认 `thresholdRatio 0.8`、`retainRatio 0.16`、`headroom/maxTokens 65536`；锁括住整个操作（start 最先、end 最后），使中途 crash 留下"可检测的 orphaned lock"而不是假称完成；摘要作为**一条** `user/message` 替换被遮蔽区间，是 summary compaction 唯一的 surface mutation（`packages/compaction/compaction-basic/src/config.ts:20`、`docs/subsystems/compaction.md:11`、`:19`）。
- **invariants**：只在"独立观测会发散"时发布 `./invariant`；空 installer、检查 service 是否存在、插件元数据、固定示例都是 invalid；省略必须在 README 写明原因，`verify-package-invariants` 拒绝"省略了 companion 却留着陈旧 wiring"（`AGENTS.md:132`、`packages/AGENTS.md:19`、`packages/runtime-diagnostics/invariants/README.md:107`）。

### 4.8 明确不保护（seam 自陈）

- SAFETY.md：DSH 是实验性 developer preview、**未做安全审计**；"Sandboxing, approval prompts, and permission controls can reduce risk, but they do not guarantee isolation or prevent damage"（`SAFETY.md:7`、`:13`）。
- policy 词汇**只有文件效果**：network / process / syscall / device / credential 全不在其中；只做 **same-world** confinement，要隔离环境得替换整个 capability（container/microVM/remote）（`packages/sandbox/sandbox/README.md:167-168`）。
- denial 报告是 **stderr dialect**，不是 typed runtime denial channel；runner 诊断是 **in-band**——被 confine 的子进程可以故意模仿 runner 的 gated fatal line 造成误判（**不能**绕过 confinement）（`:169-170`）。
- 进程内 fs fence 是 containment 而非 security boundary，有残余 TOCTOU；内核级隔离 unconfined code 是 `ctx.shell` 的职责（`packages/fs/fs-sandbox/src/index.ts:10`、`:15`）。
- 两篇 postmortem 的教训值得单列：**"Permission controls must describe only the capabilities they actually govern"**（权限预设能改运行时 approval/sandbox，**不能** mount/unmount filesystem 栈，`docs/postmortem/0002-…:47`）；**"a shared prefix is not a protocol"**（informational 与 fatal 诊断可能共享命名空间，排除要 exact 且窄，未知一律 fail-closed，`docs/postmortem/0004-…:52`）。

### 4.9 host 侧纪律（跨项目最直接可用的一条）

root `AGENTS.md:110`：若必需的 `gh`/`pnpm`/build/test/generator 命令因 sandbox 阻断 credentials、network、IPC、watching 或 nested `sandbox-exec` 而失败，就用**最窄的 host escalation 原样重试**；要求 sandbox evidence；**绝不**绕过测试失败或产品 sandbox。

## 5. 轴 D：决策方式

### 5.1 没有集中 planner：决策挂在固定接缝上

- 三个决策型扩展点：`agent/pre-step`（reject 或替换进入本步的消息）、`agent/request-error`（监听器返回 `{ kind: 'retry' }`）、`agent/turn-stopping`（在"本可结束的 turn"关闭前 steer 使其继续）（`packages/core/agent/README.md:67`）。
- 三种注入语义编码了**决策权归属**：`followup()` 排队下一 turn 并唤醒 driver、`steer()` 提交 next-step 输入并唤醒、`inject()` 只加模型可见上下文**而不唤醒**（`packages/core/agent/README.md:47`）。
- 状态一律是 **whole-value snapshot + last-write-wins**，写在可重放的日志里（`plan/mode`、`todo/write`、`goal/change`、`team/task`、`permission/preset`），没有增量协议（`packages/session/session-projection/README.md:54`）。

### 5.2 决策分类表

| 决策 | 机制 | 发起者 | 强度 | 记录 |
|---|---|---|---|---|
| plan | `plan:policy` prompt section + `exit_plan_mode` + `/plan` + `plan` 投影 | 人开模式 / 模型提交 / 人审批 | **【文】**：read-only 意图完全不 gate（"Guidance, not enforcement"，`packages/plan/plan-mode/README.md:32`、`:185`）；**【码】**只在 exit 工具自身（`#` 标题、必须激活、必须有问答通道，`src/index.ts:298-307`） | log-only 整值事件 `plan/mode`；plan 正文留在 tool call 记录 |
| goal | `ctx.goals` + `goal/change` 快照 + round driver | 创建/编辑/pause/resume 需**人直接请求**；complete/blocked 也接受确切 goal 轮次；续轮由 harness | **【码】**权威（roots + 本 turn `source.kind==='user'`，`tool-goal/src/authority.ts:80-103`）、blocked 最小轮数 3（`src/index.ts:313-320`）、模型不能 resume paused goal（`:287-293`） | `goal/change`（整快照/墓碑）+ 进程内 activation |
| todo | `todo_write` 整表替换 + `todos` 投影 | 模型 | **【文】**：纪律全在 description；**【码】**只有非空/去重/`in_progress` 计数/必须有 session；**无 staleness 提醒** | `todo/write` 全量快照，turn/start 清空 |
| delegate | subagent / fork / workflow / 控制三件套 | 模型（workflow、team 要求用户显式请求） | **【码】**深度 1、活跃子代理 8、workflow caps 与 fatal 语义 | `subagent/catalog`、`descriptor`（log-only）、workflow 记录 |
| compact | `ctx.compaction` + `compaction-basic` | harness（压力/溢出）/ 人（`/compact`） | **【码】**锁、区间必须 balanced、摘要必须变小、失败保留既有 surface | `compaction/start\|summary\|end`（log-only）+ 一条 `replace` |
| ask human | `ask_user_question` + `ctx.userQuestions` | 模型 | **【码】**只有 runtime root 能问，子代理拿到 `DELEGATED_CALLER`；**【文】**"只在无法通过检查解决的用户决策/实质歧义时问" | tool call/result |
| escalate permission | `ctx.approval` + preset + sandbox | 工具/harness 触发，人回答 | **【码】**闭集、fail-closed、`never` 服务内短路 | `approval/asked`+`decided`（log-only） |
| defer to background | jobs / schedule / 后台 subagent | 模型起；harness 通知/唤醒/到期 | **【码】**wait clamp、wake 预算、`session-local`；**【文】**"不要 busy-poll" | `agent/inbox/*` + 通知消息 |

（表与出处见 `D-decision-making.md:270-281`。）

### 5.3 委派决策：四条判据都写在模型可见文本里

**上下文决定 fresh vs fork**：fresh 子代理的 prompt 要求 *"complete, standalone prompt: it does not see this conversation."*；fork 则 *"a child agent seeded with all completed turns so far (it does not see the current in-flight turn)"*（`packages/subagent/tool-subagent/src/index.ts:266-276`）。fork 的 seed 边界是**父的最后一次已完成 turn**，一次性快照（`packages/subagent/subagent-fork-in-process/README.md:12`、`:145`）。
**规模与用户措辞决定 subagent vs workflow**：*"Use the workflow tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration … For one or two delegations, prefer plain subagent calls."*（`packages/workflow/tool-workflow/src/index.ts:335`）。
**协作持久性决定 subagent vs teammate**：teammate 具名、durable、可寻址、有共享任务板与 durable mailbox；"create teammates only when the user explicitly asks"（`packages/experimental/tool-agent-team/src/index.ts:31`）。
**是否阻塞决定前台 vs 后台**：默认后台，只有"下一步动作依赖该结果"才前台（`packages/subagent/tool-subagent/src/index.ts:604`）。

一句话：*上下文决定 fresh/fork，规模与用户措辞决定 subagent/workflow，协作持久性决定 teammate，是否阻塞决定前后台*（`D-decision-making.md:293`）。

### 5.4 Agent Teams 的关键设计（实验性）

任务板支持 `blockedBy` 依赖与 `writeScopes`；每次变更都是 **compare-and-set**，基于过期副本的更新被拒绝（`packages/experimental/agent-team/README.md:75-77`）。但 **write scope 是 advisory 而非锁**："`writeScopes` are normalized advisory path prefixes rather than locks."，重叠"produce warnings … they never block anything"（`docs/subsystems/agent-team.md:58`、`packages/experimental/agent-team/README.md:79`）。消息是 durable mailbox：*"Messages are never lost and never delivered twice"*（进程内保证），投递一律用 Steer，且 *"A queued message is already safely stored, so it must not be resent."*（`:69-71`）。`wait_agent` 只观察注册之后发生的一次变化、**不会唤醒任何成员**，无事可等时立刻 `noProgress`（`packages/experimental/tool-agent-team/README.md:61`）。

### 5.5 上下文与记忆的三个决策

- **compaction 的摘要有固定 8 节**（Primary Request and Intent / Key Technical Concepts / Files and Code / Errors and Fixes / Pending Jobs / Current Work / Next Step / Critical Context），要求"保留精确路径、命令、错误串、标识符、数值"，且**不得提及压缩这件事**；前言要求 *"Treat the captured context as established background and build on it without restating it … without acknowledging this checkpoint."*（`packages/compaction/compaction-basic/README.md:167-173`、`:196-225`）。
- **指令文件（AGENTS.md/CLAUDE.md）有显式字节预算**（base bundle 65,536 字节）：超预算时**先丢更宽的整文件，最后才截断最具体的文件**，并输出可见的 budget notice；发现机制是"只有成功的 read/write/edit 触达更深目录后才注入新范围指令"，**没有 watcher**（`packages/context/agent-instructions/README.md:72`、`:102`）。
- 指令内容里的 `</system-reminder>` 会被转义——仓库文本无法关闭 harness 自己的框架（`:106`）。

### 5.6 文档与代码的鸿沟（必须明说）

`D-decision-making.md:324-332` 逐条列出"只在文档/提示词、代码不强制"的地方，其中四条对"能不能提炼"很关键：

- plan mode 的"只读"是纯文本（README 自陈 `Guidance, not enforcement`）；
- goal 的两处是**模型判断**："请求是否重大"、blocker 是否"同一条件持续"——执行期只数轮数（`packages/goal/tool-goal/README.md:149-150`）；
- todo 的全部状态纪律只有 description，**没有任何提醒器或校验**；
- 团队的 write scope 与"先协调再写"是 advisory——"coordination, not confinement"（`docs/subsystems/agent-team.md:58`）。

这条鸿沟本身是设计要求：**advisory 讲意图，gate 只校验可机械验证的前提**（`D-decision-making.md:300`）。

## 6. 轴 E：组合与扩展架构

### 6.1 "无特权 core" 的声明与它真实的样子

- 声明：产品的每一部分都是插件（含 model adapter、tool registry、session log 与 agent loop 本身），因此每一部分都能从配置替换；"没有需要打补丁的特权 core"（`docs/architecture.md:11-13`）。
- 实际接缝是 **service 而不是 import**：`dsh-agent` 提供 `ctx.agents` 与 `Agent` handle，在 driver 注册 factory 之前保持惰性；`dsh-agent-loop` 是唯一的具体 driver，把自己注册为 `AgentFactory`，"consumers 从不 import 本 package"（`packages/core/agent/README.md:28`、`packages/core/agent-loop/README.md:89`）。
- **但这条规则没有 import 方向的 lint**：`capability-seams.md` 只是把 `ctx.agentLoop` 标成 `bundle` 并写明"extension 依赖 agent 的 events 与 services，而不是依赖本 package"（`docs/capability-seams.md:628`）。区分"文档声明"与"机械强制"在这里是必须的（`E-composition-architecture.md:20`）。

### 6.2 capability seam 三角与它的机械守卫

seam = 可替换能力，必须同时有三个角色：**Service Definition**（拥有 `ctx.<key>` 的 Cordis `Service`——抽象类或具体 registry，**绝不是 TS interface**）、一个或多个 **Provider**、一个或多个 **Consumer**；"一个 package 可以承担多个角色，但单独一个角色不是 seam"（`docs/glossary.md:9`、`docs/architecture.md:131`）。

守卫是真的：`scripts/gen-doc-graphs.ts` 的 `assertServiceRolesComplete()` 做**双向**检查——"被发现但未分类"记入 `missing`，"被分类但已不存在"记入 `stale`，任一非空即 throw（`:872-882`）。判据是"分类表 vs 声明集合"，不是语义推断。另有两条例诱规则抑制"为单消费者造 seam"：*"Design Service Definitions for all current Consumers"*（不要让一个 Consumer 决定 service contract）与 *"Require a current owner and need"*（`packages/AGENTS.md:10-11`）。

### 6.3 为什么"注册是 effect"是结构规则

三条互相咬合的机制让它不是风格问题（`E-composition-architecture.md:84-88`）：

1. **HMR 按配置重载 plugin 树**：不返回 disposer 的注册会在 reload 后残留，直接破坏"命令式挂载 + 声明式重载"的前提（`docs/architecture.md:29`）。
2. **vendored Cordis 做了 reentrant disposal 加固**：effect 的 owner-list wrapper 在 setup body 运行前注册，owner 处于 `UNLOADING` 时拒绝创建 effect（`vendor/README.md:38`）。
3. **registry 唯一性**：同 package name 重复注册直接 throw（`packages/runtime-diagnostics/invariants/src/index.ts:136`）。

### 6.4 组合阶梯：每一级都有一个把它变成构建失败的 gate

```text
rung 0  package   提供 ctx service 或纯 library；共享实例关系写在 peerDependencies
       └ gate: check-workspace-constraints + verify-package-dependencies + verify-module-graph
rung 1  plugin    函数插件(name/inject/Config/apply) 或 Service 子类；注册全走 ctx.effect()/ctx.on()
       └ gate: Loader 形状 + @mode↔签名（cordis-catalog 生成期 throw）+ 重复注册抛错 + verify-package-invariants
rung 2  preset    per-session 的 scope + 内存 Loader 子树；service 行需要 isolate realm
       └ gate: validatePresetPlaneSeparation（一个 row 只能属于一个 plane）+ activation auditing
rung 3  bundle    dsh.bundle.patch：一个或有序多个 patch 文件，可被上层 patch 的层
       └ gate: verify-cordis-config（bare plugin 必须在 resolver manifest 的 dependencies）
rung 4  profile   $DSH_HOME/profiles/<name>：有序层 + 用户 cordis.patch.yml + --patch overlay
       └ gate: 组合边界 admission + peer 版本核对（compatibility.json 精确豁免）+ --dump-config 可观测
rung 5  app       dsh <profile>：唯一受支持的 Node 应用启动器
       └ gate: verify-application-entrypoints（三张显式分类表，未分类即拒）
```

（完整图与逐级引用见 `E-composition-architecture.md:251-279`。）一句话：**package 定义能力，plugin 定义注入，preset 定义"谁能看到"，bundle 定义"可发布的层"，profile 定义"这次怎么叠"，app 定义"唯一入口"**。

其中 `validatePresetPlaneSeparation` 是全仓库"用 gate 顶住人工复制"的最佳样本：四个 shipped preset 近乎互相拷贝、改三漏一是常态失败，而这类错误**不改变 tool catalog，所以任何 catalog 断言都看不见**（`scripts/verify-cordis-config.ts:121-137`）。

### 6.5 生成的架构图：source of truth 与自报盲区

- `docs/graph-atlas.md` 是生成物，且**给每张图标注维护模式**（generated / hybrid generated / curated）（`docs/graph-atlas.md:12-22`）。
- 四个生成器各有明确的真相来源：module graph 的边 = workspace 包的 `peerDependencies`（`scripts/package-graph.ts:40-54`）；capability seams = 声明发现 + 人工分类 + completeness guard；app composition = 从 bundle 的 `cordis.patch.yml` **文本解析** row；event producer/consumer matrix = 用真实 TS program 做跨文件 receiver 类型解析。
- 新鲜度是门禁：`verify-doc-graphs` = `gen-doc-graphs --check`，stale 即 exit 1（`scripts/gen-doc-graphs.ts:1663-1677`）。
- **生成器自报盲区**：event matrix 只从 host aggregate 播种，因此 client-face listener 会被 under-report（`scripts/gen-doc-graphs.ts:1010-1018`）——这是"生成物必须承认自己的覆盖边界"的正面样本。

### 6.6 依赖方向：三类，强制程度不同

- **包级边**（硬）：由 `peerDependencies` 定义，`verify-module-graph` 强制文档与声明一致——"某个包取得了新的 peer 依赖"必然在 diff 里显形。但"某组包不得依赖另一组"**没有**专门的 import 方向 gate（`E-composition-architecture.md:178`）。
- **目录级分层**（硬）：`verify-client-domain-graph` 强制 `packages/client/*/src/client/` 内 domain 目录可以 import `contract/`、**不得互相 import**，只有 assembly point 可以跨 domain（`scripts/verify-client-domain-graph.ts:1-11`）。
- **oxlint 不承担方向限制**（否定证据）：`.oxlintrc.json` 的规则全是类型严格性与风格，没有 `no-restricted-imports` 一类（`.oxlintrc.json:83`、`:109-117`、`:158-180`）。

### 6.7 不变式与类型级契约

- **`./invariant` 的准入判据**："只在包拥有可独立观测的 runtime 关系时发布"；早先那批"检查 plugin 名字 / injection / effect / service 方法存在"的通用断言被明确否决，理由是它们"没有让系统更安全——TypeScript、Cordis startup、package tests 已经强制那些形状"；真正有用的不变式是**跨时间或跨可变数据结构**的关系（terminal event 没有 start、durable result 的身份与请求不符）（`.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.md:9-13`）。
- **"模型可见 ⟺ 已记录"有真实强制点**：`dsh-agent-loop` 发布一个 `./invariant` companion，向 `llm/stream` **prepend** 一个监听（防止短路的 replay listener 让检查静音），断言 request 已 frozen、log 里已有 `step/start` 与 `request/header`、且 `JSON.stringify(options.messages)` 必须等于 `session.deriveMessages()`，否则以 "log-reconstruction desync" 失败（`packages/core/agent-loop/src/invariant.ts:20-54`）。**边界也要说清**：只有挂载了 `dsh-invariants` 且加载该 companion 的组合才生效——一个自建的最小 Cordis 树可以绕过它（`E-composition-architecture.md:52`）。
- **持久格式一个单调整数 + 相邻迁移**：`SESSION_FORMAT_VERSION` 是代码里唯一手工维护的 current-writer 数字；"writer 决定 bump，不是 reader"——"解析不报错"不是标准，静默跳过影响重建的内容就是错读；按方向读取（equal 正常、newer 拒绝并指出方向、older 先跑完整相邻链）；普通事件词表增长不 bump，未知事件默认**拒绝解释**，除非 envelope 带 `ignorable: true`（`.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md:13-21`）。
- **类型指纹 + 变更分类 + 每条变更一条 acknowledgement**：`persistence-schema.json` 给每个可达规范化类型算 SHA-256（注释、位置、别名、readonly 标记与无害重排不影响 digest；tuple 顺序、属性名、值类型与可选性影响）；变更按表分类 `same-version` / `version-bump`，且"规则作用于完整变更，因此一个被允许的变更不能藏一个同时的破坏性变更"（`docs/persistence-catalog.md:13`、`docs/persistence-changes/README.md:48-61`）。
- **ratchet（棘轮）机制**：`verify-no-unknown-casts` 用 AST 扫描 + "剔除注释与空白的语法 token 的 SHA-256"作指纹，**移动代码行不会丢失豁免、改写断言会**；比较是精确计数，"不授予文件级豁免"；baseline 现存 561 文件 / 1460 条（`scripts/verify-no-unknown-casts.ts:22-26`、`:114-125`）。
- **"在类型化同进程边界信任 TypeScript"的真实内容是"把校验集中在边界清单上"**，不是"少校验"：session append 用共享 `snapshotJsonValue()` 在 append 点拒绝非 lossless JSON，早于任何 backend flush（`packages/core/session/README.md:108`）。

### 6.8 experimental 政策：命名空间即稳定性标记

准入（完整 public contract 都是实验性的才放这里）、命名（`@deepseek-ai/dsh-experimental-*`）、**两层隔离 gate**（release package 与 app 不得在任何 runtime dependency 段提到 experimental 包；`verify-default-product-isolation` 还会复算 shipped composition）、以及两条立场：*"experimental 状态不放松 engineering、security、documentation、lifecycle、testing、invariant 或 snapshot 要求"*；**毕业没有自动 gate**——promotion 是人工迁移（改名 + 原子更新所有 import 与配置行 + 审阅 public contract/limitations/evidence），由命名与隔离 gate 保证迁移后的一致性（`packages/experimental/AGENTS.md:5-9`）。

## 7. 轴 F：面向模型的设计契约（Model Experience）

DSH 把"这个包给模型看什么"变成了每个 package README 的**强制章节**，并配了 47KB 的门禁。

- **规范序列**：`## Model Experience` → 每个模型上下文条目一个 H3 → 三个有序 H4：`#### What the model sees` / `#### Token effect` / `#### KV Cache effect`，各一段正文；随后才是 `## Known Limitations and Deferred Work`（`docs/cookbook/adding-a-package.md:80-106`）。
- **填写要求**：从实现填充；稳定文本逐字引用（系统提示词用带标题的 H5 + `markdown` 围栏）；只概述数据依赖或 provider 拥有的文本；工具 schema 条目链接生成的 tool catalog 并只写差异；`KV Cache effect` 要区分 append-only / prefix-stable / replacing / independent，并列出使复用失效的包内变化（`docs/cookbook/adding-a-package.md:108`）。
- **门禁**：`scripts/verify-package-readme-model-experience.ts` 固化标题常量与字段顺序（`:14-18`），并要求**豁免有账**——没有模型可见产出的包必须登记在 `NO_MODEL_EXPERIENCE_SECTION`（`:32-40`），短句形式必须登记在 `SENTENCE_MODEL_EXPERIENCE`（`:46`），脚本注释写明动机是"让缺失的章节不会被误认为忘记写"（`:28-31`）。
- **上游规则**：`packages/AGENTS.md:13`「Write model-facing contracts from the model's perspective：prompts、tool schema、result、diagnostics 只含任务相关概念，不含 UI / 传输 / 实现词汇」；`:27` 要求包 README 用该格式记录 model / token / KV-cache 效应；`:16`「Apply bounds to the complete result」——上限加在**完整产出**（含包装与元数据）上，并测极小值、精确边界、超大单块、多字节边界。

**可提炼的内核**：凡有模型可见产出的组件，必须在同一处回答三个问题——模型看到什么、花多少上下文、什么会让缓存失效；**豁免要有账**（空章节必须在门禁里写明理由，而不是留白）。对 8.A 的小项目，这正好等于"凡 agent 必读的文档，声明它的 context load"——而那是 `writing-for-agents` 已经管的，所以本轴不产生新规则，只作为 8.B 的结论。
## 8. 可提炼性分析

### 8.0 两个不同的问题

"提炼为通用项目使用的架构设计"其实包含两问，答案不同，必须分开答：

- **8.A 托管 agent 的项目**（任何仓库：让 agent 在这里高效、少犯错）——可提炼的是**规则与载体**，不是运行时机制。
- **8.B 构建 agent 产品的项目**（自己写 harness/agent 系统）——可提炼的是**结构性决策**（seam 三角、"模型可见 ⟺ 已记录"、插件而非改主循环、扩展点表），这些是 DSH 架构里最耐久的部分。

### 8.1 判据统计的判据（三条）

对每个候选项依次问：

1. **它改变默认行为吗？**（no-op 判据，模型相对。）"要彻底"这种话不改变任何东西——`writing-for-agents` 把这个判据写得很死：*过不了就整句删掉*，不是修剪措辞。
2. **它花哪种 load？**始终在场的（AGENTS.md 一行、技能 description）花 context load，每回合付费；只在被指向后才读的花 cognitive load（人类当索引）。小项目付不起高 context load，所以搬运必须"越短越好、且只留改变行为的那部分"。
3. **它靠什么执行？**细分为三档：**被机器执行**（脚本/测试/不变量/OS）> **被结构执行**（没有宿主就跑不起来，如 seam、profile）> **只是约定**（靠人/agent 自觉）。搬运时必须降档诚实：把第三档写成第一档的样子，正是 `docs/constraints.md` #38 禁止的事。

### 8.2 判定表

三档：**通用原则**（一条规则即可搬，成本≈0）／**可移植模式**（需要一点工具或约定）／**DSH 特有**（脱离宿主即空转）。

| # | 机制 | 判定 | 判据（为什么） |
|---|---|---|---|
| 1 | 根 `AGENTS.md` = 常备命令，一条 1–3 行 + 链接其家 | 通用原则 | 直接改变默认行为（默认是"有用的都塞进 AGENTS.md"）；成本 0（`docs/AGENTS.md:21`） |
| 2 | 子树 `AGENTS.md` 只写差异、声明与上级的关系 | 可移植模式 | 只在目录层级 >1 且子树有真实差异时才值得；DSH 的 80 个包只建 6 个文件（`packages/AGENTS.md:3`） |
| 3 | 多宿主共用一份真源（`CLAUDE.md` symlink） | 可移植模式 | 1 条命令；注意 DSH 自己在这里已有漂移（文档说 2 处，实际 4 处） |
| 4 | Agent Notes 的四生命周期 + 分类闭集 + 归档封存清单 | DSH 特有 | 服务"538 活跃 + 639 冻结"的量级；小项目照搬是纯仪式（`A-repo-agent-contract.md:121-132`） |
| 5 | 决策记录**强制**记录被拒替代 | 通用原则 | 原文理由：*"A decision recorded without what it beat invites re-litigation"*（`.agents/notes/README.md:111`）；DSH 用门禁执行，小项目用模板 + 评审 |
| 6 | `one home per fact` + tier 表 | 通用原则 | 直接阻止"同一事实写两处"的默认漂移（`docs/AGENTS.md:19-33`） |
| 7 | 字数预算 + `Relocate → Condense → Raise` | 可移植模式 | 一个 manifest + 30 行脚本即可复刻；但它把"加字"变成需要辩护的动作，价值在纪律不在脚本 |
| 8 | 规则正文点名它的门禁 | 通用原则 | 读者立刻知道这条是硬是软；与 #3 提案（标注可校验性）同构（`docs/AGENTS.md:41`） |
| 9 | 允许清单必须带理由，且陈旧条目报错 | 通用原则 | 豁免不是后门，而是一条可被删除的有理由条目（`scripts/verify-subsystem-pages.ts:80-84`） |
| 10 | 门禁自证不空转（要求语料非空） | 通用原则 | `scripts/AGENTS.md:3`；DSH 自己也有反例（`verify-skill-invocation-metadata` 在 CI 空转） |
| 11 | 门禁自己有测试 | 可移植模式 | `doc-standard.spec.ts` 反向推导清单是否仍成立 |
| 12 | `change-scope` 这类"有意的非门禁" | 可移植模式 | 把"这次改了什么"变成可引用事实，供选证据，不判对错（`scripts/change-scope.ts:12-30`） |
| 13 | postmortem 三判据 + Executive summary | 通用原则 | subtle / systemic / costly，且要回答"为什么每道网都没挡住"（`docs/postmortem/README.md:9-11`） |
| 14 | skill 的**内容**写法（触发器式 description、"guidance, not a checklist"、sources-of-truth 外链、anti-pattern、输出契约、`references/` 按需） | 通用原则 | 与 `writing-for-agents` 同源；本仓库已有更严版本，直接沿用 |
| 15 | skill 的**运行时**（rank 发现、catalog 注入、按名加载、500 字符截断、无 body 上限） | DSH 特有 | 需要宿主；可搬的只有"catalog 常驻 + body 按需"这一条形态 |
| 16 | plan mode | DSH 特有（机制）／可移植（形态） | 机制要 log-only 状态 + 投影 + pre-step 边界；形态"显式策略文本 + 一个专用退出动作"可纯文本搬（`packages/plan/plan-mode/README.md:32`、`:185`） |
| 17 | goal 的权威模型 | 可移植（约定） | "创建/编辑需要本回合有一条人类消息；非人类生产者不得继承该权威"（`tool-goal/src/authority.ts:74-103`） |
| 18 | todo 的纪律 | 可移植（形态） | 整表替换 + 3 态；**DSH 自己也没有 staleness 提醒**，说明这一层靠自觉，不该假装有闸 |
| 19 | 委派契约（fresh/fork/workflow/team 四判据 + 只回最终产出 + 结算通知） | 可移植（约定） | 判据都写在模型可见文本里；机制（caps、mailbox、CAS 任务板）不可搬 |
| 20 | sandbox / guard / approval 的**执行** | DSH 特有 | 依赖 OS 原语与宿主瀑布；纯应用层做不到 process confinement（`packages/fs/fs-sandbox/src/index.ts:10`） |
| 21 | denial 的**表达方式**：确切 marker + 就地教下一步 | 通用原则 | `[sandbox: file access denied under <mode> mode]` + 升级提示写在同一个决策点（`packages/sandbox/sandbox/src/escalation.ts:71`、`:84`） |
| 22 | approval 的失败模型：闭集 outcome、只有一个 grant、服务内部 fail-closed | 通用原则 | "missing / non-owning / throwing / non-conforming → unavailable，而不是打开闸门"（`docs/subsystems/approval.md:21`） |
| 23 | guard 只给 deny、不给 allow | 通用原则 | 单调拒绝，让顺序无法"复活"被拒的调用（`packages/core/tools/src/index.ts:730`） |
| 24 | 输出上限的**报告方式**：截断 + 全量在哪 | 通用原则 | 让调用方永远不会把部分结果当完整结果（`packages/AGENTS.md:16`） |
| 25 | spill / compaction / token meter 的**机制** | DSH 特有 | 触发、锁、token 计价都需要宿主 |
| 26 | invariants | DSH 特有（机制）／可移植（判据） | "只在独立观测会发散时发布，否则写明为何省略"（`packages/AGENTS.md:19`） |
| 27 | Model Experience（模型可见面 / token / KV cache + 豁免有账） | DSH 特有（机制）／可移植（判据，面向 agent 产品） | 机制要包结构与 47KB 门禁；判据"凡有模型可见产出就写清看到什么、花多少、什么会让缓存失效"是通用的（`docs/cookbook/adding-a-package.md:80-110`） |
| 28 | "Model-visible ⟺ logged" | DSH 特有（机制）／通用（原则） | 机制要日志与不变量；原则"凡被当作真相的必须可重建"通用（`AGENTS.md:136`） |
| 29 | 生成物新鲜度族（catalog/graph/gate 成对） | 可移植模式 | 前提是"有生成器"；本仓库的对应物是"配置由生成器产生 + 出生证明" |
| 30 | 双语配对（三文件 + 哈希 sidecar + 结构签名） | 可移植模式 | 有双语读者时便宜；结构签名校验贵，小项目可只做"三文件齐 + 哈希记录" |
| 31 | 组合阶梯（package→plugin→preset→bundle→profile→app）与逐级 gate | DSH 特有 | 需要 Cordis loader 的 patch/isolate/realm 语义；通用版只剩"每一级都该有 gate"（`E-composition-architecture.md:251-279`） |
| 32 | "注册即 effect"（每个贡献返回 disposer） | 可移植（原则） | 只要有热重载或生命周期卸载，缺 disposer 的注册就是泄漏；机制（Cordis HMR + reentrant disposal）不可搬（`AGENTS.md:132`、`vendor/README.md:38`） |
| 33 | seam 三角 + 双向完整性守卫（missing/stale 都报错） | 可移植（判据） | 守卫本身需要生成器；判据"只落地一个角色的抽象不算 seam；分类表与发现集合双向核对"通用（`scripts/gen-doc-graphs.ts:872`） |
| 34 | 唯一应用启动器 + 显式 entrypoint 分类表 | 可移植（原则） | "隐式空洞"（未分类的第二条启动路径）是架构漂移最常见的入口（`scripts/verify-application-entrypoints.ts:1`） |
| 35 | pre-stable 代码放独立命名子树，release 不得依赖，毕业 = 改名 + 原子迁移 | 可移植（原则） | 命名空间是唯一能被自动 gate 稳定识别的稳定性标记（`packages/experimental/AGENTS.md:6-9`） |
| 36 | 从声明生成架构图 + 逐字节新鲜度门禁 + 自报盲区 | 可移植模式 | 生成器把"文档与代码一致"从意愿变成 CI 事实；成本是一个渲染器 + `--check` 模式（`scripts/gen-module-graph.ts:161`） |
| 37 | 版本策略：一个单调整数 + 相邻迁移链 + 未知默认拒绝（可显式 `ignorable`） | 可移植（原则） | "writer 决定 bump，不是 reader"；方向化拒绝本身就是已发布 reader 上唯一可补救的部分（`.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md:13-21`） |
| 38 | ratchet：baseline 只许保留或减少 + 语法指纹（移动代码不丢豁免） | 可移植模式 | 比"禁止某种写法"可行，比 review 可靠；需要 AST 脚本（`scripts/verify-no-unknown-casts.ts:22-26`） |
| 39 | 类型指纹 + 变更分类表 + 每条结构变更一条 acknowledgement | 可移植模式 | 把"这次改动破不破兼容"变成机器可判的分类 + 人工必须写的解释（`docs/persistence-changes/README.md:48-61`） |
| 40 | plane/分层占位检查（同一 row 不能同时在两个平面；目录分层谁可 import 谁） | 可移植模式 | 近同构的复制粘贴组合是"改三漏一"的温床，只有机器比较挡得住（`scripts/verify-cordis-config.ts:139`、`scripts/verify-client-domain-graph.ts:1`） |

**一句话**：可搬的是**载体结构与判据**（1、5、6、8、9、10、13、14、21、22、23、24、32、33、34、35、37），需要一点工具的是**纪律性的检查**（2、3、7、11、12、29、30、36、38、39、40），而所有"执行"（4、15、16、20、25、26、27、28、31）都留在宿主里。这也解释了为什么本仓库的提案只有六条——可搬的那部分本来就很小。

### 8.3 交集证据：本仓库已独立收敛的五条

最强的可提炼性证据不是"DSH 说得漂亮"，而是**两个互不相干的项目独立收敛到同一批原则**。本仓库的约束几乎全部来自本项目的实测（不是抄 DSH），却与 DSH 的规则同构：

| 本仓库（实测得出） | DSH（一手） | 同构点 |
|---|---|---|
| #5「绿必须有意义，不接受真空绿」（`vp check` 缺 `typeCheck` 时打印 pass 却完全不查类型） | `AGENTS.md:118`：`test:coverage`, not `test`, is the CI coverage gate；`doc-sync` 聚合 42 个 leaf gate | "绿"必须能被证伪；门禁必须真的查 |
| #15「精简必须验证，不能假设」（删掉承重配置后仍 exit 0） | `packages/AGENTS.md:14`：Enforce a decision in the operation that makes it——schema 省略、facade、包装、监听器顺序都不算强制，并要求"通过 executor 测拒绝" | 只在真正执行的那一层才算约束 |
| #38「唯一可机器校验的部分是依赖单向性……不要假装它被 `vp check` 覆盖」 | `docs/AGENTS.md:19-35` 的 tier table：一条事实一个家，各层各挂自己的门禁 | 规则必须标注载体；原则与门禁不混 |
| #39「只为实测可发生、且失败是静默的状态写显式失败」 | `packages/AGENTS.md:15`：Publish state only at its commit point；`docs/defensive-patterns.md` | 防御有判据（实测 + 静默），不凭想象 |
| #36 加代理守卫的判据是"缺它时静默返回 200 + SPA 的 HTML" | `docs/postmortem/README.md:7-9`：写事故的判据是 subtle / systemic / costly，且要回答"为什么每一道安全网都没挡住" | 失败要响；记录要能防住下一类 |

**读法**：同构的五条说明 DSH 的可提炼部分**不是它的机制**，而是这些机制反复在证明的那几条原则。第 9 节的提案因此只提原则与格式，不提机制。

### 8.4 提炼出的最小形状

把 8.A 的答案压到最小，一个"agent 可操作"的项目只需要四层，其余都是可选加固：

```
① 载体分层      AGENTS.md（常驻规则，1–3 行/条，各指向自己的家）
                ├─ docs/adr/          决策：为什么、否掉了什么
                ├─ docs/agent-notes.md 陷阱：实测到、静默、重新发现贵
                └─ docs/provenance.md  实装：版本、来源、复查条件
② 单一事实家    每条事实只在本层写一次；别处只链接（DSH: docs/AGENTS.md:19-35）
③ 可证伪的门禁  每条规则标出"谁判它红"；判不了就明说是原则（DSH: packages/AGENTS.md:14）
④ 决策点       只在该停下时停下：给具体选项 + 推荐 + 可预答（本仓库 CONTEXT.md 已有定义）
```

②③ 是本次提案的实质；①是本仓库已有的落点分类；④是本仓库已经比 DSH 更清晰的地方（DSH 把这叫 ask-user / approval，是宿主机制）。

### 8.5 何时不该提炼

三条反向判据，同样重要：

- **宿主机制不提炼**：沙箱、审批、守卫、会话日志、preset/bundle/profile、Agent Teams 的价值在于"有执行者"。抽成纸面规则只剩口号，且会挤掉真正能改变行为的那几行。
- **规模不足时不提炼**：DSH 的 42 个文档门禁、词数预算、双语配对、归档冻结清单，服务的是"多作者、长周期、大量 agent 并行"的仓库。小项目照搬会把维护成本翻倍而不提高正确率。
- **已有更严的家时不提炼**：本仓库的 `writing-for-agents` 在"怎么写给 agent 看"上比 DSH 的对应物更锐利。重复即 no-op。

## 9. 落到当前仓库的指南

### 9.0 结论先行

**能补充，但可补的不是 DSH 的机制，而是六条规则与一个落位契约。** 三条理由：

1. **本仓库没有工具链**：68 个 Markdown、25 个技能、1 个 lock 文件，没有 `package.json`、没有 CI、没有自己的 `scripts/`。DSH 式门禁（`doc-sync` 聚合的 42 个 leaf gate）在这里无处执行；只能作为**指南发给目标项目的 payload**（目标项目才有 vp / tsc / vitest），或者干脆是"写明它不可机器校验"的诚实标注。
   📌 更正（落地时）：本仓库此刻已有自己的 harness（`e2e/`，18 个在库文件），"没有自己的 `scripts/`"这半句不再成立；`package.json` 与 CI 仍然没有。本节的判断不变——那套 harness **运行**指南、断言的是**目标项目**的产物，不是约束本仓库文档的门禁。
2. **目标项目的四类落点已经定义好**（`docs/constraints.md` 的「客户侧落点」表）：长期规则→`AGENTS.md`「项目约束」段；为什么/取舍→继承 ADR；已知边界→`docs/agent-notes.md`；本次实装→`docs/provenance.md`。DSH 的增量正好卡在"每条事实住哪一类、且只住一类"这个缺口上——也正是议题 #7「文档落位契约」要回答的问题。
3. **本仓库的写作标准已经比 DSH 的更严**：`.agents/skills/writing-for-agents/SKILL.md` 的 context pointer / 信息层级 / no-op 判据 / sediment，比 DSH 的 `dsh-doc`（面向大仓库的迁移与审计流程）更锐利。凡是与它重复的搬运都是 no-op，必须删掉——下面是删完的结果。

### 9.1 三个落点（谁读、在哪读）

| 层 | 读者 | 载体 | 本次可补什么 |
|---|---|---|---|
| ① 指南执行纪律 | 空目录里逐字执行 `GUIDE.md` 的 agent | `GUIDE.md` 步骤与 verify | 被拒后的升级纪律；verify 必须"有意义"（已有，见 #15） |
| ② 目标项目长期规则 | 目标项目日后的 agent | `AGENTS.md`「项目约束」段、继承 ADR、`docs/agent-notes.md`、`docs/provenance.md` | **单一定位事实**、**决策必记被拒替代**、**规则标注可校验性**、**陷阱准入判据**、**漂移事实的处理**、**升级纪律** |
| ③ 本仓库维护面 | 维护本指南的 agent | 本仓库 `AGENTS.md`、`docs/agents/*`、`docs/research/*` | 把②的三条规则先在本仓库自用（文档落位表、ADR 的被拒替代格式、陷阱判据），再随指南发货 |

### 9.2 提案（六条，按强度排序）

每条给出：规则草案（中文是工作稿，随指南发货时应按 `docs/constraints.md` 的语言规则写英文）→ 落点 → 为什么不是 no-op → 谁来证明。

**P1 一条事实一个家（文档落位）**
- 规则草案：*每类内容有且只有一个家：做法→`AGENTS.md` 约束段；取舍与"什么情况下可以推翻"→`docs/adr/`；实测到的陷阱与版本事实→`docs/agent-notes.md`；本次实际装了什么→`docs/provenance.md`。在别处重复一条事实必须改成链接。*
- 落点：②`AGENTS.md` 约束段（1 行 + 指向落位表）；落位表本体作为 `docs/agent-notes.md` 的开头一节或独立短文件。
- 不是 no-op：默认行为是"把有用的都写进 AGENTS.md"，重复与漂移是默认结局（DSH 叫它 sediment）。
- 证明：`docs/constraints.md` 的「客户侧落点」表现成 `docs/agents/` 的落位契约（议题 #7）；本仓库先用同一张表约束自己。

**P2 决策记录必须记下被否掉的替代**
- 规则草案：*每条决策记录含四个部分：问题、决策（已实现用现在时）、被考虑过的替代及各自为何失败、后果（代价与收益）。已实现的决策随代码更新（路径、名字、结构），但不得改写为"另一个决定"——推翻要新开一条并互相链接。*
- 落点：②继承 ADR 的模板（现有 ADR 已有 Considered Options，补"已实现用现在时 + 随代码更新"）+ `AGENTS.md` 约束段一行。
- 不是 no-op：DSH 的门禁原文写明理由——"没有记下它击败了什么，就会招来重新审判"（`.agents/notes/README.md:109-111`，由 `verify-agent-note-format` 执行）。默认行为是只记结论。
- 证明：本仓库 5 份 ADR 已按此格式（0001 有 Considered Options）；把它写成目标项目的模板即完成。

**P3 每条约束标注它是否可机器校验**
- 规则草案：*约束段每条规则自带一个标记：可校验（写出由哪个命令/断言判定）或原则（明说不可校验，不假装）。*
- 落点：②`AGENTS.md` 约束段的格式要求；正好是 `docs/constraints.md` #38 已得出的判据，升级为**格式**。
- 不是 no-op：DSH 的证据是 `packages/AGENTS.md:14`——"在被执行的那个操作里才算强制；facade、包装、监听器顺序都不算"，并要求"通过 executor 测拒绝"。默认行为是把原则当成已执行的约束。
- 证明：目标项目初始化后，约束段里的每一条都能回答"谁判它红"。

**P5 陷阱（`docs/agent-notes.md`）的准入判据**
- 规则草案：*只记实测发生过的陷阱；且至少满足两条：(i) 机制不直观，(ii) 失败是静默的（不是一次性的笔误），(iii) 重新发现它的代价高。每条写：现象、机制、为什么当时的验证没挡住、以及新增的判据/命令。*
- 落点：②`docs/agent-notes.md` 的开头判据 + 条目格式。
- 不是 no-op：DSH 的三条判据正是 `docs/postmortem/README.md:9`（subtle / systemic / costly to rediscover）+ 第 7 行"关心的是**为什么我们的流程让它过去了**"。默认行为是把任何小坑都记下来，最终 sediment。
- 证明：本仓库 `docs/constraints.md` 的「已知边界」段已按此精神写（每条都有"实测"字样）；把它提炼成准入判据即完成。

**P11 会漂移的事实：生成、或写明来源与复查条件**
- 规则草案：*会随上游漂移的事实（版本、命令输出、默认值）不手写；不能生成时，在记录它的地方写明来源与"上游动了就要重验什么"。*
- 落点：②`docs/provenance.md` / `docs/agent-notes.md` 的条目格式；直接服务议题 #8 的「上游漂移时需重新验证什么」清单。
- 不是 no-op：DSH 的对应物是"生成物优先 + 新鲜度门禁"（`docs/AGENTS.md:32` 的 generated reference 一栏：唯一真相是源，文档是投影）和 `verify-doc-refs`；本仓库的对应物是 #4「配置由生成器产生」。
- 证明：出生证明已记实际版本；补一条"复查触发条件"即成清单。

**P9 被拦下时的升级纪律**
- 规则草案：*命令因环境被拦（沙箱、网络、凭据、IPC）时：原样重试一次、用最窄的升级、并说明理由；绝不绕过失败的测试或产品沙箱。*
- 落点：②`AGENTS.md` 约束段一行（对目标项目的未来 agent 生效）；①执行纪律（本指南自己的步骤遇到同类失败时同规矩）。
- 不是 no-op：DSH 为此单独立了一节（`AGENTS.md:108-110`），因为默认行为要么静默绕过、要么升级过宽。它同时是"约束是环境给的、不是道德劝说"的具体形态。
- 证明：写进约束段即可；本指南运行时按此执行。

### 9.3 明确不做（附理由）

| 不做 | 理由 |
|---|---|
| Agent Notes 的四生命周期目录 + 分类门禁 + 冻结归档清单 | 仪式成本远大于小项目收益；退化为两类（ADR 记决策、agent-notes 记陷阱）已覆盖同样的"单一事实家" |
| `.agents/skills/` 写法再立规则 | `writing-for-agents` 已经更严，且其 description 正是"编辑 AGENTS.md / skill 时"触发——再加就是 no-op |
| AGENTS.md 写作规则（1–3 行、链接其家）再立一条 | 同上：writing-for-agents 的 context pointer / 信息层级已覆盖 |
| "动工前先计划"一类流程规则 | 目标项目初始化的 25 个技能（`/grill-with-docs`→`/to-spec`→`/to-tickets`→`/implement`）已承载流程；再加是重复 |
| 双语 `.zh.md` + `.i18n.yaml` 配对与其门禁 | 目标项目按单一语言发货（`docs/constraints.md` 只要求继承 ADR 与 agent-notes 为英文）；只有需要双语文档时才值得 |
| sandbox / guard / approval / hooks / session log / preset / bundle / profile / Agent Teams 等运行时机制 | 宿主级：没有宿主就没有执行者。可搬运的只是理念（第 8 节判定表），不是机制 |
| DSH 式门禁群（42 个 leaf gate）与词数预算门禁 | 本仓库没有工具链；目标项目按其 #38 的立场只保留 1–2 条真门禁（依赖单向、绿必须有意义） |

### 9.4 与其他议题的关系

- **议题 #7（文档落位契约）**：P1 就是它的正文；"落点跟随项目约定，而不是硬编码"正是"一条事实一个家"的运行时形态。
- **议题 #8（陷阱清单与约束逐条对齐）**：P3 给"逐条对齐"提供格式（每条标注可校验性/原则）；P5 给陷阱清单提供准入判据；P11 交付"上游漂移时需重验什么"。
- **ADR-0001（发货的是指南）**：本提案不引入任何需要本仓库在线的机制；规则随 `GUIDE.md` 发货，本仓库只做自用示范。

### 9.5 待用户决策

以下两条属于"是否值得多花一行 context load"，需要用户拍板（第 8 节复核后可能再增减）：

1. **P9 的落点**：只写进目标项目约束段，还是同时写成本仓库 GUIDE.md 的执行纪律（两处各一行）。
2. **P11 的强度**：只要求"写明复查条件"，还是把它做成出生证明里的一个字段（更强的格式约束）。

### 9.6 与 GUIDE.md 现状的对齐（快照：本报告完成时）

调研期间，`GUIDE.md` 已由本仓库的并发工作写出（本轮读到 1109 行；落地时已是 4,691 行，下表逐行引用请以当时内容为准）。因此把六条提案对到它**现有的段落**上，而不是对一个假想的指南——这样"增量"是可核对的：

| 提案 | `GUIDE.md` 现状 | 真正剩下的增量 |
|---|---|---|
| P1 一条事实一个家 | 已有：Phase 5 开头即"Four documents, each with one job"（`GUIDE.md:647-657`）——`AGENTS.md` 做什么 / `docs/adr/` 为什么 / `docs/agent-notes.md` 已知会咬人的事实 / `docs/provenance.md` 装了什么 | 把这句从**指南的自述**变成目标项目 `AGENTS.md` 约束段里的一条**规则**（含"别处重复要改成链接"），未来 agent 才不会把 ADR 内容抄回 constraints |
| P2 决策必记被拒替代 | **已满足**：继承 ADR 已用 `## Considered Options` + `## Consequences`（`GUIDE.md:753`、`:768`、`:789` 起） | 只剩"已实现用现在时、随代码更新、推翻要新开一条并互链"这半句 |
| P3 规则标注可校验性 | 未满足：约束段是祈使句 + 一句理由（"each one exists because the alternative fails quietly"，`GUIDE.md:668-669`），但没说"谁判它红" | 每条约束加一个标记：可校验（写出命令/断言）或原则（明说不可校验） |
| P5 陷阱准入判据 | 部分：陷阱已成段（`Two engines, one green light` / `Modules and aliases` / `Versions` / `The development proxy` / `Package managers` / `Skills and setup`），并有 `If something looks wrong` | 补准入判据（实测发生 + 静默 + 重新发现贵）与"为什么当时的验证没挡住" |
| P11 漂移事实的复查条件 | 部分：`docs/provenance.md` 记实际解析版本、skills 来源与 commit（`GUIDE.md:928-968`） | 每条会漂移的事实写一句"上游动了就要重验什么"（正是议题 #8 的交付物） |
| P9 被拦下时的升级纪律 | 未满足（`GUIDE.md` 中 `escalation` / `narrowest` 命中数为 0） | 一行：原样重试一次 + 最窄升级 + 说明理由；绝不绕过失败的测试或产品沙箱 |

结论不变，但更精确：**P2 基本已是现状；P1/P5/P11 是把既有做法写成规则与判据；只有 P3 与 P9 是真正的新增内容。** 这再次印证 §9.0 的判断——可补的部分很小。

> 注：`GUIDE.md` 由另一个会话并行编写，本表是上述时间点的快照；行号仅供复核。
