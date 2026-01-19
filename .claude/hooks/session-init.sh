#!/bin/bash
# session-init.sh - 会话初始化钩子 (Linux版)
# 触发时机: SessionStart（会话开始时）
# 功能: 显示项目状态 + 动态加载规则元数据

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 获取当前时间
now=$(date "+%Y/%m/%d %H:%M:%S")

echo "## Session Started: $now"
echo ""

# ============================================
# 第一部分：项目状态
# ============================================

# ============================================
# 第二部分：动态读取规则元数据
# ============================================

rules_dir=".claude/rules"
echo "## [MANDATORY] Rules System - Dynamic Loading"
echo ""
echo "### Core Configuration"
echo "- \`CLAUDE.md\` - Project configuration and core principles"
echo ""
echo "### Rules Directory: \`$rules_dir/\`"
echo ""

# 统计加载的规则数量
loaded_count=0
always_apply_count=0

# 检查规则目录是否存在
if [ -d "$rules_dir" ]; then
    echo "| File | Description | Always Apply |"
    echo "|------|-------------|--------------|"

    # 遍历所有 .md 文件
    for file in "$rules_dir"/*.md; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")

            # 提取 description 和 alwaysApply
            description="No description"
            always_apply="NO"

            # 读取文件内容
            content=$(cat "$file")

            # 解析 description
            desc_line=$(echo "$content" | grep -E '^description:' | head -1)
            if [ -n "$desc_line" ]; then
                description=$(echo "$desc_line" | sed 's/description: *"\(.*\)"/\1/' | sed "s/description: *'\(.*\)'/\1/")
                # 截断 description 到合理长度
                if [ ${#description} -gt 45 ]; then
                    description="${description:0:42}..."
                fi
            fi

            # 解析 alwaysApply
            if echo "$content" | grep -qE 'alwaysApply:\s*(true|yes)'; then
                always_apply="YES"
                always_apply_count=$((always_apply_count + 1))
            fi

            echo "| \`$filename\` | $description | $always_apply |"
            loaded_count=$((loaded_count + 1))
        fi
    done

    echo ""
    echo "**Summary**: $loaded_count rules loaded | $always_apply_count marked \`alwaysApply: true\`"
else
    echo "[WARN] No rule files found in \`$rules_dir/\`"
fi

echo ""
echo "**ACTION REQUIRED**: Use the Read tool to load \`.claude/rules/*.md\` NOW."
echo ""
echo "**WARNING**: Failure to read these rules = Non-compliant implementation."
echo ""

# ============================================
# 第三部分：技能系统状态
# ============================================

skills_dir=".claude/skills"
if [ -d "$skills_dir" ]; then
    skill_count=$(ls -d "$skills_dir"/*/ 2>/dev/null | wc -l)
    if [ "$skill_count" -gt 0 ]; then
        echo "### Skills System: $skill_count skills available"
        echo ""
        echo -n "Available: "
        first=1
        for dir in "$skills_dir"/*/; do
            if [ -d "$dir" ]; then
                skill_name=$(basename "$dir")
                if [ $first -eq 1 ]; then
                    echo -n "\`$skill_name\`"
                    first=0
                else
                    echo -n ", \`$skill_name\`"
                fi
            fi
        done
        echo ""
        echo ""
    fi
fi

# ============================================
# 第四部分：快速命令
# ============================================

echo "---"
echo ""
echo "**Quick Commands**: /start | /progress | /next | /update-status"
