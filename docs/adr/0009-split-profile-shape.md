# 前后分离（`fullstack` × `monorepo`）profile：根服务端 + `apps/website` + 复刻生产反代的 dev 代理

`fullstack`/`monorepo` profile 就是**前后分离形状**：一个 pnpm workspace 里有两个分开部署的一半 —— **workspace 根是服务端**（Nitro v3 作为 Vite 插件、`serverDir: "./server"`、`output: { dir: "dist" }`、路由 URL 即文件路径、不带 `/api` 前缀），**`apps/website` 是前端**（`vp create vite:monorepo` 写出的 create-vite `vanilla-ts` 应用）。前端包里的 dev 代理是**生产边缘的刻意复刻**：从**前端端口**发往 `/api/*` 的请求被转发到根服务端并**剥掉前缀**，服务端看到的永远是 `/hello` —— 与它将来的反代行为逐字一致。全栈的另一个形状（SSR 单仓）是 `fullstack` × `single`；布局是形状开关，不是第四种形态。

本 revision 里前后分离的形状选择是**显式的、且被机器校验的**：

- **根必须是它自己的目标**：Vite+ 有工作区根守卫，`vp dev`/`vp build` 在根上、且存在成员包时直接 `needs a target package`，exit 1。修法是根 `vite.config.ts` 的 `defaultPackage: "."`（替代方案是每条命令都写 `vp -C .`），指南断言文件里这一项，并在 verify 里用真实端口断言服务端确实应答。
- **路由不带 `/api` 前缀**：前缀属于生产反代与前端 dev 代理，由它们剥掉；服务端如果挂在 `server/api/`，dev 下会答 `/api/hello`、而经代理时被改写成 `/hello` —— 只有**穿过代理**才暴露的 404。`server/routes/hello.ts` 的 handler 把**它收到的 path** 回显在 JSON 里（`serverSawPath`），于是"前缀被剥掉"是断言而不是声明。
- **版本只活在 workspace catalog**：脚手架自带 `catalogMode: prefer` 与 `catalog:` 块（`vite-plus`、`typescript`、`vite`（`@voidzero-dev/vite-plus-core` 的别名）、`@types/node`），`apps/website` 与 `packages/utils` 已用 `"…": "catalog:"` 引用。指南往 catalog 加 `nitro` 与 `vite-proxy-from-env`，把写成字面量的 `typescript`/`@types/node` 改回 `catalog:`，并把 catalog 的 `typescript` 行**改写成本次决策的答案**（`GUIDE_TS_VERSION`；TNB 时留给桥接步骤，不覆盖）——否则"版本决策"会被模板自带的 pin 静默顶掉。断言是**每个 manifest 的每个依赖都是 catalog 引用**，且同一依赖在每个声明它的包里解析到**同一个版本**（root/app/utils 的 `vite-plus`、app/utils 的 `typescript`），以及 catalog 里 `nitro`/`typescript` 两行与答案逐字相等。
- **只用 vp 命令**：跨包 `vp run -r <task>`，单包 `vp -C <pkg> <cmd>`，装依赖 `vp install`。**唯一的例外是自举**：`pnpm dlx --package=vite-plus@<版本> vp create vite:monorepo` —— 那时项目还不存在，没有 vp 可调。harness 的断言是"任何包的 scripts 里都不出现 pnpm/npm/yarn/bun 命令"，且根 manifest 注册了 `dev:server`/`dev:website`/`check`/`test`/`build`/`ready`，全部 vp 形式。

## Considered Options

- **单仓 SSR（`fullstack` × `single`）** — 拒绝在这里用：那是另一种部署（一份产物、同源）。两个形状是 `fullstack` 的布局开关，不是同一件东西的两种实现。
- **根服务端同时服务 `apps/website/dist`** — 拒绝：两半各自构建、各自部署；服务端再发一份陈旧的前端就是第二条**会静默分叉**的交付路径。生产由反代统一在前。指南因此不写 `dist/public` 之外的任何前端托管配置。
- **把服务端与前端合并成一个 tsconfig/一个程序** — 拒绝：布局的全部意义就是两个包。根 `vp check` 仍会走**每个包自己的程序**（实测：种在 `apps/website/src` 的类型错误会让根 `vp check` 变红），合并只会抹掉边界，还要长出跨包 `include` 清单。
- **在 manifest 里写版本字面量** — 拒绝：`catalogMode: prefer` + `catalog:` 是脚手架自带机制，"一个依赖一个版本、一个地方"才是根与子包解析一致的原因。
- **把 `apps/website` 换成框架应用** — 本 revision 不做：模板写的是 `vanilla-ts` 应用，换基座是另一个决策、需要自己的一套验证；profile guard 在写任何文件之前拒绝，而不是发一个"渲染得起来但没验过"的项目。
- **删掉脚手架的 `packages/utils`** — 这是**决策点**（`GUIDE_PLACEHOLDER=yes|no`）：保留时把它当未来共享代码的家，并精简掉 library starter 的发布形态（`bumpp`、`prepublishOnly`、占位 repository/author 元数据），版本并入 catalog；选 `no` 时 workspace 除了少一个包完全一样。
- **在工作区里直接用包管理器命令** — 拒绝：同一项目两套操作方式，第二套就是会被用错的那套。`vp install` / `vp run -r` / `vp -C` / `vp add` 覆盖了 `pnpm install` / `pnpm -r` / `pnpm --filter` 在这里的全部用途。
- **`vp dev`/`vp build` 加包装脚本（如 `build: vp run -r build`）** — 拒绝：根 script 与 task/内置命令同名会互相咬（`vp run build` 触发根 script 再触发 `-r`，自引用虽被剪掉，但根的构建也一并被剪掉）；根自己的 `build`/`check`/`test` 就写它自己的内置命令，工作区级命令是 `vp run -r <task>`。

