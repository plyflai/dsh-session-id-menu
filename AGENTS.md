# AGENTS.md

本仓库由 dsh-expert 操作：

- 动手前先读 `.dsh-expert/brief.md`（项目背景：用户原始意图 + 场外信息，条目制精炼）与 `.dsh-expert/plans/` 中与当前任务相关的 `Status: active` 方案，有则先读、继续或修订，不另起炉灶；会话开始输出 `🧾 背景回执`。`.dsh-expert/` 是本地工作记忆，不随发布仓推送——公开仓里缺省时视为新任务起点。
- 用户输入带来新需求 / 新场外约束 / 更正时更新 `.dsh-expert/brief.md`（每条 ≤10 行、同主题更新原条目、精炼非原文）。
- 收尾时更新对应方案 `Status`（`done — <一行结果>` 或 `rejected — <原因>`），移入 `.dsh-expert/plans/archive/`（只读），并把代码提交行回填方案 `## Commits` ledger（两段式提交）。
- `.dsh-expert/plans/` 与 `brief.md` 是本地 git 跟踪的工作文档（公开仓不随附），不是决策真相源；需要持久化的决定写进本仓库 git 跟踪的文档（README 等）。
