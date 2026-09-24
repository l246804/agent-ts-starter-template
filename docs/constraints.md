# 约束清单（工作稿）

`GUIDE.md` 的「约束」段（英文）由这份清单生成。🔧 = 初始化时必须落地的动作；📌 = 长期规则；⚠️ = 已知边界（不是规则，是必须写明的限制）。

## 工具链

1. 📌 只用**项目级**工具链：不装全局 vp，指南里不出现全局命令（ADR-0002）。🔧 自举走选定包管理器 + `pnpm dlx --package=vite-plus@<版本> …`。
2. 📌 版本一律**显式钉住**，禁止留 `latest`（`nitro@latest` 会解析到预发布）。🔧 出生证明记录实际解析到的版本。升级走 `vp migrate`，不是 `pnpm update`。
3. 📌 依赖用法以**已安装版本**对应的官方文档为准（决策 #13）。🔧 出生证明即"该查哪个版本文档"的索引。
4. 📌 不手写 vp 配置：配置由生成器产生；任何手改之后必须 `vp fmt`（格式化失败会**短路**，不打印 lint/type 结论）。
5. 📌 **绿必须有意义**：不接受真空绿——无 typecheck 的 `vp check`、无测试的 `vp test`、没接上插件的 Nitro。
6. 📌 vp 自己 AGENTS.md 段里那句"跑 `vp env doctor`"在本项目**是错的**（该命令只有全局 vp 提供），以本清单为准。
7. 📌 TypeScript 使用**最新 v7**：`typescript@^7.0.2`（v7 = 官方 Go 原生移植；`7.0.2` 是唯一稳定 7.x；只提供 `tsc`，**没有** `tsgo`/`tsserver` 包）。🔧 在 vp 组合上实测全绿：`vp check` 仍能抓出故意类型错误、`tsc && vp build` 正常、`vp test` 正常。
   - **项目以 TS7 为主**（决策 Q20）：TS7 是趋势，也是 VSCode 编辑器体验提升的方式之一；预期需要桥接的场景会随 TS 7.1 的"新 API"逐步收窄。
   - 需要 **TS 6 API** 的消费者（目前实测会炸的是 Vue 的 `vue-tsc`）用 **TNB** 桥接：`typescript-native-bridge@6.0.3-bridge.17.tsgo.7.0.2`；pnpm 需 `overrides: { typescript: npm:typescript-native-bridge@<精确版本> }`（caret 匹配不到预发布版），启动时打 `TNB ACTIVE` 横幅。TNB 由 Volar / vue-tsc 作者维护。
     - **TNB 是本项目唯一的 TS6 API 桥接方案**（官方双装已从本清单移出；它仍是一份"已实测可用"的备选，证据留在 `docs/research/typescript-7-and-tnb.md`）。
     - **TNB 用法（README 一手要点）**：把 `typescript` 包换成这个 fork，其余工具（`tsc`、`vue-tsc`、`svelte-check`、`astro-check`、`glint`、ESLint、编辑器）照旧使用——它保留**经典 API 表面**、把 tsgo 引擎放进进程内。pnpm：在 `pnpm-workspace.yaml` 里改 `overrides`，**并且若包通过 `catalog:` 依赖 typescript，catalog 条目必须一起改**（否则那些包仍解析到原版 TypeScript）；npm：devDependency 别名 + `overrides`。
       ```yaml
       catalog:
         typescript: npm:typescript-native-bridge@<version>
       overrides:
         typescript: npm:typescript-native-bridge@<version>
       ```
     - 采用 TNB 的代价：pnpm peer 警告（`--strict-peer-dependencies` 的 CI 会失败）、Alpine/musl 不支持（需 glibc ≥ 2.35）、Node ≥ 20.19。
     - ⚠️ `tsc --version` 在 TNB 下打印 **6.0.3**（它以经典 API 的版本号自报），纯 TS7 下打印 **7.0.2**。所以版本断言必须基于解析路径或 `TNB ACTIVE` 横幅，不能用这个字符串。
   - ⚠️ 桥接后 `tsc --version` 可能打印 6.x：**不要**用版本号断言来校验，改用解析出的路径或横幅。
   - ⚠️ `typescript-eslint@8.x` 的 peer 是 `>=4.8.4 <6.1.0`，**排除 7.0.2**。
   - 📌 纠正：原表述"v7 未实现 TS6 API，计划 v7.1 实现"**不成立**。官方 7.1 迭代计划写的是 7.1 将提供"a new (and different) API"（稳定目标 2026-11-24）——7.1 **不会**恢复 `createProgram`/`TypeChecker`。所以桥接不是两个月的临时措施，而是长期必需品。

