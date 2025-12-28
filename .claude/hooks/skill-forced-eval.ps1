# skill-forced-eval.ps1 - Forced skill evaluation hook
# Trigger: Every time user submits a prompt
# Function: Force evaluate and activate relevant skills before AI starts thinking

$SKILLS = @(
    @{
        Name = "electron-main"
        Keywords = @("electron", "main process", "ipc", "database", "sqlite", "lancedb", "mcp", "native module")
        Description = "Electron main process development"
    },
    @{
        Name = "react-frontend"
        Keywords = @("react", "frontend", "component", "hooks", "typescript", "jsx", "tsx", "ui")
        Description = "React frontend development"
    },
    @{
        Name = "rag-vectordb"
        Keywords = @("rag", "vector", "retrieval", "knowledge", "embedding", "lancedb", "chunk")
        Description = "RAG vector database"
    },
    @{
        Name = "ai-integration"
        Keywords = @("ai", "llm", "gemini", "ollama", "openai", "api", "chat", "generate")
        Description = "AI service integration"
    },
    @{
        Name = "mcp-tools"
        Keywords = @("mcp", "tool", "protocol", "server", "browser", "filesystem")
        Description = "MCP tool protocol"
    },
    @{
        Name = "platform-build"
        Keywords = @("package", "build", "electron-builder", "installer", "dmg", "exe", "deb")
        Description = "Platform build and packaging"
    },
    @{
        Name = "bug-debug"
        Keywords = @("bug", "error", "exception", "debug", "troubleshoot", "problem")
        Description = "Bug debugging and troubleshooting"
    }
)

# Read user input
$userPrompt = ""
try {
    if ($input) {
        $userPrompt = ($input | Out-String).Trim()
    }
    if (-not $userPrompt -and $args.Count -gt 0) {
        $userPrompt = $args[0]
    }
} catch {
    $userPrompt = ""
}

# Escape hatch for slash commands
if ($userPrompt -match '^\/[a-zA-Z]+') {
    Write-Output "[Hook] Detected slash command, skipping skill evaluation: $($userPrompt.Split()[0])"
    exit 0
}

function Evaluate-Skills {
    param([string]$Prompt)

    $promptLower = $Prompt.ToLower()
    $results = @()

    foreach ($skill in $SKILLS) {
        $matchCount = 0
        $matchedKeywords = @()

        foreach ($keyword in $skill.Keywords) {
            if ($promptLower.Contains($keyword.ToLower())) {
                $matchCount++
                $matchedKeywords += $keyword
            }
        }

        $results += @{
            Name = $skill.Name
            Description = $skill.Description
            IsRelevant = $matchCount -gt 0
            MatchCount = $matchCount
            MatchedKeywords = $matchedKeywords
        }
    }

    return $results
}

if ($userPrompt) {
    $evaluationResults = Evaluate-Skills -Prompt $userPrompt
    $relevantSkills = $evaluationResults | Where-Object { $_.IsRelevant }

    Write-Output "## Instruction: Forced Skill Activation (MUST EXECUTE)"
    Write-Output ""
    Write-Output "### Step 1 - Evaluate"
    Write-Output "For each skill, state: [skill name] - Yes/No - [reason]"
    Write-Output ""
    Write-Output "Available skills:"
    foreach ($skill in $evaluationResults) {
        Write-Output "  - $($skill.Name): $($skill.Description)"
    }
    Write-Output ""
    Write-Output "User input: $userPrompt"
    Write-Output ""
    Write-Output "### Step 2 - Activate"

    if ($relevantSkills.Count -gt 0) {
        Write-Output "Relevant skills detected:"
        foreach ($skill in $relevantSkills) {
            Write-Output "- $($skill.Name): Yes - Matched keywords: $($skill.MatchedKeywords -join ', ')"
        }
        Write-Output ""
        Write-Output "Activation commands:"
        foreach ($skill in $relevantSkills) {
            Write-Output "> Skill($($skill.Name))"
        }
    } else {
        Write-Output "All skills evaluated as 'No', state 'no skill needed' and continue"
    }

    Write-Output ""
    Write-Output "### Step 3 - Implement"
    Write-Output "Only after completing Steps 1 and 2, begin implementing user request."
    Write-Output ""
    Write-Output "### Important"
    Write-Output "- Must complete Steps 1 and 2 before Step 3"
    Write-Output "- Use ``Skill()`` tool to activate relevant skills"
    Write-Output "- If no relevant skills, explain why and answer directly"
}