## Consequences

- **两个 dev server、两个端口**：根服务端保持 Nitro 默认 `3000`，应用保持 Vite 默认 `5173`；根 manifest 的 `dev:server` / `dev:website` 是入口。脚手架自带的 `"dev": "vp run website#dev"` 必须删掉 —— 根成为自己的包之后，它会**第二次**启动应用而服务端根本没起（实测）。
- **`ready` 用 `vp test` 而不是 `vp run -r test`**：实测 `-r test` 会先跑根的**全工作区扫描**、再跑每个包自己的 test script —— 同一个测试文件跑两遍且无提示。指南的 `ready` = `vp check && vp test && vp run -r build`。
- **`-r` 的跳过语义是契约**：`vp run -r <task>` 对没有该 task 的包**静默跳过、exit 0**（`apps/website` 没有 `check`/`test`，因为它按决策不生成测试），而 `vp run -F <pkg> <task>` / `-w` 是 `error: Task "…" not found`, exit 1。指南只承诺 `-r`，verify 用 `vp run -r -v check` 的 task 汇总断言 `apps/website` **不在**被调度的任务里；根 `vp check` 仍覆盖全工作区（含应用源码），两者不可互换。
- **代理配置放在前端包**：`apps/website/vite.config.ts`（模板不生成，由指南新建）+ `apps/website/.env`（提交；只忽略 `*.local`）。`DEV_PROXY` 指向本 workspace 的根服务端，目标与根端口必须一致（不一致 → `502`，不是静默 HTML）。守卫是**无条件一行**（`if (!env.DEV_PROXY) throw …`），放在 `.env` 而非 `.env.development` 正是为了让 `vp build`（production mode）也读得到 —— 代价是守卫在 build 时同样会响，这是刻意的：**缺配置就是失败**，而不是"某个 mode 里静默退回 SPA HTML"。实测：`/api/hello` 从前端端口 200 JSON 且 `serverSawPath=/hello`；`/api` 下未知路径 → 服务端 404（不是应用 HTML）；非 `/api` 未知路径 → 应用 HTML 200；目标不可达 → 502。harness 的反向控制删掉 `.env` 里的 `DEV_PROXY` 后**两条路径都断言**：verify（先走到 `vp run --no-cache -r build`）红在 `DEV_PROXY` 上，`vp -C apps/website dev` 也**拒绝启动**并报 `Error: DEV_PROXY is not set — see .env` —— 后者才是"不会静默返回前端 HTML（200）"的那一半，必须单独实测而不是从前者推断。
- **`.gitignore` 精修按包进行**：根 `.gitignore` 删掉 `.env`/`.env.*`/`!.env.example` 与 `.vscode/*` 两组（后者各包也删），保留 `*.local`；因为 `.env` 在前端包里，assert.mjs 把**每个包自己的 `.gitignore`** 一并复制进探针仓库（git 的规则按目录生效），再探 `apps/website/.env`（必须**不**被忽略）、`apps/website/.env.local` 与各包 `dist`（必须被忽略）——只复制根那份会让包级规则（正是这一步编辑的东西）不被断言。
- **继承 ADR 用同一个编号槽**：两个全栈形状各自写 `docs/adr/0004-<shape>.md`（SSR 写 `0004-ssr-shape.md`，前后分离写 `0004-split-shape.md`，互斥），`when=` 用 `&` 联结两个答案（`mode:fullstack&layout:single` / `layout:monorepo`）；`assert.mjs` 断言另一个形状的 0004 不存在。
- **构建与静态检查在根一次跑通**：`vp run -r build`（4 个 task：root/app/utils + 应用里 `tsc && vp build` 被拆成两个）产出 `dist/server/index.mjs` + `dist/nitro.json`、`apps/website/dist`、`packages/utils/dist`；`vp check` 是全工作区静态检查，`vp run -r check` 是逐包形式（跳过应用）。verify 的构建带 `--no-cache`：task runner 会重放缓存，而验证步骤必须让构建真的发生。
- **实测修正（本 ticket 关掉的残余风险）**：根级 `vp add -D <pkg>`（不带 `-w`）在真实 `vite:monorepo` 脚手架上被拒（`ERR_PNPM_ADDING_TO_ROOT`，exit 1，什么都没改）；`vp add -w -D <pkg>` 与 `vp -C <pkg> add -D <pkg>` 都可用，且在 `catalogMode: prefer` 下把版本写进根 catalog、manifest 只留 `catalog:` —— 这条此前只在手工搭的最小 workspace 上验过（constraints #35 的"残余未验证"）。`vp install`（非 CI）在真实脚手架上可用。
- **未验证**：非 `vanilla-ts` 的应用基座、`GUIDE_PLACEHOLDER=no` 分支、`pnpm` 以外的包管理器（catalog/overrides 是 pnpm 专属）、生产反代本身与部署拓扑、浏览器内行为。
