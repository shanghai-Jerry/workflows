# Claude Code Workflows

一组用于代码分析和自动修复的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) Workflow 脚本，主要面向 Go 项目。

## 安装

### 前置条件

- 已安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- 已安装 [GitHub CLI (`gh`)](https://cli.github.com/) 并完成认证（`analyze-issues` 需要）
- Go 1.21+（运行测试验证修复时需要）

### 方式一：直接复制到项目

将 `.claude/workflows/` 目录复制到你的项目根目录下：

```bash
# 在你的项目根目录下执行
mkdir -p .claude/workflows
cp /path/to/workflows/.claude/workflows/*.js .claude/workflows/
```

复制后的目录结构：

```
your-project/
├── .claude/
│   └── workflows/
│       ├── analyze-module.js    # 模块深度分析
│       ├── analyze-issues.js    # GitHub Issue 分析
│       ├── fix-findings.js      # 自动修复发现的问题
│       └── pr-review.js         # PR 评论分析与修复建议
└── ...
```

### 方式二：通过 Git Submodule 引入

```bash
cd your-project
git submodule add https://github.com/shanghai-Jerry/workflows.git .claude/workflows-repo
ln -s .claude/workflows-repo/.claude/workflows .claude/workflows
```

## 使用方法

在项目目录下启动 Claude Code，**直接用自然语言描述你的意图**即可自动触发对应的 workflow，无需记住命令格式。

### 自然语言触发（推荐）

直接跟 Claude 说你想做什么：

| 你说的话 | 触发的 Workflow |
|---------|----------------|
| "分析一下 agent 模块的代码质量" | `analyze-module` |
| "帮我找找 agent 目录下有没有 bug" | `analyze-module` |
| "看看仓库有哪些 open issues 可以修" | `analyze-issues` |
| "修复 PR 中的有关评论的意见" | `pr-review` |
| "帮我处理这个 PR 的 review 意见" | `pr-review` |
| "把刚才分析出来的问题修一下" | `fix-findings` |
| "修复分析报告里的那些 bug" | `fix-findings` |

也可以用英文：

| You say | Workflow triggered |
|---------|-------------------|
| "analyze the agent module for bugs" | `analyze-module` |
| "check open issues and find fixable ones" | `analyze-issues` |
| "fix the code review feedback" | `pr-review` |
| "apply the suggested fixes" | `fix-findings` |

### 显式调用（/workflow 命令）

如果需要精确控制参数，也可以直接使用命令：

```bash
/workflow analyze-module '{"path":"./agent"}'
/workflow analyze-issues '{"repo":"owner/repo-name"}'
/workflow pr-review '{"pr":123}'
/workflow fix-findings '{"fix_ids":["id-1"],"findings":[...]}'
```

### 各 Workflow 详情

#### analyze-module — 模块深度分析

对指定 Go 模块进行架构分析，发现潜在 bug 和改进点。

**输出**：包含 findings（问题列表）和 summary（总结）的结构化报告。每个 finding 包含严重级别、类别、位置、根因分析和修复建议。

#### analyze-issues — GitHub Issue 分析

扫描仓库的 open issues，分析哪些是可修复的 bug，并给出修复建议。

#### fix-findings — 自动修复

根据分析报告中的 finding 自动应用修复。需要传入之前分析的结果。

#### pr-review — PR 评论分析

读取指定 PR 上的所有评论（inline 代码评审 + PR 级别评论），分析每条评论是否需要代码修改，并给出修复建议或回复草稿。

**输出**：每条评论的分析结果，包括：
- 是否可操作（`is_actionable`）
- 严重级别（critical / high / medium / low / info）
- 具体修复建议和参考代码
- 问题类评论的回复草稿

## 工作流说明

| Workflow | 用途 | 输入参数 |
|----------|------|---------|
| `analyze-module` | 深入分析 Go 模块架构和代码质量 | `path` — 模块路径 |
| `analyze-issues` | 扫描 GitHub Issues 寻找可修复项 | `repo` — 仓库名（可选） |
| `fix-findings` | 自动修复分析报告中的问题 | `fix_ids` — 要修复的 ID 列表，`findings` — 分析结果 |
| `pr-review` | 读取 PR 评论并给出修复建议 | `pr` — PR 编号，`repo` — 仓库名（可选） |

## License

MIT