## 代码组织

8. 📌 路径别名**使用 Node 原生 `package.json` `imports` 映射**，唯一可用形式是带条件分支的那条：
   ```json
   "imports": { "#/*": { "types": "./*.ts", "default": "./*" } }
   ```
   引用写作 `#/shared/x`（无扩展名）。
   - **`types` 分支是必需的**：TS 解析 imports 目标时**不做扩展名探测**，裸 `{"#*": "./*"}` 会让 Vite dev / Vitest 全绿、而 `vp check` 对每个使用处报 TS2307 —— 又一个"假绿"变体，且方向相反（运行时绿、类型红）。
   - **`tsconfig` 里不得保留 `paths`**：TS 先看 `paths` 再看 `imports`，两者并存意味着"类型检查校验的模块"与"打包器实际加载的模块"可以是两个不同的东西。
   - `moduleResolution` 用 `bundler` 或 `nodenext`（`node16` 不认 `#/…`）；`#/…` 拼写需要 Node ≥ 24.14，否则改用 `#*` —— 二选一，不要混用（混用触发 DEP0166）。
   - 已验证生效：Vite dev / Vite 构建 / Nitro 构建与运行时 / Vitest / SSR 环境 / `vp check`（故意类型错误被抓，TS2322）；产物中别名被内联，无 dev-vs-build 差异。
   - ⚠️ 限制：**裸 `node` 无法执行无扩展名的 `#/x`**（只有 Vite/Nitro/Vitest 能解析）；需要源码直跑时写 `#/x.ts`。
   - 📌 纠正：vp 脚手架**不写** `paths`（tsconfig 只有 `include: ["src"]`，vite.config 只有 `fmt` + `lint`）。带 `paths` + `resolve.tsconfigPaths` 的是 **Nitro 官方 starter**；若两者都留，`paths` 会静默压过 `imports`。
9. 📌 服务端测试**永不放进 `server/`**。准确触发条件是"位于 `server/api/` 或 `server/routes/` 下"——Nitro 会把那里的任何文件编译成路由（实测 `server/api/hello.test.ts` → `/api/hello.test` 500，且测试代码进入 `.output/`）；而 `server/entry-server.ts` 实测**不会**变成路由。对使用者仍采用更简单更严的那条规则：测试不进 `server/`。
10. 📌 测试集中放 `<root>/tests/`；monorepo 中每个子包自带 `<pkg>/tests/`。
11. 📌 **纯前端形态不生成测试命令与测试目录**（页面迭代快，旧用例易失效、维护复杂）。
12. 📌 有后端的项目（backend / fullstack）初始化即生成测试目录 + `.gitkeep`。
13. 🔧 `"test": "vp test --passWithNoTests"`；**不生成示例测试文件**。

## 配置文件

14. 📌 **配置一律精简，且每一项都必须有作用、有意义**：删除与默认值相同的配置项（例：脚手架写出的 `fmt: {}` 是空对象、等于默认，应删除）；只在必要时新增（例：SSR 必需 `environments.client.build.rollupOptions.input`，真实类型检查必需 `lint.options.typeAware`/`typeCheck`）；每条保留的配置都要能对应到"当前版本官方文档里的一个明确理由"；配置必须匹配用户选定的场景（形态 / 布局 / 是否 SSR）。
15. ⚠️ **精简必须验证，不能假设**：任何配置被删除后都要重跑 verify。看起来像默认值的配置可能是承重的——`lint.options.typeAware`/`typeCheck` 被删掉后 `vp check` **完全不查类型**（实测对 `const x: number = "not a string"` 返回 exit 0 并打印 pass）。删配置后必须用一个故意类型错误证明检查仍然生效。这是"配置精简"与"绿必须有意义"的交叉点。

