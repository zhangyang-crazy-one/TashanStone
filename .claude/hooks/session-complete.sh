#!/bin/bash
# session-complete.sh - 会话完成钩子（Linux版）
# 触发时机: Stop（会话结束时）
# 功能: 任务完成检查 + 变更统计 + 清理

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# ============================================
# 第一部分：任务完成检查
# ============================================

task_plan="planning/task_plan.md"
progress_file="planning/progress.md"
findings_file="planning/findings.md"

planning_exists=false
progress_exists=false

[ -f "$task_plan" ] || [ -f ".claude/planning/task_plan.md" ] && planning_exists=true
[ -f "$progress_file" ] || [ -f ".claude/planning/progress.md" ] && progress_exists=true

echo "## [完成前检查] 任务验证清单"
echo ""

# 文档同步检查
echo "### 1. 文档同步检查"
echo ""
echo "如果本次会话涉及以下更改，**必须**更新相关文档："
echo ""
echo "| 更改类型 | 需要更新的文档 |"
echo "|----------|----------------|"
echo "| API 端点变更 | \`docs/API.md\`，README 相关章节 |"
echo "| 组件 props/接口变更 | 组件文档，类型定义文件 |"
echo "| 数据库模式变更 | 数据库文档，类型定义 |"
echo "| 新功能/移除功能 | 功能文档，用户指南 |"
echo "| 配置/环境变量变更 | \`README.md\`，\`.env.template\` |"
echo "| 架构变更 | \`docs/ARCHITECTURE.md\`，系统图 |"
echo ""
echo "**自查：本次会话是否触发了上述任何条件？**"
echo ""

# 规划文件状态
if [ "$planning_exists" = true ] || [ "$progress_exists" = true ]; then
    echo "### 2. 规划文件状态"
    echo ""

    if [ "$planning_exists" = true ]; then
        echo "- [ ] **任务计划**: 是否已更新任务状态？"
    fi

    if [ "$progress_exists" = true ]; then
        echo "- [ ] **进度文件**: 进度记录是否最新？"
    fi

    if [ -f "$findings_file" ]; then
        echo "- [ ] **发现记录**: 是否记录了关键发现？"
    fi

    echo ""
fi

# 代码质量验证
echo "### 3. 代码质量验证"
echo ""
echo "完成会话前，验证以下内容："
echo ""
echo "**代码检查**"
echo "- [ ] 无 TypeScript/linting 错误（运行 \`lsp_diagnostics\`）"
echo "- [ ] 无 \`as any\`、\`@ts-ignore\` 或类型抑制"
echo "- [ ] 所有新代码遵循现有模式"
echo ""
echo "**测试验证**"
echo "- [ ] 构建通过（如适用）"
echo "- [ ] 测试通过（如适用）"
echo ""

# 清理检查
echo "### 4. 清理检查"
echo ""
echo "- [ ] 临时文件已删除"
echo "- [ ] 调试代码已移除"
echo "- [ ] console.log 语句已清理"
echo ""

# 未完成处理
echo "### 如果任务未完成"
echo ""
echo "如果任务未完全完成，在 \`progress.md\` 中记录："
echo ""
echo "- 已完成的内容"
echo "- 剩余待做事项"
echo "- 任何阻塞问题或需要的决策"
echo ""
echo "**验证失败时，请勿标记为完成。**"
echo ""

# ============================================
# 第二部分：变更统计和清理
# ============================================

# 获取 git 变更统计
get_change_stats() {
    local status
    status=$(git status --porcelain 2>/dev/null)

    if [ -z "$status" ]; then
        echo "0 0 0"
        return
    fi

    local added=0
    local modified=0
    local deleted=0

    while IFS= read -r line; do
        [ -z "$line" ] && continue
        status_code="${line:0:2}"
        case "$status_code" in
            "A "|"??" ) added=$((added + 1)) ;;
            "M " ) modified=$((modified + 1)) ;;
            "D " ) deleted=$((deleted + 1)) ;;
        esac
    done <<< "$status"

    echo "$added $modified $deleted"
}

# 清理临时文件
cleanup_temp_files() {
    local temp_patterns=("*.tmp" "*.log" "*~" "*.bak" "*.swp")
    local temp_locations=("." "temp" "tmp")

    for loc in "${temp_locations[@]}"; do
        if [ -d "$loc" ]; then
            for pattern in "${temp_patterns[@]}"; do
                find "$loc" -name "$pattern" -type f -delete 2>/dev/null
            done
        fi
    done
}

# 解析变更统计
stats=$(get_change_stats)
added=$(echo "$stats" | awk '{print $1}')
modified=$(echo "$stats" | awk '{print $2}')
deleted=$(echo "$stats" | awk '{print $3}')

# 清理临时文件
cleanup_temp_files

# 生成变更摘要
generate_summary() {
    local parts=()
    [ "$added" -gt 0 ] && parts+=("$added added")
    [ "$modified" -gt 0 ] && parts+=("$modified modified")
    [ "$deleted" -gt 0 ] && parts+=("$deleted deleted")

    if [ ${#parts[@]} -eq 0 ]; then
        echo "No code changes detected"
    else
        echo "$(IFS=,; echo "${parts[*]}")"
    fi
}

change_summary=$(generate_summary)

echo "---"
echo ""
echo "Task Completed | $change_summary"
echo ""

# 显示变更的文件
if [ "$added" -gt 0 ] || [ "$modified" -gt 0 ] || [ "$deleted" -gt 0 ]; then
    echo "**Changed Files**:"
    git status --porcelain | head -10 | while read -r line; do
        status_code="${line:0:2}"
        filepath="${line:3}"

        case "$status_code" in
            "M " ) icon="[M]" ;;
            "A " ) icon="[+]" ;;
            "D " ) icon="[-]" ;;
            "??" ) icon="[?]" ;;
            * ) icon="[*]" ;;
        esac

        echo "  $icon $filepath"
    done
    echo ""
fi

# 建议操作
echo "**Suggested Actions**:"
echo "- Use \`@code-reviewer\` to review code"
echo "- Run \`/update-status\` to update project status"
echo "- Use \`git add . && git commit\` to commit code"
echo ""
echo "**Quick Commands**:"
echo "- \`/update-status\` - Update project status"
echo "- \`/progress\` - View development progress"
echo "- \`/next\` - Get next step suggestions"
