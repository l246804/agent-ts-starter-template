# 上游漂移：重新验证什么

`GUIDE.md` 的每一条约束、每一个陷阱、每条断言，都是**某个上游版本上实测成立**的事实。上游一移动，这些事实可能不再成立——而且这份指南通篇处理的就是**静默失效**（假绿、no-op、被忽略的配置），所以"漂移"通常不会自己喊出来。

这份清单是漂移时的重验入口：**上游面 → 指南钉住的事实 → 先看哪个可观察量 → 跑什么能证明它**。每条都指回本仓库的一手研究文档（`docs/research/`），那里有 verbatim 证据与出处。

## 怎么用

1. 把触发面收敛到一行（例如"`vite-plus` 从 `1.0.0-rc.0` 升到下一个 rc"）。
2. 先看该行的**可观察量**——多数漂移在跑矩阵之前就能看见（版本号、脚手架文件树、`vp --version` 的输出）。
3. 跑该行的**最小重验集**；红了按指南的规则办：**停下来报告，不要修到绿为止**（"修到绿"会掩盖真实的版本变化）。
4. 无论红绿，最后跑一次全矩阵并更新记录：`bash e2e/matrix.sh` → `docs/verification.md`。
5. 结论要落回清单：新的实测事实 → `docs/constraints.md`（编号项或边界项）；新的陷阱 → GUIDE.md 的相应 `notes-*` 步骤；被推翻的旧结论**删除并改写**，不留"两种说法"。

最小重验集就是 profile 名（`e2e/profiles/<name>.env`）；一条命令：`bash e2e/run.sh --profile <name>`。

---

## 一张表