## monorepo 编排（实测）

16. 📌 跨包命令一律用 `vp run -r <task>`：**没有该 task 的包会被静默跳过、rc=0**——这正是脚手架 `ready` 脚本的用法，也是期望行为。`-r check` 同理。
17. ⚠️ 但 `--filter` 会把"缺 task"变成**致命错误**：`vp run --filter ./apps/website test` → `error: Task "test" not found` rc=1（`-r --fail-if-no-match` 则仍是 rc=0）。要么只用 `-r`，要么保证被 filter 的每个包都有该 task。
18. 📌 根 `.gitignore` 里一行 `.output` 覆盖所有子包（`**/.output` 亦可）；漏了它，根 `vp check` 与 `-r check` 都会因为各包的 `.output` 而失败。
19. ⚠️ 根目录的 `vp dev` / `vp build` 需要目标包：`vp -C <pkg> dev` 或 `vp run -r build`；裸跑 rc=1（提示 "needs a target package"）。
20. ⚠️ **端口/环境变量不会被自动透传**：`vp run -F <pkg> start` 会忽略 `PORT`（只转发固定白名单），且**无任何提示**；要在该 task 上声明 `env: ["PORT"]` 或 `untrackedEnv: ["PORT"]`。
21. ⚠️ 同一个名字**不能**同时是根 task 和根 `package.json` script：`vp run` 会报 `Failed to load task graph / Task … conflicts with a package.json script`，并**毒化整个工作区的 `vp run`**。
22. ⚠️ library 包（tsdown）不能用内置 `vp build`：`[UNRESOLVED_ENTRY] Cannot resolve entry module index.html`——它自己的脚本是 `vp pack`；改用 `vp run -r build`（跑脚本）或 `vpr build`。
23. ⚠️ 根 `dev` 脚本里引用 `pkg#task` 时，若该包被删除或改名，脚本会**静默变成 no-op**（rc=0、`0/0 cache hit`）——改名后必须重指。
24. 📌 新增子包后 `vp install` 在 CI 下会因 frozen-lockfile 失败（`ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER`）；用 `pnpm --filter ./<pkg> add -D <dep>`。⚠️ 在 `catalogMode: prefer` 下它会把版本写进**根 catalog**，包内只留 `"<dep>": "catalog:"`。

25. 📌 **根级服务端必须设 `defaultPackage: "."`**（根 `vite.config.ts`）。Vite+ 有工作区根守卫：`vp dev`/`vp build`/`vp preview`/`vp pack` **不会静默作用在根上**，裸跑报 ``error: `vp dev` at the workspace root needs a target package.`` rc=1。设了之后打印 `note: … using . (defaultPackage in vite.config.ts)`，服务端端口是 Nitro 默认的 **3000**（不是 5173）。守卫只在存在成员包时触发。
26. ⚠️ 根目录装依赖要用 `pnpm add -w -D <pkg>`（否则 `ERR_PNPM_ADDING_TO_ROOT`）；`catalogMode: prefer` 下更省事的是往根 catalog 加一行，包内写 `"<pkg>": "catalog:"`。
27. 📌 **Nitro v3 没有自动导入**：`defineHandler` 从 `"nitro"` 导入，或 `defineEventHandler` 从 `"nitro/h3"` 导入。裸用 `defineEventHandler` → 运行时 `ReferenceError`（HTTP 500）+ `TS2304`；而 `import { defineEventHandler } from "nitro"` **也是错的**（`MISSING_EXPORT` / `TS2724` Did you mean 'defineHandler'?）。`defineNitroPlugin` 是 v2 名字，v3 不导出。
28. ⚠️ **本地插件包必须被根声明**：`packages/<plugin>` 需在**根的 dependencies** 里写 `"<plugin>": "workspace:*"`，否则 pnpm 不 link——dev 报 `ERR_MODULE_NOT_FOUND`、build 报 `Rolldown failed to resolve import`、产物运行同样报错。
29. ⚠️ `vp run -r check -v` **会失败**：多余参数被转发给 task（`error: Invalid vite task command: vp with args ["check","-v"]`）。写 `vp run -r -v check`。
30. ⚠️ 根任务失败会**连带 SIGKILL 掉并行中的兄弟任务**（退出码 137），汇总显示 "3 failed" 却只有一条真实错误——不是统计 bug，是连带击杀，且**没有任何产物**。
31. ⚠️ **测试会被跑两遍**：`vp run -r test` 下根的 `vp test` 先做一次全工作区扫描，包自己的 `vp test` 再跑一次。根不要定义"全工作区扫描式"的 `test` 脚本。（另注：`.gitkeep` 自己不产生测试运行。）
32. ⚠️ `vp pack` 会警告 `TypeScript 7.0 does not yet have a stable API and is experimental`——与约束 #7 的 TS7 要求并存，属预期噪音。

