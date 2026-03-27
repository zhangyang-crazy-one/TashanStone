---
created: 2026-03-27T07:59:06.793Z
title: 开始第一阶段实际工作的调研
area: planning
files:
  - .planning/PROJECT.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/research/SUMMARY.md
---

## Problem

项目已经完成 OpenClaw AI parity 的初始化规划、需求拆分和阶段路线图，但 Phase 1 还没有进入实际可执行调研。当前需要把“共享 assistant runtime”的第一阶段从概念规划推进到落地前研究，明确 TashanStone 现有 AI 架构、上下文注入路径、会话模型、工具执行边界，以及它们与 OpenClaw 核心 runtime 的对应关系。

如果不先做这一步，后续 `$gsd-plan-phase 1` 会缺少足够具体的实现依据，容易把运行时抽象、UI 聊天逻辑、渠道接入边界混在一起，导致 Phase 1 的计划不够稳。

## Solution

围绕 Phase 1 做一轮实施前调研，至少覆盖以下内容：

1. 盘点 TashanStone 当前 AI 调用入口、provider 配置、聊天状态流、上下文服务和工具执行路径。
2. 明确哪些能力已经可以直接复用为共享 runtime 的组成部分，哪些仍然绑死在 UI 层。
3. 从 OpenClaw 研究笔记中提炼最小 runtime 边界，映射到 TashanStone 现有模块。
4. 产出可直接输入 `$gsd-plan-phase 1` 的调研结论，包括建议的模块边界、接口草案和主要风险点。
