#!/bin/sh
# FairPlayr agent git guard (AGENTS.md §1). Installed into .git/hooks as
# pre-commit, pre-push, pre-rebase and pre-merge-commit by
# .claude/hooks/install-git-guard.sh. Hooks live in the common git dir, so
# every worktree of this repo is covered.
#
# Refuses git write operations started from inside a Claude Code session
# (CLAUDECODE=1 is set for Claude's shell and every subprocess, including
# npm scripts and shell scripts), unless the user approved that specific
# command and it carries FP_GIT_APPROVED=1. The PreToolUse guard always asks
# before a command containing that token runs.
#
# Manual git from a terminal or VS Code is unaffected: CLAUDECODE is unset there.
# This is a guard rail, not a sandbox: `--no-verify` and `core.hooksPath`
# bypasses are separately blocked by ECC block-no-verify and fp-guard.

hook_name=$(basename "$0")

if [ -n "${CLAUDECODE:-}" ] && [ "${FP_GIT_APPROVED:-}" != "1" ]; then
  echo "fp-git-guard: '$hook_name' refused. Git write operations started by a Claude Code agent need" >&2
  echo "explicit approval from the user for this specific action (AGENTS.md §1)." >&2
  echo "Ask the user; after approval, run the approved command prefixed with FP_GIT_APPROVED=1." >&2
  exit 1
fi

exit 0
