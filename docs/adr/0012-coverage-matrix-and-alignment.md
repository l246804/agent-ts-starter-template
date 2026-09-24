# 覆盖矩阵补全、清单逐条对齐与全矩阵记录

本条把"覆盖"从**人工判断**变成**可执行的断言**，并补上矩阵里最后一格：

- **覆盖矩阵补全**：占位子包决策此前只有"两条分支各被跑过一次"（`backend-monorepo` 取 `yes`、`frontend-monorepo` 取 `no`），三个 monorepo arrangement × 两条分支的**乘积**没有跑满。现在补上三个 profile：`fullstack-monorepo-placeholder-no`、`backend-monorepo-placeholder-no`、`frontend-monorepo-placeholder-yes`，于是每个 arrangement 的两支都有一次完整运行；`--self-check` 也把这条要求变成断言（每个 guard 接受的 (形态, 布局) 至少一个 profile，每个 monorepo arrangement 的 `GUIDE_PLACEHOLDER` 两个答案都有 profile，每条发货行至少被一个 profile 选中）。
- **逐条对齐（两个方向都是断言）**：`docs/constraints.md` 的编号项（`C1..C46`，写本文时为 `C1..C41`）与边界项（`B1..B27`）、加上仓库里的继承 ADR，构成**条目空间**；`e2e/coverage.mjs` 声明"每条 → 目标项目哪个文档的哪一节、哪一形态、哪段 marker"。`assert.mjs` 逐 profile 断言两件事：**无遗漏**（每条发货行的 marker 都在它声明的位置）与**无编造**（目标文档里的每条 bullet 都被某条发货行认领）。形态过滤（`when`）在**两个方向里**都生效，所以"按形态裁剪"是证明出来的，而不是假设的。
- **全矩阵记录**：`bash e2e/matrix.sh` 顺序跑完 `e2e/profiles/` 里的每个 profile，`e2e/record.mjs` 用**运行自己的产物**（`result.env`、run log、产物 `docs/provenance.md`）重写 `docs/verification.md`；任一 profile 不是 `PASS`，命令就非零退出、记录照实写"not run / FAIL"。
- **上游漂移清单**：`docs/upstream-drift.md` 逐面给出"钉住了什么 / 漂移先看哪个可观察量 / 跑什么能证明"，把 `GUIDE.md` 的 Further Notes 里那半句话落成可执行的入口。

## Considered Options

- **逐条对齐靠文档表格 + 人工评审** — 拒绝：这是本仓库存在的理由的反面。清单与指南会**静默**分叉：指南多写一条没人认领的话、或少写一条该说的规则，评审看不出来，只有断言能看出来。
- **继续用 `assert.mjs` 里按形态手写的 `includes(...)` 断言** — 拒绝：它证明的不是覆盖，而是"我想到的那几条在"。它抓不到遗漏（清单里有一条从未发货、或某个形态漏写一节），也抓不到编造（指南新写的一句没有任何来源），而且每加一条规则的唯一保护是记得再手写一条断言。
- **在 `GUIDE.md` 的 heredoc 里给每条 bullet 标注释 id** — 拒绝：那些块是**逐字发货**的文本，注释会出现在目标项目里；对齐数据属于 harness，不属于产物。
- **把发货文本整段复制进 `coverage.mjs`（第二份真相）** — 拒绝：表里存的是**片段（marker）**而不是正文，`--self-check` 要求每个 marker 都出自 `GUIDE.md` 的正文（因此过期行会红），而真正的等价性由 `assert.mjs` 对着**产物**逐 profile 检查（新写一句而没声明 → 反向断言红）。
- **给每条规则补一份手写文档对照表（Markdown 表格）** — 拒绝：同一份映射会同时活在文档与代码里；改为：文档说清契约与命令（`node e2e/coverage.mjs --list` / `--self-check`），映射只有一份、在 `coverage.mjs`。
- **记录手写** — 拒绝：手写记录可以比运行声称得更多。改为从 `result.env` + run log + 产物 provenance 生成；缺 profile 就写 "not run" 并非零退出。
- **用某个 profile 的负向控制来覆盖最后一支（而不是新增 profile）** — 拒绝：控制证明的是"某个负向状态会红"，不是"这一支整条链路能跑通"；分支需要完整运行，控制补不了它。
- **把最后这一支塞进现有 `fullstack-monorepo` profile 的第二个 target** — 拒绝：一个 profile 一次只回答一组答案；两支并存会让"这次跑的是哪一支"变成隐式状态，断言与记录都会含糊。
- **给新 profile 也起一个 `yes` 的兄弟（前后端分离 × 占位 `yes`）** — 已经有了：`fullstack-monorepo` 就是那一支。

## Consequences

- **条目空间是完整的、可审计的**：`--self-check` 要求每个 `C*`/`B*` 要么有发货行、要么在 `NOT_SHIPPED` 里给出"去哪了"（guide 步骤 / 验证记录 / 只留本仓库）与理由；两边都出现或都不出现都红。ADR 也在空间里：`ADR-0001/0002/0003/0004/0005/0007/0008/0009/0010/0011` 各自是至少一条发货句的来源（`ADR-0006` 与 `ADR-0012` 声明为只留本仓库）。检查的粒度也不止 bullet：目标文档里的**每一条 prose 段**与**每个标题**同样要在表里被认领，所以往已发货的节里加一句话而不是加 bullet，同样会红。
- **对齐练习暴露了三处缺口，按"补条目"而不是"删文本"处理**：skills 的安装语义（新 `C40`）、skills 来源记录（新 `C41`）、工作区根作为应用时的根程序（新 `B27`）。这三条本来就是实测结论（`docs/research/mattpocock-skills-install.md` 与 workspace 的实测），只是此前没有被编号；现在它们和其它条目一样有落点与断言。
- **每个 profile 的断言数增加一条**，报告形如 `48 source items landed (88 rows), 67 shipped bullets claimed`（数字随形态不同；`items` 是去重后的条目数，`rows` 是发货行数，两者不同——一行可以覆盖两条 bullet，一条 bullet 也可以有两个来源）；`run.sh` 在跑第一步之前先跑 `--self-check`（毫秒级），所以表的漂移在完整运行之前就红。
- **`assert.mjs` 原有的按形态文档断言保留**：它们断言的是**结构**（某一节在不在、某个包名不该出现），新检查断言的是**内容对账**；两者互补，前者仍然先红、更好读。
- **`docs/verification.md` 是生成物**：生成者是 `e2e/record.mjs`，入口是 `e2e/matrix.sh`；它同时是 `B7..B11`（"某形态已端到端验证"）的落点，因此那些 ✅ 条目不再是口头声明。
- **未验证的部分照旧写进记录与指南**：`GUIDE_TNB=yes`、非 pnpm 包管理器、非 react-ts 的 SSR 基座、非 vanilla-ts 的 monorepo 应用基座、`GUIDE_TRACKER=other`。记录里有一节"What this record does not prove"，`docs/upstream-drift.md` 给出它们的前置条件与重验入口。
