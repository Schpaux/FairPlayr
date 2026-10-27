#!/bin/sh
# Installs the FairPlayr agent git guard into this repo's local git hooks.
# Safe to re-run. Refuses to overwrite a different, pre-existing hook.
# Usage: sh .claude/hooks/install-git-guard.sh [--check]
set -eu

repo_root=$(git rev-parse --show-toplevel)
# --git-common-dir is relative to the cwd, so resolve it from the repo root
cd "$repo_root"
hooks_dir="$(git rev-parse --git-common-dir)/hooks"
case "$hooks_dir" in /*) ;; *) hooks_dir="$repo_root/$hooks_dir" ;; esac
source_file="$repo_root/.claude/hooks/git/fp-git-guard.sh"
hooks="pre-commit pre-push pre-rebase pre-merge-commit"

if [ -n "$(git config --get core.hooksPath || true)" ]; then
  echo "core.hooksPath is set; local hooks in $hooks_dir would be ignored. Unset it first." >&2
  exit 1
fi

status=0
for hook in $hooks; do
  target="$hooks_dir/$hook"
  if [ "${1:-}" = "--check" ]; then
    if [ -x "$target" ] && cmp -s "$source_file" "$target"; then echo "ok       $hook"; else echo "MISSING  $hook"; status=1; fi
    continue
  fi
  if [ -e "$target" ] && ! cmp -s "$source_file" "$target"; then
    echo "skip     $hook (a different hook already exists at $target)" >&2
    status=1
    continue
  fi
  mkdir -p "$hooks_dir"
  cp "$source_file" "$target"
  chmod 755 "$target"
  echo "installed $hook"
done
exit $status
