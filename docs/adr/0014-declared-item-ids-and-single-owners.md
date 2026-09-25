# 条目 id 就地声明；harness 的形状、profile 集合与记录各自只有一个家

本条补的是**机制**：覆盖矩阵、形状推导、profile 集合与记录之间的事实交换，此前是同一批事实被各自推导或从别人的文本里读回来。四条改动一起记，因为它们的理由是同一条——**能被读到的事实才值得断言，读不到的事实只能靠约定**。

- **条目 id 就地声明**：`docs/constraints.md` 的边界项把 id 写进自己那一行（`- ⚠️ **B13** …`），编号项本来就这样（`13. 🔧 …`）。`itemIds` 从「数位置」改成「读声明」；一条边界项没有 id、或同一个 id 出现两次，`--self-check` 直接红。此前 id 只作为**位置**存在：241 行的母清单里只有一个 `B…` token（`:200` 那句「边界项 `B1..B27`」），所以删掉一条 bullet 会让后面每个 id 整体前移，而表里所有 `B<n>` 引用会静默指向别的事实——实测：插入一条 bullet 并补上新 id 之后，`selfCheck` 是 `0 failures`，而 `B13` 已经变成「目标目录必须完全为空」。这个问题已经被付过一次代价：`755fc85` 删掉一条边界项，随后 `coverage.mjs` 78 行、`assert.mjs` 6 条断言手工重编号，而那条机制只写在该 commit 的 message 里。
- **形状只推导一次**：`e2e/lib/shape.mjs` 从预答里算出 形态 × 布局 与随之而来的事实（有没有服务端、有没有应用、有没有代理、版本是否走 workspace catalog、是不是 SSR / 前后分离），覆盖矩阵的 `when` 过滤、`assert.mjs` 的布尔量、`run.sh` 的控制门都读它。此前同一批事实在七处各自推导、两种词汇表（指南的 `when=` 与表里的选择器名），且能各说各话：`SELECTORS.server` 是 `mode !== "frontend"`，`assert.mjs` 的 `hasServer` 是 `mode === "backend" || mode === "fullstack"`——今天等价，多一个形态就分家。指南侧的 `when=` 不动（ADR-0006：一步是自足文本），这是 harness 的一半。
- **profile 集合只有一个发现处**：`e2e/lib/profiles.mjs`——`matrix.sh`（选择要跑哪些）、`record.mjs`（写记录）与 `coverage.mjs`（证明集合覆盖矩阵）都经它读集合，三个读取者不再各自 glob；「每个 profile 在 `GUIDE.md` 与 `e2e/README.md` 里被点名」改成**整名匹配**，「这些文档说的 profile 数量」也成为断言——数量是推导出来的，写在散文里的那个数字必须跟着集合走（同一批散文里其余由算术推出来的数字（「其余八个」之类）直接改成不含数字的说法，而不是再加三条检查）。此前是子串匹配，而 `backend-monorepo` 是 `backend-monorepo-placeholder-no` 的子串，所以三个 arrangement 的那三行**不可能失败**（实测：把 README 里对 `backend-monorepo` 自己的点名全部换成兄弟名字，旧检查 0 failures，新检查点名它）；`AGENTS.md` 的 "nine of them" 也无人读。
- **记录的输入是字段，不是散文**：`assert.mjs --summary <file>` 把本次运行算出的数字（checks / failures / items / bullets）写成字段，`record.mjs` 优先读它、没有时回退到旧运行目录的运行日志。`docs/verification.md` 仍是 `B7..B11` 的落点（ADR-0012 不变），渲染出来的表格仍是给人读的文档。守卫那一半也改成执行：`run.sh` 把抽出来的 `profile-guard` 步按 `shape.mjs` 接受的每个 (形态, 布局) 跑一次，要求它接受并报出 `ok  profile <形态>/<布局>`——每个组合用它自己 profile 文件里的答案（base 与占位答案），不在 bash 里再拼一份；`--self-check` 里读 guard 分支的正则也从「GUIDE.md 里任何一行长得像分支的文本」（实测命中 18 行、横跨三个不同 `case`）改成只读 `id=profile-guard` 那个代码块，并且不再限定那两个词（形态/布局的词汇表是 `ACCEPTED` 的事）。

## Considered Options