33. 📌 **Nitro 输出目录改为 `dist`**：在 `nitro.config.ts` 里加 `output: { dir: "dist" }`（三种配置位置均支持：`nitro.config.ts` / `vite.config.ts` 的 `nitro:` 键 / 内联 `nitro({ output: … })`）。**已实测**：仅 `dir` 一项即搬走全部产物（`dist/server/**` + `dist/public/**` + `dist/nitro.json`），三种形状（单仓全栈 / SSR / monorepo 根服务端）形状一致；启动命令 `node dist/server/index.mjs`；`vp preview` 也报 `Build Directory: dist`。
    - **收益成立**：脚手架 `.gitignore` 第 11 行就是 `dist`（`git check-ignore -v` 已证，跨深度生效）→ **零新增忽略行**；换成 `dist` 后 `vp check` EXIT 0，而用 `.output` 时它 EXIT 1 并列出 9 个产物文件。
    - ⚠️ **绝不另外设置 Vite 的 `build.outDir`**：那会让你的 outDir 被登记为 Nitro 的 public 资源目录，产出嵌套重复的 `dist/public/public/**`，而且**可被公开访问**（`GET /public/assets/*.js` → 200）。只设 `output.dir`。
    - ⚠️ **Nitro 每次构建会整个删掉输出目录**（`rm -rf` + `mkdir`）→ `dist/` 里不要放其他东西。
    - ⚠️ **迁移时必须 `rm -rf .output`**：`last-build.json` 存在 `node_modules`（新克隆 / CI 会缺失），此时 `vp preview` / `nitro preview` 会**静默回退到旧 `.output`** 并服务陈旧构建（已复现：打印 `Build Directory: .output`、返回旧数据 200）；只有 `.output` 不存在时才会大声报 `Cannot load nitro build info`。
    - SSR 的中间产物在 `node_modules/.nitro/vite/services/ssr/**`（不在 `dist`）；开 `build.manifest` 时清单落在 `dist/public/.vite/manifest.json` 与 `dist/server/.vite/manifest.json`。
    - monorepo 下根 / `apps/website` / `packages/utils` 的 `dist` 相互独立、都被 `.gitignore` 覆盖，构建顺序任意；根服务端**不会**自动服务 `apps/website/dist`。
