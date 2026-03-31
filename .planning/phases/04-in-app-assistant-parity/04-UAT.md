---
status: complete
phase: 04-in-app-assistant-parity
source:
  - 04-05-SUMMARY.md
  - 04-06-SUMMARY.md
  - 04-07-SUMMARY.md
  - 04-08-SUMMARY.md
  - 04-09-SUMMARY.md
started: 2026-03-30T04:14:03Z
updated: 2026-03-30T04:23:52Z
---

## Current Test

[testing complete]

## Tests

### 1. 共享运行时对话可正常返回结果
expected: 打开应用内 AI 对话，发送一条消息后，能在当前聊天抽屉里正常收到回复，没有明显报错、卡死或界面异常。
result: pass

### 2. 工作区上下文面板显示真实笔记标题
expected: 打开聊天中的工作区上下文面板时，“当前笔记/活动笔记”显示的是可读的笔记标题，而不是 `note-1` 这类内部 id；范围和高亮文本状态也应可见。
result: pass

### 3. 隔离线程可发现且可切换
expected: 聊天界面明确说明线程彼此隔离，能看出当前活动线程，并可创建或切换线程。
result: issue
reported: "[Image #1]，对话不可以切换，TUI页面没有可以切换的选项"
severity: major

### 4. 运行时状态在流式过程中可见
expected: 发送消息后，在流式响应过程中可以直接看到运行阶段、增量变化或运行状态，而不是只有隐藏入口。
result: issue
reported: "流式输出并没有效果"
severity: major

### 5. 多行输入和既有聊天控制仍可用
expected: 输入框支持多行换行和自动增高；`Enter` 发送、`Shift+Enter` 换行；清空、压缩、停止流式等控制仍可用。
result: issue
reported: "TUI的对话页面不支持换行，且没有清空，压缩，停止等控制选项"
severity: major

### 6. 聊天打开时笔记工作流不受阻
expected: 聊天面板打开时，仍可正常编辑笔记、进行知识检索或使用相关笔记工作流，没有明显阻塞或失效。
result: pass

## Summary

total: 6
passed: 3
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "聊天界面明确说明线程彼此隔离，能看出当前活动线程，并可创建或切换线程。"
  status: failed
  reason: "User reported: [Image #1]，对话不可以切换，TUI页面没有可以切换的选项"
  severity: major
  test: 3

- truth: "发送消息后，在流式响应过程中可以直接看到运行阶段、增量变化或运行状态，而不是只有隐藏入口。"
  status: failed
  reason: "User reported: 流式输出并没有效果"
  severity: major
  test: 4

- truth: "输入框支持多行换行和自动增高；`Enter` 发送、`Shift+Enter` 换行；清空、压缩、停止流式等控制仍可用。"
  status: failed
  reason: "User reported: TUI的对话页面不支持换行，且没有清空，压缩，停止等控制选项"
  severity: major
  test: 5
