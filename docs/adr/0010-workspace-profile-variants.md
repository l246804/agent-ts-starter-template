# 两个 workspace 变体：根即服务端（backend）与壳根 + 应用包（frontend）

`backend/monorepo` 与 `frontend/monorepo` 是同一份 `vite:monorepo` 脚手架的另外两种排列，与已有的前后分离（`fullstack/monorepo`）共用 workspace 骨架和全部"布局级"步骤，形态差异全部落在**包的去留**与**根命令的重指**上：

- **`backend/monorepo`**：根即 Nitro 服务端（`defaultPackage: "."` + `plugins: [nitro()]`、`serverDir: "./server"`、`output: { dir: "dist" }`、`server/routes/` 无 `/api` 前缀），模板写出的 `apps/website` **整包删除**（后端项目没有客户端），workspace 的另一个包是占位决策 `GUIDE_PLACEHOLDER`（保留时它自带 `package.json` / `tsconfig.json` / `vite.config.ts` / `tests/` / 自己的 `dist`，并被精简掉 library starter 的发布形态与版本字面量）。根命令注册 `dev:server` / `check` / `test` / `build` / `ready`，没有 `dev:website`。
- **`frontend/monorepo`**：根是**壳**（不是应用，不设 `defaultPackage`，不装 nitro），应用是模板写出的 `apps/website`；后端在别处，因此 `GUIDE_DEV_PROXY` 仍是**决策点**（未答时写默认占位 `http://127.0.0.1:3000`），代理与守卫放在**前端包**（`apps/website/vite.config.ts` + `apps/website/.env`）。根命令注册 `dev:website` / `check` / `ready` —— 根自己没有可构建的东西，workspace 构建是 `vp run -r build`，`vp run -r` 对没有该 task 的根**静默跳过**是契约。

## Considered Options

- **只为 `backend/monorepo` 加一个 profile，`frontend/monorepo` 留在"未实现"** — 拒绝：父 issue 的覆盖矩阵要求"全部形态与布局"，而 `frontend/monorepo` 是"只要布局"这一条用户故事唯一能被验证的形态（占位子包的 yes/no 也正好由两个新 profile 各跑一支）。两者共用同一套 workspace 步骤，增量成本主要在两份断言与两次 e2e 运行。
- **把三种 monorepo 排列写成三份互不复用的步骤** — 拒绝：`workspace-skeleton` 的 catalog / 占位决策 / 版本共享证明、`workspace-app` 的页面精简，在三种排列里逐字相同；复制三份会让"布局级"与"形态级"的边界消失，而维护者要改的是边界。模式分支集中在两个变量（`has_server`、`app`）与三处命令表上。
- **后端 workspace 保留一个占位 `apps/website`** — 拒绝：后端项目没有客户端，留一个空壳应用就是"某个东西迟早会去构建/部署它"。整包删除是消除成因，同 ADR-0007 删除单仓客户端。
- **壳根也设 `defaultPackage: "."`** — 拒绝：那是让 vp 的应用命令作用于根的开关；壳根没有应用命令（根上不跑 `vp dev`/`vp build`），设了它只会让 `vp build` 在根本不该有产物的地方工作。断言因此是"frontend workspace 里**没有** `defaultPackage`、没有 nitro 依赖、没有根服务端产物"。
- **根 `build: "vp run -r build"`（frontend workspace）** — 拒绝（沿用 ADR-0009 的实测结论）：根 script 与 task 同名会自引用，被剪掉的是**根自己那一条**；这里根本来就无可构建，但把它写成自引用会让"构建覆盖了哪些包"取决于 runner 的剪枝语义而不是清单，因此 workspace 构建以 `vp run -r build` 的形式写在文档与 `ready` 里，而不是当作根的 build script。
- **默认占位目标写 `localhost` 或留空** — 拒绝：留空让守卫在生成后就立刻炸（`DEV_PROXY` 必须存在）；`localhost` 在不同解析下可能指向 IPv6。写 `http://127.0.0.1:3000`，与决策表里记的默认一致，且"指向没人监听的端口"是**响亮**的 `502`，不是静默 HTML。

## Consequences

- **`vp run <pkg>#<task>` 是这条路径上的静默失败**（约束 #23 的实测形态：exit 0、`vp run: 0/0 cache hit`、什么都没跑）。模板自带的 `"dev": "vp run website#dev"` 正是这个形状，而 `backend/monorepo` 会把 `apps/website` 删掉。因此：根命令一律重指（`workspace-skeleton` 的清单检查 + 断言里的"任何 manifest 的 script 都不得出现 `pkg#task` 形式"），并且 harness 新增反向控制——把那条 `dev` 脚本种回根 manifest，要求 `assert.mjs` 拒绝并点名这个形状。
- **`backend/monorepo` 的"根命令不是空操作"是可证的**：`workspace-plugin` 清空 `dist` 后跑 `vp run --no-cache -r -v build`，要求 task 汇总里出现 `#build` 且 `dist/server/index.mjs` 重新出现；verify 的构建产出断言也覆盖它。
- **`frontend/monorepo` 的 verify 不再无条件跑 `vp run test`**：该形态按决策没有测试 harness（同纯前端单仓）。verify 的 tests 步改为"清单里有 `test` script 才跑"，monorepo 与单仓分别用 `vp run test` / 包管理器 run（这一条是 e2e 实测暴露后修的：`Task "test" not found`）。
- **形状 ADR 的 0004 槽位按形态互斥**：`0004-ssr-shape.md`（SSR）、`0004-split-shape.md`（前后分离）、`0004-backend-workspace.md`、`0004-frontend-workspace.md` 各写一份，断言"恰好一份 0004，且是本形态的那份"。
- **约束与陷阱按形态裁剪**：`backend/monorepo` 得到 Workspace + Server + Tests 三段（没有代理段）；`frontend/monorepo` 得到 Workspace + Development proxy (apps/website) + Tests（没有 Server 段、没有 `defaultPackage` 那条、没有 `.output` 陷阱）。`notes-workspace` 重指为 `when=layout:monorepo`，"根是应用"的那三条（`defaultPackage`、根程序即整个 workspace 的 TypeScript 程序、包删除后必须重指命令）拆到 `notes-workspace-root-server`。
- **占位子包的两支各跑一次**：`backend-monorepo` 取 `GUIDE_PLACEHOLDER=yes`（断言子包自带骨架与配置并参与 workspace 构建），`frontend-monorepo` 取 `no`（断言 `packages/utils` 与空的 `packages/` 都被删除）。前后分离仍取 `yes`；它自己的 `no` 分支仍是文档里写了、harness 未跑的那一支，指南明说。
- **未验证**：非 `vanilla-ts` 的 app 基座、前后分离 profile 的 `GUIDE_PLACEHOLDER=no` 分支、`pnpm` 以外的包管理器、真实的第三方后端（`frontend/monorepo` 的代理目标在 e2e 里是 stub）、生产反代与部署拓扑。
