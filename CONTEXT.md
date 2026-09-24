# agent-ts-starter-template

A framework-agnostic TypeScript starting point for agent-driven work. This repo's product is not a template project: it is a guide an agent reads and executes to turn an empty directory into a pruned, Vite+-managed project.

## Language

### The artifact

**指南 (guide)**:
The repo's only product — the ordered steps an agent reads and executes, every command non-interactive, ending in a target project ready for work. Shipped as `GUIDE.md`, whose `guide:` marked blocks are both the instructions and the E2E harness's executable plan.
_Avoid_: 模板, 初始模板, 文档, recipe

**预答 (pre-answered answers)**:
The decision points supplied up front as `GUIDE_*` environment variables, which is what lets the whole flow run unattended — and what the E2E harness supplies from a profile file.
_Avoid_: 参数, 配置, 环境变量

**profile**:
One supported (形态, 布局) combination with its pre-answered answers file and its own harness assertions — the unit a later ticket adds, and the only thing `e2e/run.sh --profile` selects.
_Avoid_: 模版, 场景, 配置集

**验证段 (verify step)**:
The guide's last step, marked `guide:verify`: the single assertion set for one initialization, extracted and run as-is by the harness rather than re-implemented next to it.
_Avoid_: 测试脚本, 检查项

**精简 (pruning)**:
The work the guide performs on a scaffold: deleting redundant files, adapting code, and trimming the generator's own explanatory files.
_Avoid_: 改造, 调整, 优化, cleanup

**决策点 (decision point)**:
A step where the guide must stop and ask the user instead of choosing, offering the concrete options with a recommendation.
_Avoid_: 交互步骤, 确认项, 询问

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
Whether the target project is a single repo or a monorepo. Orthogonal to 形态 — a monorepo is a way of arranging a 形态, never a fourth one. In `fullstack` mode it is also the switch between the two shapes: `single` is SSR, `monorepo` is the split frontend/backend.
_Avoid_: monorepo 形态, 结构

**SSR 形状 (SSR shape)**:
`fullstack` × `single` — one project that renders the page on the server and hydrates it in the browser, with its API on the same origin, so it has no dev proxy and no `index.html`. The other fullstack shape is the split frontend/backend, which is `fullstack` × `monorepo`.
_Avoid_: SSR 形态, SSR 模式, 服务端渲染项目

**前后分离形状 (split shape)**:
`fullstack` × `monorepo` — one pnpm workspace whose root package is the server (Nitro v3 as a Vite plugin, `defaultPackage: "."`, routes with no `/api` prefix) and whose frontend is the app under `apps/website`. The two halves are two dev servers on two ports, and the app reaches the API through a dev proxy that strips `/api/` exactly as the production reverse proxy does. Versions live in the workspace catalog; the plan (布局) is one workspace, the deployment is two artefacts.
_Avoid_: monorepo 形态, 前后端分离项目, 微服务

**骨架 (skeleton)**:
The file structure of the initialized target project, with no business logic in it.
_Avoid_: 初始模板

**脚手架 (scaffold)**:
The unpruned output of one generator step (`vp create`, `create-vite`, Nitro's own init) — the input to 精简.
_Avoid_: 骨架, 模板
