#!/bin/sh
# SessionStart check (AGENTS.md §9, layer 3): warns when the FairPlayr git
# guard is not installed in this clone's .git/hooks. Read-only: it never
# installs anything, and always exits 0 so a session can still start.
# Stdout is added to the session context, so it stays silent when all is well.

root=${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$root" 2>/dev/null || exit 0

if out=$(sh .claude/hooks/install-git-guard.sh --check 2>&1); then
  exit 0
fi

echo "WARNING: the FairPlayr git guard is not fully installed in this clone (AGENTS.md §9, layer 3)."
echo "$out"
echo "Git writes from this session are then only guarded by permission rules and fp-guard."
echo "Tell the user and ask them to run: sh .claude/hooks/install-git-guard.sh"
exit 0