34. 📌 **路径别名只允许 `imports` 一种机制**：禁止 `tsconfig` 的 `paths`、Vite 的 `resolve.alias`、`resolve.tsconfigPaths`。Node 版本不满足时**升级 Node**，不退回其他别名机制。
    **唯一正确形式（TS7 实测；与 TS6 结论相同——TS7 并没有简化它）**：
    ```json
    "imports": { "#/*": { "types": "./*.ts", "default": "./*" } }
    ```
    引用写 `#/shared/x`（无扩展名）。`types` **必须是第一个键**（条件按对象键序判定）；目标文件缺失时 TS 会**继续尝试下一个条件**。
    - ⚠️ 裸写 `{"#*":"./*"}` 的后果（TS7 实测）：`vp check` / `tsc` 对**每个使用处**报 TS2307，而 Vite dev / Vitest / Node 照常工作 → 反向假绿。TS 从未承诺为 `imports` 目标做扩展名探测。
    - ⚠️ **三种机制会三方分歧**（实测）：`paths` 在 `tsc`/`vp check` 中**压过** `imports`；`resolve.alias` 在 Vite 构建中压过 `imports`；真正发货的是 `imports` → 类型检查、打包、产物可以指向三个不同模块，且**全程无红**。
    - 📌 **本项目明确覆盖 Nitro 官方文档的建议**：Nitro v3 的 "Import Alias" 文档推荐 `{"#server/*":"./server/*"}` + tsconfig `paths` + `resolve.tsconfigPaths: true` + 显式 `.ts` 后缀。本项目**不采用**，理由如上（单一机制、避免三方分歧）；读到该文档时以本约束为准。
    - 官方支持：TS 手册原文——"Both libraries and apps can consider package.json `imports` as a standard replacement for convenience paths aliases"。
    - `moduleResolution` 用 `bundler` 或 `nodenext`（TS7 已删除 `node`/`node10`/`classic`，报 TS5108；`node16` 不认 `#/…` 但认 `#*`）。
    - Node 门槛已用真实二进制验证：`#/…` 需 **≥ 24.14.0**（24.13.0 → `ERR_INVALID_MODULE_SPECIFIER`）；`#*` 拼写所有版本可用，但 `#*` + `#/foo` 会触发 DEP0166。
    - 替代写法（仅在需要裸 `node` 直跑时）：`{"#/*":"./*.ts"}`——无扩展名可被 node 执行，但只支持 `.ts`，且引用带 `.ts` 后缀时反而挂。
    - ⚠️ 手工改过 `package.json`（例如加 `imports`）后**必须先 `vp fmt`**：`vp check` 先跑格式化，未格式化会 exit 1 且**完全不打印类型结论**——此时的绿什么都不能证明。
35. 📌 **monorepo 一律只用 vp 命令，禁止 pnpm/yarn/bun 命令**（避免同一个项目里存在两套操作方式）：跨包用 `vp run -r <task>`，定位单包用 `vp -C <pkg> <cmd>`，依赖安装/新增用 `vp install` / `vp add`，常用命令注册在根 `package.json`（例：前后分离的 `dev:server`、`dev:website`）。
   - `vp <name>` 与 `vp run <name>` 的区别（内置命令 vs script/task、script 不能覆盖内置）**不在此重复**：vp 自己写进 AGENTS.md 的「Built-in Commands vs Scripts」段已讲清楚，我们沿用。
   - 我们额外要守的是 vp 那段**没有**说的三条：跨包必须用 `-r`（`--filter` 遇到缺 task 的包是 rc=1，见 #17）；根 task 名与根 script 名不可同名（#21）；根命令需要目标包，所以根服务端要设 `defaultPackage: "."`（#25）。
   - ✅ **已实测（不带 `CI=1`）**：`vp add -D <pkg>` 在**单项目**里可用（RC=0、写入 devDeps、lockfile 更新）；在**workspace 根**也可用且**不需要 `-w`**，并且在 `catalogMode: prefer` 下它把版本写进**根 catalog**、包内只留 `"<pkg>": "catalog:"`。此前观察到的 `ERR_PNPM_ADDING_TO_ROOT` 与 frozen-lockfile 摩擦都来自**直接调 `pnpm` / `CI=1`**，不是 vp 的行为。
   - ⚠️ 残余未验证：上述根级 `vp add` 是在**手工搭的最小 workspace** 上验证的；真实 `vite:monorepo` 脚手架只验证过其它路径（`vp run -r`、构建、catalog），未单独复测 `vp add`。
