# 全栈 SSR 单仓 profile：删掉 `index.html`，让 SSR 入口拥有文档

`fullstack`/`single` profile 就是全栈 SSR 形态：同一个项目里 `src/entry-server.tsx` 在服务端渲染文档、`src/entry-client.tsx` 在浏览器 hydrate，页面调用的 API 由同一个服务端的 `server/routes/api/*` 提供 —— 同源，因此没有 dev 代理、也不写 `.env`。形状选择是显式的：全栈的 `single` 布局 = SSR，`monorepo` 布局 = 前后分离（另一种形状，本 revision 未实现，由 profile guard 拒绝）；SSR 入口是框架代码，本 revision 只写 react-ts 的那一份，其余基座在写任何文件之前被拒绝。

最关键的一条取舍是**删掉 `index.html`**（Nitro 官方 `examples/vite-ssr-react` 的布局），而不是保留带 `<!--ssr-outlet-->` 的模板：

- 有模板时，outlet 注释是 SSR 输出进入页面的唯一通道，实现是 `String.replace`。模板缺少注释时，Nitro 仍然探测到 SSR 入口、仍然打印 ``Using `src/entry-server.tsx` as vite ssr entry.``，`/` 返回纯客户端壳，**exit 0、零警告** —— 实测的"探测 ≠ 渲染"，本仓库已知的最坏失败形状。
- 没有模板时，插件在 `configResolved` 里安装内置 renderer，SSR 入口返回的 `Response` 原样透传（status、headers、body 都属于入口）。失败模式被**消除**，而不是被守卫 —— 符合"用消除成因代替加分支"的防御边界。
- 形状的其余两半：`environments.client.build.rollupOptions.input` 指向 `src/entry-client.tsx`（模板没了，这是唯一能让 Vite 知道客户端入口的地方），文档用 `?assets=client` / `?assets=ssr` 的 `merge()` 装配客户端资源。
- 验证断言的是**渲染标记存在**（骨架页的 `<h1>SSR works</h1>`），不是 `200`：纯客户端壳恰好就是 `200` + 空 `#root`。harness 用两个反向控制分别证明两层都会红：种一个没有 outlet 的 `index.html` 后，构建不再产出 `_ssr/`，verify 红在**形状**上（`client-only build`）；直接移除渲染标记（形状完好）时，verify 红在**渲染标记**上。

## Considered Options

- **保留 `index.html` + `<!--ssr-outlet-->`（Shape A）** — 拒绝：它把"注释有没有写对"变成 SSR 是否生效的开关，而失败静默（探测日志照打、exit 0、返回客户端壳）。只有当既有 `index.html` 必须继续作为唯一真相来源时才值得选它。
- **vanilla-ts 基座 + 服务端拼 HTML 字符串** — 拒绝：没有组件树可渲染、也没有 hydrate 契约；客户端模块会把服务端产出的标记覆盖掉（实测）。guard 因此拒绝 vanilla-ts。
- **其他框架基座（`vue-ts` 等）** — 本 revision 不实现：SSR 入口是框架代码，Vue 还需要未验证的 `?assets` 插件 workaround。guard 明确拒绝并说明，而不是发一个渲染不起来的项目。
- **保留 `index.html`、另外加守卫或断言来防退化** — 拒绝：删模板已经消除成因；再加分支就是为"可以不存在的状态"写防御（约束 39）。
- **沿用脚手架 react-ts 的 demo 组件（计数器 + logo）** — 拒绝：SSR 骨架需要一个可预测的渲染标记，demo 是脚手架残留。骨架页 `src/App.tsx` 就地重写为最小页面。

## Consequences

- 继承 ADR 对 SSR 形态多一份：目标项目落 `docs/adr/0004-ssr-shape.md`（`when=mode:fullstack`，backend 不写）。这扩展了父 issue "3 份继承 ADR"的描述（0001 工具链 / 0002 代码局部化 / 0003 服务端形态）：形状的 why 必须随项目走，而把一个只在 SSR 存在的文件写进 backend 也拿到的 ADR 会违反"形态相关的内容只在该形态出现"这条。
- verify 断言渲染标记与同源 API：`node dist/server/index.mjs` 与 `vp dev` 各跑一次 smoke，`/` 必须含标记、**文档引用的客户端入口 URL 必须由同一服务端返回 200 + javascript**（"产物存在"与"页面能 hydrate"是两件事），`/api/hello` 必须在同一端口返回 JSON —— 这就是"不需要代理"的机器可校验含义。
- 构建产物必须同时含客户端 bundle（`dist/public/assets/*.js`）与 SSR renderer（`dist/server/_ssr/ssr.mjs`；`_ssr/` 只在 SSR 构建里出现）。`dist/server/_chunks/ssr-renderer.mjs` 是"无模板 → 内置 renderer"的指纹；用了模板的构建里它是 `renderer-template.mjs`。
- 合并 `tsconfig.json`（extends `nitro/tsconfig`，include `src`/`server`/`tests`/配置，`tsBuildInfoFile` 放回 `node_modules/.tmp/`），**并删掉脚手架的两个 project-reference 配置**（`tsconfig.app.json` / `tsconfig.node.json`）：合并程序之外的第二份"布局描述"没人同步，只会被后来者当真。同一步用 `src/` 与 `server/routes/api/` 两处故意类型错误证明两半都在程序里；build script 仍是脚手架的 `tsc -b && vp build`（实测可用）。
- `react(only-export-components)` 对 SSR 入口的 `export default {` 常驻一条警告（exit 0）：写进陷阱清单，不当失败追。
- SSR 入口是 catch-all：没有路由认领的路径（含未知 `/api/…`）返回渲染后的页面而不是 404。写进陷阱清单，verify 不对它断言。
- harness：新增 `e2e/profiles/fullstack-single.env`、`assert.mjs` 的 SSR 断言、`run.sh` 的两个反向控制（种 `index.html` 要求 verify 红在形状上；移除渲染标记要求 verify 红在渲染标记上）；profile guard 的反向控制从"fullstack 被拒"改为"`fullstack`/`monorepo` 被拒"与"fullstack SSR + `vanilla-ts` 被拒"。
- 未验证：浏览器内 hydration、hydration 之后的 HMR、react-ts 以外的基座、Vue 的 `?assets` workaround、`pnpm` 以外的包管理器。
