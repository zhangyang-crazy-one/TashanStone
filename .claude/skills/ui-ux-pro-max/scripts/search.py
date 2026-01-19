#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max Search - BM25 search engine for UI/UX style guides
Usage: python search.py "<query>" [--domain <domain>] [--stack <stack>] [--max-results 3]

Domains: style, prompt, color, chart, landing, product, ux, typography
Stacks: html-tailwind, react, nextjs
"""

import argparse
import sys
from core import CSV_CONFIG, AVAILABLE_STACKS, MAX_RESULTS, search, search_stack

# Windows environment detection
IS_WINDOWS = sys.platform.startswith('win')

# Emoji to ASCII replacements for Windows compatibility
EMOJI_REPLACEMENTS = {
    '✓': '[OK]',
    '✔': '[OK]',
    '⚠': '[WARN]',
    '⚠️': '[WARN]',
    '❌': '[X]',
    '✗': '[X]',
    '⭐': '[*]',
    '🎨': '[ART]',
    '🚀': '[ROCKET]',
    '⚙️': '[GEAR]',
    '⚙': '[GEAR]',
    '💡': '[TIP]',
    '📦': '[PKG]',
    '🔧': '[TOOL]',
    '⬆': '[UP]',
    '⬇': '[DOWN]',
    '➡': '[->]',
    '⬅': '[<-]',
    '→': '->',
    '←': '<-',
    '⚡': '[FAST]',
    '🔥': '[HOT]',
    '💎': '[GEM]',
    '🎯': '[TARGET]',
    '📝': '[NOTE]',
    '🔗': '[LINK]',
    '📊': '[CHART]',
    '📈': '[UP]',
    '📉': '[DOWN]',
}


def sanitize_for_windows(text):
    """Replace emoji with ASCII text for Windows console compatibility"""
    if not IS_WINDOWS:
        return text
    for emoji, replacement in EMOJI_REPLACEMENTS.items():
        text = text.replace(emoji, replacement)
    return text


def format_output(result):
    """Format results for Claude consumption (token-optimized)"""
    if "error" in result:
        return f"Error: {result['error']}"

    output = []
    if result.get("stack"):
        output.append(f"## UI Pro Max Stack Guidelines")
        output.append(f"**Stack:** {result['stack']} | **Query:** {result['query']}")
    else:
        output.append(f"## UI Pro Max Search Results")
        output.append(f"**Domain:** {result['domain']} | **Query:** {result['query']}")
    output.append(f"**Source:** {result['file']} | **Found:** {result['count']} results\n")

    for i, row in enumerate(result['results'], 1):
        output.append(f"### Result {i}")
        for key, value in row.items():
            value_str = str(value)
            if len(value_str) > 300:
                value_str = value_str[:300] + "..."
            output.append(f"- **{key}:** {value_str}")
        output.append("")

    final_output = "\n".join(output)
    return sanitize_for_windows(final_output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UI Pro Max Search")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--domain", "-d", choices=list(CSV_CONFIG.keys()), help="Search domain")
    parser.add_argument("--stack", "-s", choices=AVAILABLE_STACKS, help="Stack-specific search (html-tailwind, react, nextjs)")
    parser.add_argument("--max-results", "-n", type=int, default=MAX_RESULTS, help="Max results (default: 3)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    # Stack search takes priority
    if args.stack:
        result = search_stack(args.query, args.stack, args.max_results)
    else:
        result = search(args.query, args.domain, args.max_results)

    if args.json:
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(format_output(result))