| 上游面 | 指南钉住的事实 | 漂移先看什么 | 最小重验集 |
| --- | --- | --- | --- |
| `vite-plus`（`1.0.0-rc.0`） | 模板 id 与脚手架树、`defaultPackage` 根守卫、catalog 模式、`vp run -r` 跳过语义、task 缓存、`vp check` 的两段式与 type-aware 开关、项目级 CLI 的命令面 | `vp --version`；出生证明里记录的 create-vite 版本（`vp create` 打印时读输出，否则读 resolver 的 dlx cache）；`vp run -r -v check` 的 task 汇总 | `frontend-single` → 六个 monorepo profile（含三个 `-placeholder-*` 变体） |
| `create-vite`（不可钉住） | `react-ts` 的 `lazyPlugins` 形状、`vanilla-ts` 的 demo 文件、两个 project-reference tsconfig、`.gitignore` 的 `dist` 行、`src/main.ts` 入口名 | `vp create` 打印的 create-vite 版本；生成的 `vite.config.ts` / tsconfig / `.gitignore` 形状 | `frontend-single`（react-ts）+ `fullstack-monorepo`（vanilla-ts 应用） |
| `nitro` v3（`3.0.260903-beta`，只有预发布） | `serverDir` 默认 `false`、`output.dir`、无自动导入、`node-server` preset 与 `PORT`、SSR 契约与 `?assets` 查询、`index.html` 模板的静默退化、catch-all 路由、dev 端口 3000、`vp test` 的 10s 收尾 | 安装到的 nitro 版本；`dist/server/` 的形状（`index.mjs`、`_ssr/`）；`/hello` 与 `/api/hello` 的状态码 | 六个有服务端的 profile：`backend-single`、`fullstack-single`、`fullstack-monorepo`、`fullstack-monorepo-placeholder-no`、`backend-monorepo`、`backend-monorepo-placeholder-no` |
| TypeScript 7（`^7.0.2`） | `imports` 解析与 `types` 首键、`moduleResolution` 取值、`#/…` 的 Node 门槛、`tsc --version` 为 `7.0.2`、构建脚本与 tsgolint 两引擎 | 解析出的 `typescript` 版本；一条故意类型错误是否让 `vp check` 与构建双双变红 | `frontend-single` + `backend-single`（覆盖别名与合并程序两侧） |
| `typescript-native-bridge`（`6.0.3-bridge.17.tsgo.7.0.2`） | catalog 与 `overrides` 必须一起改、`tsc --version` 自报 `6.0.3`、peer 警告与 glibc 门槛 | **未跑过**：跑一次带 `vue-ts` 的前端并看 `TNB ACTIVE` 横幅与 `vue-tsc -b` | 无 profile（人工一次，见下） |
| `skills` CLI（`1.7.0`）+ `mattpocock/skills` | `--skill a b` 空格写法、`--skill=` 会静默装全部、lockfile 名字集合是唯一可信来源、上游 manifest 决定名单、setup 技能的种子与 `disable-model-invocation` | 上游 `.claude-plugin/plugin.json` 的名单与数量；`skills-lock.json` 的名字集合；安装后的 `skills --version` | 任意一个 profile（skills 步 + lockfile 断言）+ `frontend-single`（setup 跑 `yes`） |
| `vite-proxy-from-env`（`1.1.0`） | `proxyTransformer(env.DEV_PROXY)`、`rewrite: ''` 剥前缀、`prefix` 被当正则编译（`/api/` 尾斜杠） | dev 日志里被代理的路径；`:5173/api/hello` 到服务端是否变成 `/hello` | `frontend-single`、`frontend-monorepo`、`fullstack-monorepo` |
| `vite`（随 `vite-plus`） | `loadEnv(mode, cwd)` 的文件/进程两读、`server.proxy`、SPA fallback 在 `/api` 内外不同、`environments.client.build.rollupOptions.input`、`?assets=client|ssr` | `.env` 是否被 `production` 模式读到；未知 `/api/…` 是否返回 HTML（那正是失败信号） | `fullstack-single`（SSR）+ 五个带代理的 profile |
| Node（≥ 24.14.0） | `#/…` 无扩展名导入可解析、`#*` 拼写与 DEP0166、preflight 的硬门槛 | `node --version`；`node -e "import('#/x')"` 的错误码 | preflight 的反向控制（假 node）+ 任意 profile |
| pnpm + catalog | `catalog:` 引用、`catalogMode: prefer`、`pnpm add -w`、`CI=1` 的 frozen lockfile、store 落在仓库根、`devEngines` 的 `EBADDEVENGINES` | `pnpm-workspace.yaml` 的 catalog 段与各 manifest 的 spec；`pnpm install` 在 CI 下的行为 | 六个 monorepo profile |
| 上游**文档的建议**（与本仓库决策相反处） | Nitro 官方 "Import Alias" 推荐 `paths` + `resolve.tsconfigPaths`，本项目**不采用**；vp 自己的 AGENTS.md 段推荐 `vp env doctor`，项目级 vp **没有**该命令 | 上游文档改口后，目标项目读到的是哪一套；`vp env doctor` 是否真的不存在 | 不跑；改的是本仓库的约束措辞与指南里"以本约束为准"的句子 |

---

## 逐面

### `vite-plus`

- **钉住的东西**：`docs/constraints.md` 的 C1、C2、C4、C5、C16–C19、C21、C23–C26、C29–C32、C35；`GUIDE.md` 的 Phase 0/3 步骤与全部 workspace 步；`assert.mjs` 的 monorepo 命令断言。
- **漂移信号**：`vp --version` 不再是 `1.0.0-rc.0`；`vp create vite:application|vite:monorepo` 的模板 id 改了；根不再拒绝裸 `vp dev`（`defaultPackage` 变成默认行为）；`vp run -r` 对缺 task 的包从"静默跳过"变成报错；type-aware 开关改名（`lint.options.*`）；`vp fmt` 不再短路 `vp check`。
- **重验**：`frontend-single` 先跑（它覆盖 `vp create`、`vp check`、代理与 setup `yes`），再跑 `fullstack-monorepo` 与 `backend-monorepo`（覆盖 catalog、`-r`、根命令与根服务端）；`--no-cache` 的构建断言必须仍然存在（C16 的缓存陷阱）。
- **证据**：`docs/research/vite-plus-create.md`、`docs/research/vp-project-local.md`。

### `create-vite`

