# setup 决策点的两条分支：继承 ADR 的落点由项目自身约定决定

Phase 4.5 从"一条 guard（`yes` 直接拒绝）"变成**两条都可用的分支**，并且继承 ADR 的落点不再是 `GUIDE.md` 里的硬编码路径：

- **`yes`**：用户在对话里运行 `/setup-matt-pocock-skills`（该技能带 `disable-model-invocation: true`，agent 只能执行、不能发起），agent 按该技能自己的流程探索 → 呈现 → 确认 → 写入。流程的写入半边由 `setup-flow`（`when=setup:yes`）承担：它读**已安装技能自己的种子模板**写 `docs/agents/issue-tracker.md` / `triage-labels.md`（仅当 `triage` 技能在）/`domain.md`，并把 `## Agent skills` 块**就地更新**进 `AGENTS.md`（`CLAUDE.md` 存在时优先）。
- **`no`**：流程继续，没有约定被协商，继承 ADR 落默认 `docs/adr/`，并把这个**假定**写进出生证明（`docs/provenance.md` 的 "Assumptions worth revisiting" 段），便于日后迁移。
- **落点由约定决定**：`adr-convention` 沿着"项目自己的 brief"（`AGENTS.md`/`CLAUDE.md` 的 `### Domain docs` 段）找到约定文件（`docs/agents/domain.md`），从它的文件结构树里取出**编号 ADR 文件所在目录**；树只把布局写成**带注释的目录行**时（技能自己的 multi-context 种子就是那个形状：`docs/adr/    ← system-wide decisions`），取那条注释目录。没有约定（setup 被推迟）或树里两样都没有时回退 `docs/adr/`，并把来源写进出生证明。ADR 文本块因此先落到暂存目录 `.vite-plus-inherited-adrs/`，再由 `adr-land` 安装到解析出的落点。
- **不覆盖既成文档**：`adr-land` 对落点上已存在的文件拒绝覆盖；brief 按技能自己的规则就地更新，块外内容逐字保留。`docs/agents/*` 是技能自己的**生成物**——技能第 5 步就说重跑是切换 tracker 的方式——所以那三个文件按技能的语义**从种子重新生成**（并显式打印"已存在、已重新生成"），而不是拒绝；"补丁会被静默丢弃"因此不是一个需要单独处理的拒绝分支，而是这份生成物本来的语义。

## Considered Options

- **落点硬编码 `docs/adr/`** — 拒绝：这正是本条要移除的东西。默认值仍然存在（约定缺失时），但它是一个**有名字的回退**，而不是唯一答案。
- **落点直接取 `GUIDE_ADR_DIR` 这个答案** — 拒绝：答案是用户在确认时给出的，不是项目约定本身；两者分歧时应当**文件赢**。harness 的控制把一份命名了 `documentation/decisions/` 的约定文件种进 scratch、同时把答案设成 `docs/adr`，要求落点跟着文件走。
- **按整行文本解析树** — 拒绝（实测暴露）：技能自己的种子把 multi-context 写成"路径 + 注释"，把整行当作目录名会**静默**得出"这个文件没写 ADR 目录"——而它明明写了。解析只取行首的路径 token；注释形状因此也有控制覆盖（两份种植的约定：编号文件在注释目录下、以及只有注释目录的 multi 形状）。
- **`yes` 分支只写文档、让技能对话自己落所有文件** — 拒绝：那让这条分支在无人值守下不可运行，也未满足验收标准的"两条分支各验证一次"。`setup-flow` 是技能第 4 步（写入）的确定性等价物，种子仍来自技能本身（上游改名会在这一步大声失败）。
- **`docs/agents/*` 已存在且内容不同时拒绝** — 拒绝（review 暴露）：那是给技能**发明**一条它没有的规则——技能第 5 步说重跑就是切换 tracker 的方式，它的生成物本就从种子重来。改为"相同则不动、不同则重新生成并打印"。
- **`GUIDE_TRACKER=other` 也让 guard 放行** — 拒绝：它的文件来自用户自己那段描述，任何预答都只能靠发明；guard 直接拒绝并说明原因，而不是放行一个**永远走不通**的答案。
- **notes 头部用字符串替换改成解析出的目录** — 拒绝：那给同一个需要（"随运行变化的路径"）造了第二种机制（ADR 文本已经用暂存 + 安装解决）。**出厂文本不写运行期才知道的路径**：notes 头改为指向出生证明，目录由出生证明与约束段（运行期写）承载。

## Consequences

- **三条文档各自指认落点**：`AGENTS.md` 约束段的末行与 `docs/provenance.md` 的表格/步骤清单写解析出的目录；`docs/agent-notes.md` 的出厂头部指向出生证明（并断言它**不**出现 `docs/adr/`）。`assert.mjs` 逐份断言，另加"运行不留 `.vite-plus-*` 暂存"与"出生证明的收尾小节仍是标题"两条结构断言（后者是实测抓到过的：命令替换会吃掉尾换行，把段落与下一个标题粘连）。
- **两条分支各由 profile 跑一次**：`frontend-single` 取 `yes`（GitHub tracker + `GUIDE_ADR_DIR=docs/decisions`，因此"选是之后落点跟随约定变化"是端到端证据），其余八个 profile 取 `no`。`assert.mjs` 的分支断言全部由**答案**驱动（`GUIDE_SETUP` / `GUIDE_TRACKER` / `GUIDE_DOMAIN_LAYOUT` / `GUIDE_ADR_DIR`），不看目标里恰好有什么。
- **`run.sh` 新增 `setup_controls`**：guard 拒绝"有 `yes` 却没有答案"与"`other`"；落点读约定（带注释的树、以及只有注释的 multi 形状，都压过答案，且默认目录必须没被使用）；落点上已存在的文档不被覆盖；`yes` profile 里再在 scratch 项目跑一遍**其余子答案**（`local` → `gitlab` + `multi` + 默认 ADR 目录），断言生成物按种子重生成、brief 只留一个块、且"流程没写过的那一段"原样保留。
- **未验证**：`GUIDE_TRACKER=other`（guard 直接拒绝，指南与 README 都写明），以及非 `frontend/single` 形态下跑 setup flow 的组合——流程不按形态分支，但 harness 只在那个 profile 里跑它。