36. 📌 **服务端不使用 `/api` 前缀**：handlers 放 `server/routes/`（放 `server/api/` 会自动加 `/api`）。生产由 nginx 反代 `api` 前缀并**去掉前缀**；dev 由**前端包**用 **`vite-proxy-from-env@1.1.0`** + `rewrite: ''` 复刻同一行为（已实测等价）。
    **存在规则**：只要存在一个**不与服务端同源的前端**就需要代理，且配置只放在**前端包**里。

    | 形态 | `.env` + 代理 | 代理目标 |
    |---|---|---|
    | 纯前端 | 要（项目根） | **决策点**：问用户后端 API 地址（默认占位 `http://127.0.0.1:3000`） |
    | 全栈 · 前后分离（monorepo） | 要（`apps/website/`） | 根 Nitro 服务端 `http://127.0.0.1:3000` |
    | 全栈 · SSR（单仓） | 不要（同源） | — |
    | 纯后端 | 不要（无前端） | — |

    **实现**：
    - 前端包需要**新建** `vite.config.ts`（脚手架不生成）：`defineConfig(({ mode }) => …)` + `loadEnv(mode, process.cwd(), "")`（**从 `vite-plus` 导入**）+ `server.proxy = proxyTransformer(env.DEV_PROXY)`。
    - `DEV_PROXY` **放 `.env`**（不是 `.env.development`）：`loadEnv` 按 mode 读文件，放 `.env.development` 会让 `vp build`（mode=production）读不到并**误杀构建**。本地覆盖交给用户自己的 `.env.local` / `.env.development.local`（被 `*.local` 规则忽略）。
    - ⚠️ 守卫**无条件、一行**，**不加** `command === "serve"` 判断：`loadEnv` 同时读文件与进程环境，所以它只在变量在两边都不存在时才响——那确实是坏状态。缺它时 `/api/*` 会**静默返回 200 + SPA HTML**（实测，dev 日志零输出）。
    - ⚠️ `prefix` 会被 `new RegExp(prefix)` 编译：必须写 `/api/`（**带尾斜杠**），否则 `/apix/hello` 也会被代理。
    - 已验证：`:5173/api/hello` → 200 JSON 且服务端看到 `/hello`；`:3000/api/hello` → 404（服务端确实无前缀）；`/api` 下未知路径 → 404 而非 SPA；进程环境覆盖 `.env` 生效；目标不通 → 502。
    - 备注：该包由**本仓库作者**维护（第一方，MIT，零依赖）；其 `dist/index.d.ts` 引用了未声明的 `vite`，`skipLibCheck: false` 且项目内无 vite 时会 TS2307——我们 `skipLibCheck: true`，不受影响。

37. 📌 **`.gitignore` 精修**（脚手架产物要改两处）：
   - **`.env` 系列不忽略**：公司项目需要提交 `.env`；只忽略 `*.local`（覆盖 `.env.local`、`.env.development.local`），本地覆盖走 `.env.local` / `.env.development.local`。→ 删除 vp monorepo 根 `.gitignore` 里的 `.env`、`.env.*`、`!.env.example` 三段（`*.local` 已存在，保留）。create-vite 的 `.gitignore` 本来就没有 `.env` 段，无需处理。
   - **`.vscode/` 从 `.gitignore` 移除**：团队统一用 VSCode，编辑器配置需要一致 → 删除 `.vscode/*` 及其 `!` 例外行（根与各包都要改）。

38. 📌 **业务代码默认就地实现（局部性优先）**。抽成共享模块必须通过**两道判据之一**：
   - **(i) 删除测试**：想象删掉这个共享模块——复杂度凭空消失 ⇒ 它只是转发壳，不该存在；复杂度散回 N 个调用方 ⇒ 它在赚钱，应当存在。
   - **(ii) 跨切面**：凡"必须全局一致"的关注点（auth、错误契约、数据访问、遥测、i18n）**必须**下沉，**不允许**各页面自写。
   **架构级 = 明确列举，不靠感觉**：路由与壳、API 客户端及其 auth/错误契约、遥测、设计原语、API 类型契约、服务端框架管道。其余一律先就地。
   **结构表达**：每个页面/特性一个目录，私有代码在其内部；共享代码只放 `src/shared/`（或等价）；依赖**单向**：页面 → shared，shared **永不** import 页面；页面之间**不互相 import**（要么下沉并过判据，要么复制）。
   **唯一可机器校验的部分**：依赖单向性（一条 grep / CI 断言，能红能绿）。其余是**原则**，不是可验证约束——不要假装它被 `vp check` 覆盖。
   **作用域**：初始化产物里没有业务代码，本条只在后续编码时生效（属 AGENTS.md「约束」段，不是初始化动作）。理由与取舍见 ADR-0005。

