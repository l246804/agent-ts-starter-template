# 领域文档

本仓库的工程技能在探索代码库时,应按以下规则消费这里的领域文档。

## 探索之前先读这些

- **`CONTEXT.md`**(仓库根目录),或
- **`CONTEXT-MAP.md`**(仓库根目录,若存在):它指向每个上下文各自的 `CONTEXT.md`。读取与当前主题相关的每一个。
- **`docs/adr/`**:读取与你即将动工的区域相关的 ADR。

如果这些文件不存在,**静默继续**。不要指出它们缺失,也不要主动建议先创建。`/domain-modeling` 技能(经由 `/grill-with-docs` 与 `/improve-codebase-architecture` 抵达)会在术语或决策真正被确定时按需创建它们。

## 文件结构

本仓库是**单上下文**布局:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-<decision>.md
│   └── 0002-<decision>.md
└── src/
```

若将来出现根目录 `CONTEXT-MAP.md`,则升级为多上下文布局(每个上下文自带 `CONTEXT.md` 与 `docs/adr/`,根 `docs/adr/` 存放系统级决策)。

## 使用术语表中的词汇

当你的产出提到某个领域概念时(issue 标题、重构提案、假设、测试名称),使用 `CONTEXT.md` 里定义的术语。不要漂移到术语表明确避开的同义词。

如果需要的概念还不在术语表里,这是一个信号:要么你在发明项目并不使用的语言(重新考虑),要么存在真实空白(记录下来交给 `/domain-modeling`)。

## 标出 ADR 冲突

如果你的产出与既有 ADR 矛盾,明确点出来,而不是静默覆盖:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