- **钉住的东西**：C7（TS 版本替换）、B1（`react-ts` 的 `lazyPlugins`）、B6（后端基座 `vanilla-ts`）、B5（`.gitignore`）、SSR 步骤对 `src/`/`index.html` 的删改、`src/main.ts` 的入口名。
- **漂移信号**：脚手架不再写 `lazyPlugins`（Nitro 的注册位置换了）；`index.html` 或 `src/main.ts` 改名/移位；`.gitignore` 不再包含 `dist`（那会让 `vp check` 去格式化构建产物）；tsconfig 从两个 project-reference 变成一个。
- **重验**：`frontend-single`（react-ts，含 `lazyPlugins` 断言）+ `fullstack-monorepo`（vanilla-ts 应用）。
- **注意**：create-vite **不可钉住**（`vp create` 内部解析 `create-vite@latest`），所以它是唯一"每次全矩阵都可能变"的输入；漂移的第一手记录是出生证明里的 create-vite 版本行 —— 它读 `vp create` 的输出，读不到时读 resolver 留下的 dlx cache（`${XDG_CACHE_HOME:-~/.cache}/pnpm/dlx/*/*/node_modules/.pacquet/create-vite@*/…`，实测 `9.2.1`），两处都读不到时**明说**读不到，而不是留空。证据：`docs/research/vite-plus-create.md`。

### `nitro` v3

- **钉住的东西**：C5（插件必须被**调用**）、C9/C10（路由扫描与 `tests/`）、C25（dev 端口 3000）、C27（无自动导入）、C33（`output.dir` 与 `.output` 回退）、B7（不要设 Vite 的 `build.outDir`）、B16–B21（SSR 契约、指纹、警告）、B23（`vp test` 收尾）。
- **漂移信号**：v3 出稳定版（`latest` 不再是预发布——那时 C2 的措辞要改）；`serverDir` 默认值变化；SSR 入口契约变化（`export default { fetch }`）、`?assets=client|ssr` 的查询名变化、内置 renderer 需要模板；`_ssr/` 指纹变化；`defineHandler` 的导出面变化；dev 端口不再由 Nitro 决定。
- **重验**：六个有服务端的 profile（上表最后一列），其中 SSR 的两个反向控制（种 `index.html`、移除渲染标记）必须仍然红在各自的点上。
- **证据**：`docs/research/nitro-v3.md`、`docs/research/nitro-dist-output.md`。

### TypeScript 7 与 TNB

- **钉住的东西**：C7、C8、C34；`assert.mjs` 的别名断言（`imports` 唯一形式、`types` 首键、故意类型错误）。TNB 一侧：C7 的子项、`docs/agent-notes.md` 的 "Versions" 段。
- **漂移信号**：TS 7.1+ 引入新 API（**不会**恢复 `createProgram`/`TypeChecker`，见 `typescript-7-and-tnb.md`）；`imports` 的解析规则变化（例如开始做扩展名探测——那会让方向相反的假绿消失，但也让 `types` 首键的理由改写）；`moduleResolution` 的合法取值变化；TNB 的版本串与上游节奏变化。
- **重验**：`frontend-single`（别名 + `vp check` + 构建脚本）与 `backend-single`（合并程序覆盖 `server/`）。
- **TNB 是未跑过的一支**：`GUIDE_TNB=yes` 在任何 profile 里都没有跑过。重新采用它之前，先手动跑一次 `vue-ts` 的前端（catalog 与 `overrides` 一起改、看到 `TNB ACTIVE`、`vue-tsc -b` 通过），再把结论写回清单；否则按指南的规则，把它当**未证明**处理。
- **证据**：`docs/research/typescript7-imports.md`、`docs/research/node-imports-aliases.md`、`docs/research/typescript-7-and-tnb.md`。

### `skills` CLI 与 `mattpocock/skills`

