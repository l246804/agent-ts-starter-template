# Triage 标签

这些技能用五个规范的 triage 角色来沟通。本文件把这些角色映射到本仓库 issue tracker 里实际使用的标签字符串。

| mattpocock/skills 中的标签 | 本仓库 tracker 中的标签 | 含义                                     |
| -------------------------- | ----------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`          | 维护者需要评估这个 issue                 |
| `needs-info`               | `needs-info`            | 等待报告者补充信息                       |
| `ready-for-agent`          | `ready-for-agent`       | 已完整描述,可以交给 AFK agent            |
| `ready-for-human`          | `ready-for-human`       | 需要人类来实现                           |
| `wontfix`                  | `wontfix`               | 不会被处理                               |

当某个技能提到某个角色时(例如 "apply the AFK-ready triage label"),使用本表中对应行的标签字符串。

若要适配你实际使用的命名,直接改右列。

## 首次使用时的标签创建

本仓库此刻还没有这些标签,首次需要时用 `gh label create` 建好,避免打标签失败:

```bash
gh label create needs-triage    --description "Maintainer needs to evaluate this issue"
gh label create needs-info      --description "Waiting on reporter for more information"
gh label create ready-for-agent --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --description "Requires human implementation"
gh label create wontfix         --description "Will not be actioned"
```
