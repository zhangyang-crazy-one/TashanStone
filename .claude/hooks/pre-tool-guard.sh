#!/bin/bash
# pre-tool-guard.sh - PreToolUse 综合守卫钩子 (Linux版)
# 触发时机: PreToolUse（AI 使用工具前）
# 功能: 安全检查 + 规则提醒 + 计划文件检查

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 获取工具名称
tool_name="${CLAUDE_TOOL_NAME:-}"

# 如果环境变量为空，尝试从 stdin 读取
if [ -z "$tool_name" ] && [ ! -t 0 ]; then
    tool_name=$(cat 2>/dev/null | grep -o '"tool_name"[^,]*' | sed 's/.*": *"\([^"]*\)"/\1/' | head -1)
fi

# ============================================
# 第一部分：安全检查
# ============================================

is_bash_tool=false
if [[ "$tool_name" =~ ^[Bb]ash$ ]]; then
    is_bash_tool=true
fi

if [ "$is_bash_tool" = true ]; then
    # 读取命令参数
    command=""
    target_file=""

    # 解析参数
    args=("$@")
    dash_found=false
    for arg in "${args[@]}"; do
        if [ "$arg" = "--" ]; then
            dash_found=true
            continue
        fi
        if [ "$dash_found" = false ]; then
            command="$command $arg"
        else
            if [[ "$arg" =~ ^/ ]] || [[ "$arg" =~ ^[a-z]: ]]; then
                target_file="$arg"
                break
            fi
        fi
    done

    command=$(echo "$command" | sed 's/^ *//')

    if [ -n "$command" ]; then
        # 检查危险命令
        dangerous_block=false
        dangerous_warn=false
        danger_message=""

        if echo "$command" | grep -qE 'rm\s+(-rf?|--recursive).*[\/*]'; then
            dangerous_block=true
            danger_message="Dangerous command detected: rm -rf may delete important files"
        elif echo "$command" | grep -qE 'rm\s+(-rf?|--recursive)'; then
            dangerous_warn=true
            danger_message="Warning: rm -rf command is very dangerous, please confirm"
        elif echo "$command" | grep -qE 'drop\s+(database|table|index)'; then
            dangerous_block=true
            danger_message="Dangerous operation detected: deleting database object"
        elif echo "$command" | grep -qE 'truncate\s+'; then
            dangerous_warn=true
            danger_message="Warning: truncate operation is irreversible"
        elif echo "$command" | grep -qE 'delete\s+.*from'; then
            dangerous_warn=true
            danger_message="Warning: DELETE operation may delete data, please confirm"
        elif echo "$command" | grep -qE 'chmod\s+777'; then
            dangerous_warn=true
            danger_message="Warning: chmod 777 may cause security risks"
        fi

        if [ "$dangerous_block" = true ]; then
            echo "{\"decision\":\"block\",\"reason\":\"$danger_message\",\"command\":\"${command:0:100}\",\"severity\":\"block\"}"
            exit 1
        elif [ "$dangerous_warn" = true ]; then
            echo "{\"decision\":\"warn\",\"reason\":\"$danger_message\",\"command\":\"${command:0:100}\",\"severity\":\"warning\"}"
        fi

        # 检查敏感文件
        if [ -n "$target_file" ]; then
            if [[ "$target_file" =~ \.env(\.local)?$ ]]; then
                echo "{\"decision\":\"warn\",\"reason\":\"Target file contains sensitive config: .env\",\"targetFile\":\"${target_file:0:100}\",\"severity\":\"warning\"}"
            elif [[ "$target_file" =~ package\.json$ ]]; then
                echo "{\"decision\":\"warn\",\"reason\":\"Target file is package.json, please confirm modification\",\"targetFile\":\"${target_file:0:100}\",\"severity\":\"warning\"}"
            fi
        fi
    fi
fi

# ============================================
# 第二部分：规则提醒
# ============================================

is_write_edit_tool=false
is_read_tool=false

if [[ "$tool_name" =~ ^[Ww]rite$ ]] || [[ "$tool_name" =~ ^[Ee]dit$ ]]; then
    is_write_edit_tool=true
elif [[ "$tool_name" =~ ^[Rr]ead$ ]]; then
    is_read_tool=true
fi

rules_dir=".claude/rules"

if [ "$is_write_edit_tool" = true ]; then
    echo ""
    echo "## [PreToolUse] 代码编写规则提醒"
    echo ""
    echo "在执行 **$tool_name** 操作前，请确保遵循以下规则："
    echo ""

    echo "### 代码质量"
    echo ""
    echo "参考: \`$rules_dir/01-code-quality.md\`"
    echo ""

    echo "### 代码风格"
    echo ""
    echo "参考: \`$rules_dir/02-code-style.md\`"
    echo ""

    echo "### 安全检查"
    echo ""
    echo "参考: \`$rules_dir/03-security.md\`"
    echo ""

    echo "### 性能优化"
    echo ""
    echo "参考: \`$rules_dir/04-performance.md\`"
    echo ""

    echo "### 快速检查清单"
    echo ""
    echo "- [ ] 无 \`as any\`、\`@ts-ignore\` 类型绕过"
    echo "- [ ] 文件长度：组件 ≤300 行，服务 ≤500 行"
    echo "- [ ] 嵌套深度 ≤4 层"
    echo "- [ ] 无硬编码密钥或敏感信息"
    echo "- [ ] 无 N+1 查询模式"
    echo "- [ ] 大列表使用虚拟化"
    echo ""
    echo "**完成编辑后，必须运行 \`lsp_diagnostics\` 验证。**"
    echo ""
fi

if [ "$is_read_tool" = true ]; then
    echo ""
    echo "## [PreToolUse] 重构检测提醒"
    echo ""
    echo "读取文件后，请检查以下潜在问题："
    echo ""
    echo "1. **文件长度** - 是否超出限制？"
    echo "2. **重复代码** - 是否存在相似代码块？"
    echo "3. **深度嵌套** - 是否超过 4 层？"
    echo "4. **过时依赖** - 是否使用废弃 API？"
    echo ""
    echo "如发现问题，参考 \`$rules_dir/07-refactoring.md\` 进行告警。"
    echo ""
fi

# ============================================
# 第三部分：计划文件检查
# ============================================

change_tools=("Write" "Edit" "Bash" "write" "edit" "bash")

is_change_tool=false
for t in "${change_tools[@]}"; do
    if [ "$tool_name" = "$t" ]; then
        is_change_tool=true
        break
    fi
done

if [ "$is_change_tool" = true ]; then
    planning_files=(
        "planning/task_plan.md"
        "planning/progress.md"
        "planning/findings.md"
        ".claude/planning/task_plan.md"
        ".claude/planning/progress.md"
    )

    found_files=()
    for f in "${planning_files[@]}"; do
        if [ -f "$f" ]; then
            found_files+=("$f")
        fi
    done

    if [ ${#found_files[@]} -gt 0 ]; then
        echo "## [Reminder] Planning Files Available"
        echo ""
        echo "Before making changes, ensure alignment with current plan:"
        echo ""

        for f in "${found_files[@]}"; do
            echo "- \`$f\`"
        done

        echo ""
        echo "### Quick Check"
        echo ""
        echo "1. Is this change part of the current task in the plan?"
        echo "2. Have you updated progress.md with your progress?"
        echo "3. Are you following the approach defined in task_plan.md?"
        echo ""
        echo "**If unsure, re-read the planning files before proceeding.**"
    fi
fi