39. 📌 **不假设不可能发生的场景**：非业务代码按上游文档的用法写，不自造包装。
    - **边界**：只为**实测可发生、且失败是静默的**状态写显式失败；其余防御一律不写。
    - **判据**：写防御前先问"这个状态出现过吗，还是我想象的？"——想象出来的不加；实测到且无声的，必须变成响的。
    - 本指南中符合该边界的防御**只有一处**：`DEV_PROXY` 守卫（#36）。并且**用消除成因代替加分支**——`DEV_PROXY` 的 mode 问题靠"改放 `.env`"解决，而不是靠加 `command === "serve"` 判断。

## 客户侧落点（Q27/Q28 定案）

`GUIDE.md` 执行后，本清单里的内容按**四类**落到目标项目；不发货的部分留在本仓库。

| 本清单内容 | 客户侧落点 | 形式 |
|---|---|---|
| 📌 长期规则（工具链 / 代码组织 / 配置文件） | `AGENTS.md` 的「项目约束」段 | 一行一条、祈使句 + 一句最小理由 |
| 📌 形态相关规则（monorepo / 代理 / SSR） | 同上，**只在该形态出现时写入** | 按形态过滤，不全量倾倒 |
| 🔧 初始化动作（自举、`vp fmt`、写 `.env` …） | `GUIDE.md` 的步骤，**不进客户项目** | 步骤 + verify |
| 为什么 / 取舍 / 被拒的替代 | 目标项目 `docs/adr/0001..0003`（继承 ADR） | 一段话说清 why，与规则互相指认 |
| ⚠️ 已知边界与陷阱 | 目标项目 `docs/agent-notes.md`，由 AGENTS.md 指过去 | 事实清单（非规则），按形态过滤 |
| 本次实际装了什么、做了什么 | 目标项目 `docs/provenance.md` | 版本 / commit / 步骤 / 选择 |
| ⚠️ 待验证项、待办 | **只留本仓库**（内部工作状态） | 解决后转成规则或陷阱，不发货 |
| 本仓库自身的决策（ADR-0001..0005） | **只留本仓库** | 客户看不到也不需要 |

```
<目标项目>/
├── AGENTS.md          ← ① vp 标记段（原样） ② setup 的「Agent skills」块（若运行了）
│                         ③ 我们的「项目约束」段（按形态裁剪） ④ 指针 → docs/agent-notes.md
├── docs/
│   ├── adr/0001..0003 ← 继承 ADR：工具链 / 服务端形态（仅有服务端时）/ 代码局部化
│   ├── agent-notes.md ← 陷阱与版本事实（按形态裁剪）
│   └── provenance.md  ← 出生证明
├── server/            ← 骨架（形态相关）
└── .agents/skills/    ← mattpocock 25 个
```

- **语言**：目标项目的 `AGENTS.md` 约束段、`docs/agent-notes.md`、继承 ADR **一律英文**（与 `GUIDE.md` 及上游文档一致，术语零翻译损耗）；本仓库自身的 `CONTEXT.md` / ADR 保持中文。
- **`docs/agent-notes.md` 刻意不放进 `docs/agents/`**：后者是 `setup-matt-pocock-skills` 的产物目录，它第 1 步会探测"我的产出是否已存在"，混入会干扰它的判断。
- **规则与 ADR 互相指认**：AGENTS.md 给做法，ADR 给理由与"什么情况下可以推翻"。

## 已知边界

- ⚠️ **react-ts 脚手架的 `plugins` 是 `lazyPlugins(() => [react()])`**：Nitro 必须插进那个数组里（`lazyPlugins(() => [nitro(), react()])`）。若另起一个顶层 `plugins:` 键，JS 重复键会让 **Nitro 被静默丢弃**（与"只加 import 不调用"同一类失败）。
- ⚠️ monorepo 里不要再 `vp create` 生成 `apps/website`（脚手架已自带）：会报 `The --git/--no-git options are not available when adding a package to an existing monorepo`。
- ⚠️ **仅当 setup 选用了 GitHub tracker**：目标项目里生成的 `docs/agents/issue-tracker.md` 来自 setup 技能的种子模板，其中的 `issue_dependencies_summary.blocked_by` **不是** `gh issue view --json` 的有效字段名（实测 gh 2.100.0 报 `Unknown JSON field`）。读阻塞边走 `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary` 或 `gh issue view <n> --json blockedBy`。**不要修补那个生成的文件**——技能重跑会用陈旧种子再生成一遍，修补会被静默丢弃；把这条写进 `docs/agent-notes.md`。（上游报告：mattpocock/skills#1118）