- **钉住的东西**：C40、C41；Phase 4 的"运行时解析名单 → 安装 → 校验 lockfile"；Phase 4.5 的 `setup-flow`（技能的种子模板、`## Agent skills` 块、`disable-model-invocation`）；B3（GitHub 阻塞边陷阱）。
- **漂移信号**：`--skill` 的语法被修好（等号写法不再静默装全部）或再次变化；lockfile 结构变化（出现 revision 字段）；上游 manifest 的位置（`.claude-plugin/plugin.json`）或"晋升集合"的语义变化；技能被改名/拆并（简报与陷阱段会跟着变）；setup 技能的种子文件名变化（`issue-tracker-*.md`、`triage-labels.md`、`domain.md`）。
- **重验**：任意一个 profile 的 skills 步（lockfile 名字集合 == 上游 manifest 名单）+ `frontend-single`（`yes` 分支：种子、brief、约定、GitHub 陷阱）。
- **注意**：名单**故意不冻结**在本仓库（用户故事 29–31），所以上游新增技能是**预期行为**，不是漂移；漂移是"名字集合的解析方式"或语义变化。证据：`docs/research/mattpocock-skills-install.md`。

### `vite-proxy-from-env` 与 `vite`

- **钉住的东西**：C36（代理的存在规则、配置位置、`DEV_PROXY` 放 `.env`、无条件守卫、`prefix` 写 `/api/`、`rewrite: ''` 剥前缀、失败码 502/404/HTML）、C39（唯一的显式防御）、五个带代理 profile 的冒烟与反向控制。
- **漂移信号**：`proxyTransformer` 的导出名/签名变化；`rewrite` 语义变化；`prefix` 不再被当正则；`loadEnv` 的 mode/cwd 语义变化（那会改动"`.env` 而不是 `.env.development`"的理由）；Vite 的 SPA fallback 与 `/api` 的交互变化（会让"200 text/html 是失败信号"这条改写）。
- **重验**：`frontend-single`、`frontend-monorepo`、`fullstack-monorepo`；两个反向控制（删 `DEV_PROXY` → verify 红、dev server 拒绝启动）必须仍然红。
- **证据**：`docs/research/vite-proxy-from-env.md`。

### Node 与 pnpm

- **钉住的东西**：C34（`#/…` 需 ≥ 24.14.0、`#*` 与 DEP0166）、preflight 的 Node 门槛（`node >= 24.14`）；C18、C24、C26、C35（catalog、`-w`、只用 vp 命令）、harness 的缓存本地化与 store 位置。
- **漂移信号**：Node 改 `#/…` 的解析门槛或 DEP0166 的生命周期；pnpm 的 catalog 语法/`catalogMode` 默认值变化；pnpm 在 CI 下的 lockfile 行为变化；pnpm 的 store 落点变化（会影响 harness 的"缓存本地化"说明，不影响指南本身）。
- **重验**：preflight 的反向控制（假 `node` 报 `v24.13.0` 必须被拒）+ 六个 monorepo profile。
- **证据**：`docs/research/node-imports-aliases.md`、`docs/research/vp-project-local.md`。

### 上游文档的建议与本仓库相反处

- Nitro 的 "Import Alias" 文档推荐 `paths` + `resolve.tsconfigPaths` + 显式后缀；本项目**明确覆盖**它（C8/C34），因为三种别名机制会三方分歧且全程无红。
- vp 写进目标项目 `AGENTS.md` 的那句"跑 `vp env doctor`"在项目级 vp 下**不存在**（C6）；约束段显式纠正它。
- 漂移信号：上游把推荐改成与本国一致（那时"以本约束为准"的措辞可以软化，但**约束本身**由 ADR-0002/0005 的理由支撑，不随上游文档走）；或上游开始提供项目级的 `vp env`（那时 C6 的纠正句要撤掉）。
- 重验：不跑 profile；改的是 `docs/constraints.md` 的措辞与 `GUIDE.md` 里"以本约束为准"的句子。

---

## 与本仓库其它文档的关系

- **`docs/constraints.md`**：漂移结论的落点。重验后新增/改写的实测事实必须编号落进去，并按"客户侧落点"表决定是否发货。
- **`docs/adr/`**：被推翻的**决策**（不是版本事实）要新开 ADR，写上"什么情况下可以推翻"。
- **`e2e/README.md`**：harness 能证明什么、不能证明什么（漂移重验时同样适用）。
- **`docs/verification.md`**：最近一次全矩阵的机器生成记录；每次重验跑完都更新它，并把它当成"这次跑到哪个 commit、解析到什么版本"的第一手索引。
