# Issue tracker: GitHub

本仓库的 issue 与 spec 都以 GitHub issue 的形式存在,即 `l246804/agent-ts-starter-template`。所有操作使用 `gh` CLI。

## 约定

- **创建 issue**:`gh issue create --title "..." --body "..."`。多行正文用 heredoc。
- **读取 issue**:`gh issue view <number> --comments`,用 `jq` 过滤评论,并同时取回 labels。
- **列出 issue**:`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`,按需加 `--label` 与 `--state` 过滤。
- **评论 issue**:`gh issue comment <number> --body "..."`
- **增删标签**:`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**:`gh issue close <number> --comment "..."`

仓库由 `git remote -v` 推断;在 clone 目录内运行时 `gh` 会自动识别。

## PR 作为 triage 入口

**PR as a request surface: no.** _(若本仓库把外部 PR 当作功能请求处理,改为 `yes`;`/triage` 会读这个开关。)_

设为 `yes` 时,PR 走与 issue 相同的标签和状态,对应命令为 `gh pr` 系列:

- **读取 PR**:`gh pr view <number> --comments`,diff 用 `gh pr diff <number>`。
- **列出待 triage 的外部 PR**:`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`,只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR`、`NONE` 的项(丢弃 `OWNER`/`MEMBER`/`COLLABORATOR`)。
- **评论 / 打标签 / 关闭**:`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用一套编号,所以裸写的 `#42` 可能是两者之一:先用 `gh pr view 42` 解析,失败再回退到 `gh issue view 42`。

## 当某个技能说 "publish to the issue tracker"

创建一个 GitHub issue。

## 当某个技能说 "fetch the relevant ticket"

执行 `gh issue view <number> --comments`。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是一个 issue,**child** issue 是它的 ticket。

- **Map**:单个带 `wayfinder:map` 标签的 issue,正文承载 Notes / Decisions-so-far / Fog。`gh issue create --label wayfinder:map`。
- **Child ticket**:通过 GitHub sub-issue 关联到 map 的 issue(`gh api` 调用 sub-issues 端点)。若 sub-issue 未启用,则把 child 加进 map 正文的 task list,并在 child 正文顶部写 `Part of #<map>`。标签 `wayfinder:<type>`(`research`/`prototype`/`grilling`/`task`)。被认领后指派给推进的开发者。
- **阻塞关系**:使用 GitHub **原生 issue dependencies**,这是规范且 UI 可见的表示。加边命令 `gh api --method POST repos/l246804/agent-ts-starter-template/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,其中 `<blocker-db-id>` 是阻塞者的数字 **database id**(`gh api repos/l246804/agent-ts-starter-template/issues/<n> --jq .id`,**不是** `#number` 也不是 `node_id`)。GitHub 通过 REST 的 `issue_dependencies_summary.blocked_by` 汇报(只含未关闭的阻塞者,即实时闸门)。**读法(实测 gh 2.100.0)**:`gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary`(返回 `{blocked_by, blocking, total_blocked_by, total_blocking}`),或 `gh issue view <n> --json blockedBy`。⚠️ `gh issue view --json issue_dependencies_summary` 是**无效字段名**(报 `Unknown JSON field`)——别把 REST 字段名直译成 CLI 的 `--json` 参数。若 dependencies 不可用,回退为 child 正文顶部的 `Blocked by: #<n>, #<n>` 行。当所有阻塞者都关闭时,ticket 解除阻塞。
- **Frontier 查询**:列出 map 下所有未关闭的 child(`gh issue list --state open`,范围限定在 map 的 sub-issues / task list),剔除存在未关闭阻塞者(`gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` 大于 0,或 `gh issue view <n> --json blockedBy` 非空,或 `Blocked by` 行里有未关闭 issue)或已有 assignee 的项;按 map 顺序取第一个。
- **认领**:`gh issue edit <n> --add-assignee @me`,这是本次会话的第一次写操作。
- **解决**:`gh issue comment <n> --body "<answer>"`,然后 `gh issue close <n>`,再把上下文指针(gist + 链接)追加到 map 的 Decisions-so-far。
