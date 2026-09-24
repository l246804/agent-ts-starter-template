# agent-ts-starter-template

A framework-agnostic TypeScript starting point for agent-driven work. This repo's product is not a template project: it is a guide an agent reads and executes to turn an empty directory into a pruned, Vite+-managed project.

## Language

### The artifact

**指南 (guide)**:
The repo's only product — the ordered steps an agent reads and executes, every command non-interactive, ending in a target project ready for work.
_Avoid_: 模板, 初始模板, 文档, recipe

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
Whether the target project is a single repo or a monorepo. Orthogonal to 形态 — a monorepo is a way of arranging a 形态, never a fourth one.
_Avoid_: monorepo 形态, 结构

**骨架 (skeleton)**:
The file structure of the initialized target project, with no business logic in it.
_Avoid_: 初始模板

**脚手架 (scaffold)**:
The unpruned output of one generator step (`vp create`, `create-vite`, Nitro's own init) — the input to 精简.
_Avoid_: 骨架, 模板