- **边界项继续按位置编号，给每条发货行加一份来源片段（指纹）** — 拒绝：那是**发现**错位而不是**消除**它，代价是 162 行 × 中英两种文字的手写数据；而且位置编号本身仍然让「删一条 bullet」这个动作带着隐性成本。就地声明让前移不可能发生（ADR-0008 的同一条理由：成因被消除，而不是被守卫）。
- **C 条目也换成 slug**（`C-toolchain-local`） — 暂缓：C 的编号写在正文里，插入时的手工重编号是**可见**的，且当前约 30 处散文引用都还准确；观察到的问题是 B 的隐形前移，不是 C。等 C 的引用真的腐烂过一次再说（约束 39：不为没观察到的状态写防御）。
- **每条发货行再绑一次「来源条目自己的文字」**（行 → 母清单片段） — 暂缓：今天两个方向里只做了「行指认的 id 必须存在且唯一」。加来源片段能抓住「id 写错但存在」这种错，那种错还没发生过，且母清单是中文、发货文本是英文，片段要另写一份。
- **把指南的 `when=` 取值也绑到 `ACCEPTED`**（每个 `when=mode:X&layout:Y` 的取值要么被某个 profile 取到、要么声明为「故意未跑」） — 暂缓：`when=tnb:yes` 按设计无人跑，先要有「故意未跑」的声明机制，那是另一个决策；今天能保证的只是 harness 一侧的词汇表只有一份，指南侧仍是它自己的门（ADR-0006）。误拼一个 `when=` 取值仍会静默地永不命中，这一条留作候选。
  **已落地（ADR-0015）**：「故意未跑」的声明机制就是路由表里的 `unrun <门>: fetch: …; steps: …` 行——`e2e/router.mjs` 用抽取器的同一套 `when=` 语义重算计划，要求每个 `when=` 取值要么被某条 profile 命中、要么带 `unrun` 标记（反过来，标了 `unrun` 却被命中也是红的），并逐行比对六行路由表；`extract.mjs` 也把 marker 属性收成封闭词汇表，所以 `whe=mode:backend` 这类 typo 抽取即红，不再静默地让门失效。
- **通用文本助手放进 `e2e/lib/text.mjs`**（`escapeRegExp`） — 采纳：它此前在 `assert.mjs` 内联两份、`coverage.mjs` 一份，而这次改动正是在讲「一个事实一个家」。
- **给 harness 建测试框架/`package.json`**（形状模块、答案解析器、`sectionBlocks` 都是天然的单元） — 不做：本仓库没有 `package.json`，为它引入一套运行器是另一个决策；当前的离线可验面是 `coverage.mjs --self-check/--list` 与 `extract.mjs`，`shape.mjs` 的纯函数接口是将来接上去的位置。
- **`record.mjs` 自己解析 answers/result 文件** — 拒绝：`lib/answers.mjs` 存在的理由就是「格式只有一个家」，而实测内联 `split("=")` 会保留引号与尾部空白，与其它模块读出的值不同（`"http://127.0.0.1:3000"   ` vs `http://127.0.0.1:3000`）。

## Consequences

- 母清单新增一条边界项时，必须给它写 id；不写就红，且报错指到行号。插入/删除条目**不再需要重编号**，`docs/adr/0012`、`docs/upstream-drift.md`、`docs/constraints.md:200` 里的 `B<n>` 引用因此不再随编辑漂移。本次迁移按原顺序声明 `B1..B27`，所以这些引用一处都不用改（迁移的三重证明：迁移前后 `--self-check` 都绿、27 条 bullet 的文字除插入的 token 外逐字不变、引用它的文档一个字没动）。
- `e2e/lib/shape.mjs` 的 `ACCEPTED` 与指南里 guard 的分支**互相**约束：guard 多实现一个分支、少实现一个分支、或模块的集合被改动，`--self-check` 都红。删掉模块里的一项会让 guard 的实现「无人认领」。
- 形状相关的事实只有一个去处：`run.sh` 的控制门变成 `shape_is <fact>`，`assert.mjs` 的七个布尔量来自 `shapeOf(answers)`。空跑验证：对九个 profile，新选择器选出的发货行与旧实现**逐行相同**（94/68/78/53/108/86 行）。
- `AGENTS.md` 与 `e2e/README.md` 里的 profile 数量现在是**被读的**：加第 10 个 profile 会让自检红在「这两份文档没有说出集合的数量」上，并提示改哪一句。
- harness 仍未端到端重跑：本次改动落在 harness 一侧（`GUIDE.md` 未动），九个 profile 的全矩阵（`bash e2e/matrix.sh`）是剩余的证据步骤，`docs/verification.md` 会在跑完后由 `record.mjs` 重写。
- 未验证：`GUIDE_TNB=yes`、pnpm 以外的包管理器、非 `react-ts` 的 SSR 基座、`GUIDE_TRACKER=other`（与 ADR-0012 列出的一致）。