- ⚠️ hydration 未在浏览器中验证；指南 verify 只断言"`/` 返回的 HTML 含服务端渲染标记"。
- ⚠️ 构建产物必须被 `.gitignore` 覆盖，否则 `vp check`/`vp fmt` 会去格式化产物（机制：它们的文件集**来自 gitignore 规则**）。采用 #33 的 `dist` 输出时脚手架已自带该行；若保留默认 `.output` 则必须自行追加。
- ⚠️ 后端形态的基座**固定为 `vanilla-ts`**：框架模板的 `vite.config.ts` 自带 `plugins`（react-ts 是 `lazyPlugins(() => [react()])`），而这条路径本来就要把客户端删掉，留着只会多一层要拆的东西。指南在 profile-guard 处直接拒绝其他基座，不进入后面任何一步。
- ⚠️ 设了 `output: { dir: "dist" }` 之后**不要再设 Vite 自己的 `build.outDir`**：Nitro 插件已经把 client 构建指到自己的 public 目录，显式 `build.outDir` 会被登记成又一份 public assets 源，于是 Nitro 把自己的产物再拷进自己（`dist/public/public/**`，且能通过 `/public/…` 访问），全程 exit 0。
- ✅ 后端单仓形态已端到端验证（`e2e/run.sh --profile backend-single`）：无全局 CLI（harness 用一个只会失败的 `vp` 挡在 PATH 最前面）、插件有可访问路由、`/api` 前缀不存在、产物在 `dist/` 且构建后静态检查仍绿、Nitro 版本显式钉住、`tests/` 在路由扫描目录之外。决策与取舍见 ADR-0007。
- ⚠️ 目标目录必须**完全为空**（`vp create` 拒绝非空目录，也不接受已有的 `.git`）。
- ⚠️ SSR 两种形状都实测可行；**探针推荐 B（删 `index.html`）**，因为 A 缺 `<!--ssr-outlet-->` 会**静默**退化为纯客户端壳（SSR 入口照样被探测、照样打日志，`/` 返回纯客户端壳，无警告、exit 0）。Q19 待用户确认。
- ⚠️ 形状不可混用：整文档入口 + 带 outlet 的模板 ⇒ 文档被忽略、body 被塞进模板（嵌套 `<html>`）。
- ⚠️ SSR + react：SSR 入口那句 `export default {` 会常驻一条 `react(only-export-components)` 警告（exit 0），不要去追。
- ⚠️ Nitro 接线后 `vp test` 每次多 ~10s（`close timed out after 10000ms`，exit 0）。
- ⚠️ `tsconfig.tsbuildinfo` 无需进 `.gitignore`（实测带着它 `vp check` 仍 exit 0）；只有 `.output` 必须忽略。
- ⚠️ **`vp check` 绿 ≠ 构建绿**：`vp check` 的类型检查由 tsgolint（基于 TS7 Go 工具链）驱动，与你脚本里的 `tsc` / `vue-tsc` 是**两个引擎**。实测 Vue + TS7 下构建脚本全挂（`vue-tsc -b` 报 `ERR_PACKAGE_PATH_NOT_EXPORTED './lib/tsc'`）而 `vp check` 仍然 exit 0。→ verify 必须**同时**跑 `vp check` 与构建脚本。
- ⚠️ `CI=1` 时裸 `pnpm install` 会 `ERR_PNPM_OUTDATED_LOCKFILE`（需 `--no-frozen-lockfile`）。
- ⚠️ vp 脚手架的 `devEngines.packageManager` 会让 `npm pkg set …` 失败（`EBADDEVENGINES`）——改 package.json 必须直接编辑 JSON。

## 待办

- 用户后续还会补充更多 AGENTS 约束，届时追加到本清单。
