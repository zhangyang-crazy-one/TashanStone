#!/bin/bash
# ccnotify-wrapper.sh - ccnotify wrapper 脚本 (Linux版)
# 功能: 自动解析用户目录，调用 ccnotify.py

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

event_type="${1:-}"

# 获取用户主目录
user_home="${HOME:-}"
if [ -z "$user_home" ]; then
    user_home=$(eval echo ~$USER)
fi

ccnotify_path="$user_home/.claude/ccnotify/ccnotify.py"

if [ -f "$ccnotify_path" ]; then
    python3 "$ccnotify_path" "$event_type"
fi
