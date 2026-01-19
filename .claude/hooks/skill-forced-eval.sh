#!/bin/bash
# skill-forced-eval.sh - 强制技能评估钩子 (Linux版)
# 触发时机: UserPromptSubmit（每次用户提交时）
# 功能: 评估并激活相关技能，检查是否需要查询外部文档

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 从环境变量或 stdin 读取用户输入
user_prompt=""

# 尝试从 stdin 读取
if [ ! -t 0 ]; then
    user_prompt=$(cat)
fi

# 如果 stdin 为空，尝试从参数读取
if [ -z "$user_prompt" ] && [ $# -gt 0 ]; then
    user_prompt="$1"
fi

# 跳过斜杠命令
if [[ "$user_prompt" =~ ^/[a-zA-Z]+ ]]; then
    echo "[Hook] 检测到斜杠命令，跳过技能评估: ${user_prompt%% *}"
    exit 0
fi

if [ -z "$user_prompt" ]; then
    exit 0
fi

# 转换为小写进行匹配
prompt_lower=$(echo "$user_prompt" | tr '[:upper:]' '[:lower:]')

# 技能定义
declare -A SKILLS
SKILLS=(
    ["electron-main"]="Electron 主进程开发 (IPC, 数据库, 原生模块)"
    ["electron-react"]="React 前端和 Electron 集成开发"
    ["rag-vectordb"]="RAG 向量数据库 (LanceDB)"
    ["ai-integration"]="AI 服务集成"
    ["mcp-tools"]="MCP 工具协议"
    ["platform-build"]="平台构建和打包"
    ["bug-debug"]="Bug 调试和排查"
    ["planning-with-files"]="Manus 风格的文件规划和任务管理"
    ["ui-ux-pro-max"]="UI/UX 设计智能"
    ["spec-interview"]="需求规格访谈"
    ["context7"]="Context7 官方文档查询"
)

# 技能关键词
declare -A SKILL_KEYWORDS
SKILL_KEYWORDS["electron-main"]="electron main process ipc ipcmain ipcrenderer database sqlite lancedb better-sqlite3 preload contextbridge native module"
SKILL_KEYWORDS["electron-react"]="react frontend component hooks typescript jsx tsx ui tailwind window.electronapi renderer"
SKILL_KEYWORDS["rag-vectordb"]="rag vector retrieval knowledge embedding lancedb chunk similarity search persistent memory"
SKILL_KEYWORDS["ai-integration"]="ai llm gemini ollama openai api chat generate"
SKILL_KEYWORDS["mcp-tools"]="mcp tool protocol server browser filesystem"
SKILL_KEYWORDS["platform-build"]="package build app electron-builder installer dmg exe deb publish"
SKILL_KEYWORDS["bug-debug"]="bug error exception debug troubleshoot problem"
SKILL_KEYWORDS["planning-with-files"]="plan planning task project scope requirements manus structure"
SKILL_KEYWORDS["ui-ux-pro-max"]="ui ux design style color typography font landing dashboard glassmorphism minimalism dark mode tailwind css responsive animation hover layout"
SKILL_KEYWORDS["spec-interview"]="spec specification interview requirements clarify scope define"
SKILL_KEYWORDS["context7"]="context7 official docs api docs library docs use context7 query docs"

# 外部库关键词 - 触发 Context7 查询
LIBRARY_KEYWORDS=(
    "react-query" "tanstack" "zustand" "jotai" "recoil" "redux"
    "next.js" "nextjs" "nuxt" "svelte" "vue" "angular"
    "tailwindcss" "shadcn" "radix" "chakra" "antd" "material-ui" "mui"
    "zod" "yup" "formik" "react-hook-form"
    "axios" "swr" "trpc" "graphql"
    "vite" "webpack" "esbuild" "rollup" "turbopack"
    "express" "fastify" "nest" "koa"
    "prisma" "drizzle" "typeorm" "sequelize"
    "vitest" "jest" "playwright" "cypress"
)

# 检查库提及
check_library_mentions() {
    local mentioned=()
    for lib in "${LIBRARY_KEYWORDS[@]}"; do
        if [[ "$prompt_lower" == *"$lib"* ]]; then
            mentioned+=("$lib")
        fi
    done
    echo "${mentioned[@]}"
}

# 评估技能相关性
evaluate_skills() {
    local relevant_skills=()

    for skill in "${!SKILLS[@]}"; do
        keywords="${SKILL_KEYWORDS[$skill]}"
        match_count=0

        for keyword in $keywords; do
            if [[ "$prompt_lower" == *"$keyword"* ]]; then
                match_count=$((match_count + 1))
            fi
        done

        if [ "$match_count" -gt 0 ]; then
            relevant_skills+=("$skill")
        fi
    done

    echo "${relevant_skills[@]}"
}

mentioned_libraries=($(check_library_mentions))
relevant_skills=($(evaluate_skills))

echo "## 指令: 强制技能激活 (必须执行)"
echo ""

# ============================================
# Context7 查询检查
# ============================================
if [ ${#mentioned_libraries[@]} -gt 0 ]; then
    echo "### 外部库检测 (Context7 查询)"
    echo ""
    echo "检测到以下外部库/框架:"
    echo ""
    for lib in "${mentioned_libraries[@]}"; do
        echo "- **$lib**"
    done
    echo ""
    echo "根据 \`.claude/rules/06-context7-query.md\` 规则："
    echo ""
    echo "1. 如果你对这些库**不熟悉**，**必须**先查询官方文档"
    echo "2. 查询优先级: Context7 → deepwiki.com → GitHub"
    echo "3. 查询前告知用户，查询后引用来源"
    echo ""
fi

# ============================================
# 技能评估
# ============================================
echo "### 步骤 1 - 评估技能"
echo "对每个技能，说明: [技能名] - 是/否 - [原因]"
echo ""
echo "可用技能:"
for skill in "${!SKILLS[@]}"; do
    echo "  - $skill: ${SKILLS[$skill]}"
done
echo ""
echo "用户输入: $user_prompt"
echo ""
echo "### 步骤 2 - 激活技能"

if [ ${#relevant_skills[@]} -gt 0 ]; then
    echo "检测到相关技能:"
    for skill in "${relevant_skills[@]}"; do
        # 找出匹配的关键词
        keywords="${SKILL_KEYWORDS[$skill]}"
        matched=""
        for keyword in $keywords; do
            if [[ "$prompt_lower" == *"$keyword"* ]]; then
                matched="$matched $keyword"
            fi
        done
        echo "- $skill: 是 - 匹配关键词:$matched"
    done
    echo ""

    echo "### 技能激活通知"
    for skill in "${relevant_skills[@]}"; do
        case "$skill" in
            "spec-interview")
                echo "[Skill Activated] Spec Interview skill activated - 需求规格访谈模式"
                ;;
            "planning-with-files")
                echo "[Skill Activated] Planning-with-Files skill activated - Manus 风格文件规划模式"
                ;;
            "ui-ux-pro-max")
                echo "[Skill Activated] UI/UX Pro Max skill activated - UI/UX 设计智能模式"
                ;;
            *)
                echo "[Skill Activated] $skill skill activated - ${SKILLS[$skill]}"
                ;;
        esac
    done
    echo ""

    echo "激活命令:"
    for skill in "${relevant_skills[@]}"; do
        echo "> Skill($skill)"
    done
else
    echo "所有技能评估为 '否'，说明 '不需要技能' 并继续"
fi

echo ""
echo "### 步骤 3 - 实现"
echo "只有完成步骤 1 和 2 后，才开始实现用户请求。"
echo ""
echo "### 重要提示"
echo "- 必须在步骤 3 之前完成步骤 1 和 2"
echo "- 使用 \`Skill()\` 工具激活相关技能"
echo "- 如果没有相关技能，解释原因并直接回答"
