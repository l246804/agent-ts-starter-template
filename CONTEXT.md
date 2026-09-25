# agent-ts-starter-template

A framework-agnostic TypeScript starting point for agent-driven work. This repo's product is not a template project: it is a guide an agent reads and executes to turn an empty directory into a pruned, Vite+-managed project.

## Language

### The artifact

**指南 (guide)**:
The repo's only product — the ordered steps an agent reads and executes, every command non-interactive, ending in a target project ready for work. Delivered as 索引 + 分片 (a run takes only its own); glued in order they are `GUIDE.md`, whose `guide:` marked blocks are both the instructions and the E2E harness's executable plan.
_Avoid_: 模板, 初始模板, 文档, recipe

**索引 (index)**:
The one text the client agent fetches first: the head, the 预答 table, Phase 0–2 (preflight, profile-guard) and this run's 路由表.
_Avoid_: 目录, README, 入口

**分片 (part)**:
A slice of the guide's body that a run may take on its own; its edge is one `when=` gate, and the ungated steps belong to the shared slice.
_Avoid_: 片段, 章节, 模块

**路由表 (router)**:
The table in the 索引 that names, per profile, which 分片 to take and which step ids that run executes. It is machine-checkable against the plan.
_Avoid_: 目录, 清单

**拼接自检 (assembly check)**:
The offline check that keeps the two views of the guide together: the 分片 glued in order must equal `GUIDE.md`, and each profile's glue order must equal the order it actually executes.
_Avoid_: 一致性测试, 校验脚本

**预答 (pre-answered answers)**:
The decision points supplied up front as `GUIDE_*` environment variables, which is what lets the whole flow run unattended — and what the E2E harness supplies from a profile file.
_Avoid_: 参数, 配置, 环境变量

**profile**:
One supported combination of answers — a (形态, 布局) pair plus the branch of the decision that has more than one (the layout's 占位子包 decision, the setup decision) — with its pre-answered answers file and its own harness assertions. It is the unit a later ticket adds, and the only thing `e2e/run.sh --profile` selects.
_Avoid_: 模版, 场景, 配置集

**覆盖矩阵 (coverage matrix)**:
The item space this repository owns — every numbered item and boundary of `docs/constraints.md`, plus the inherited ADRs — mapped onto the shipped text of each profile's two documents, alongside the profile set that runs both answers of the monorepo layout's 占位子包 decision and both branches of the setup decision (the guide's deliberately unexercised branches — the TS bridge, other package managers, other bases, `GUIDE_TRACKER=other` — are listed as such, not covered). It is machine-checked in both directions (no item unshipped, no shipped bullet unclaimed), run in full by `bash e2e/matrix.sh`, and recorded in `docs/verification.md`.
_Avoid_: 测试矩阵, 场景表, 覆盖率

**验证段 (verify step)**:
The guide's last step, marked `guide:verify`: the single assertion set for one initialization, extracted and run as-is by the harness rather than re-implemented next to it.
_Avoid_: 测试脚本, 检查项

**精简 (pruning)**:
The work the guide performs on a scaffold: deleting redundant files, adapting code, and trimming the generator's own explanatory files.
_Avoid_: 改造, 调整, 优化, cleanup

**决策点 (decision point)**:
A step where the guide must stop and ask the user instead of choosing, offering the concrete options with a recommendation. The setup decision point (Phase 4.5) is the one only the user can answer: it decides whether to run the user-invocable setup skill.
_Avoid_: 交互步骤, 确认项, 询问

**项目约定 (project convention)**:
The domain-doc contract a 目标项目 carries (`docs/agents/domain.md`, reached from the `## Agent skills` brief in `AGENTS.md`/`CLAUDE.md`): the layout (单上下文 / 多上下文) and the directory its ADRs live in. 继承 ADR 的落点 is whatever it says; `docs/adr/` stands only as the fallback for a project whose setup flow was deferred.
_Avoid_: 规范, 项目配置, 硬编码落点

**约束 (constraints)**:
The project-owned section of the target project's `AGENTS.md` — its engineering rules, kept outside the tool-owned marked block.
_Avoid_: 开发规范, 规则, 约定

**出生证明 (provenance)**:
The record of one initialization: the versions actually resolved, the skills commit, the steps run, and the choices made.
_Avoid_: 初始化日志, 记录

### The initialized project

**目标项目 (target project)**:
The project being initialized — the empty directory the guide acts on.
_Avoid_: 用户项目, 新项目

**形态 (mode)**:
Which kind of project is being initialized: `frontend`, `fullstack`, or `backend`. Mutually exclusive; it decides what gets generated.
_Avoid_: 类型, 模式, 项目种类

**布局 (layout)**:
Whether the target project is a single repo or a monorepo. Orthogonal to 形态 — a monorepo is a way of arranging a 形态, never a fourth one; all three modes support both. In `fullstack` mode it is also the switch between the two shapes: `single` is SSR, `monorepo` is the split frontend/backend. In the other two modes it is only the layout: `backend` × `monorepo` is the backend workspace shape, `frontend` × `monorepo` the frontend workspace shape.
_Avoid_: monorepo 形态, 结构

**SSR 形状 (SSR shape)**:
`fullstack` × `single` — one project that renders the page on the server and hydrates it in the browser, with its API on the same origin, so it has no dev proxy and no `index.html`. The other fullstack shape is the split frontend/backend, which is `fullstack` × `monorepo`.
_Avoid_: SSR 形态, SSR 模式, 服务端渲染项目

**前后分离形状 (split shape)**:
`fullstack` × `monorepo` — one pnpm workspace whose root package is the server (Nitro v3 as a Vite plugin, `defaultPackage: "."`, routes with no `/api` prefix) and whose frontend is the app under `apps/website`. The two halves are two dev servers on two ports, and the app reaches the API through a dev proxy that strips `/api/` exactly as the production reverse proxy does. Versions live in the workspace catalog; the plan (布局) is one workspace, the deployment is two artefacts.
_Avoid_: monorepo 形态, 前后端分离项目, 微服务

**后端工作区形状 (backend workspace shape)**:
`backend` × `monorepo` — the same server the single layout builds, in the workspace layout: the root package *is* the Nitro server, the app the template wrote (`apps/website`) is deleted in the same run because a backend project has no client, and the workspace's second package is the layout's placeholder decision (`packages/utils`, kept or deleted). Every root command is re-pointed at what the workspace has (`dev:server`, `check`, `test`, `build`, `ready`); a script left naming the deleted package would exit 0 having run nothing.
_Avoid_: 后端 monorepo（口语可以，正式文本用「后端工作区形状」）

**前端工作区形状 (frontend workspace shape)**:
`frontend` × `monorepo` — the same app the split shape uses, under a root that is only a shell: the root owns the catalog and the commands (`dev:website`, `check`, `ready`), nothing in the workspace compiles a server, and the app's backend is somebody else's — named by `GUIDE_DEV_PROXY` (with the `http://127.0.0.1:3000` placeholder) and reached through the dev proxy in `apps/website`.
_Avoid_: 前端 monorepo（口语可以，正式文本用「前端工作区形状」）

**骨架 (skeleton)**:
The file structure of the initialized target project, with no business logic in it.
_Avoid_: 初始模板

**脚手架 (scaffold)**:
The unpruned output of one generator step (`vp create`, `create-vite`, Nitro's own init) — the input to 精简.
_Avoid_: 骨架, 模板
