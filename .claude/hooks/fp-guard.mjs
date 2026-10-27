#!/usr/bin/env node
/**
 * FairPlayr PreToolUse guard for Bash/Monitor commands (AGENTS.md §1, §9).
 *
 * Permission rules match the command text Claude writes, so `git -C . push`,
 * `sh -c "git push"`, `npm run <script>` or a shell script that commits are not
 * caught by `Bash(git push *)`. This hook parses the command (compound commands,
 * wrappers, quoting, `$(...)`, heredocs, `sh -c`, npm scripts, shell scripts)
 * and answers `permissionDecision: "ask"` for high-risk operations:
 *   git writes (commit, push, merge, rebase, destructive reset/checkout/clean, ...),
 *   database (supabase, psql, pg_dump), deploy (vercel, railway, cap sync),
 *   recursive or non-temp deletes, mutating remote HTTP calls, keychain reads,
 *   any use of the FP_GIT_APPROVED approval token or clearing CLAUDECODE,
 *   command names built at runtime ($VAR, $(...)), changes to the safety layers
 *   themselves (.git/hooks, .git/config, .claude/hooks, .claude/settings*.json),
 *   and Bash commands that name env or key files (.env.example excepted).
 *
 * It can only add prompts: it never returns "allow". Silence means the normal
 * permission flow continues. Unreadable hook input or a crash fails open. It is
 * a guard rail, not a sandbox: code that builds commands at runtime (e.g. a
 * script that assembles "pu"+"sh") can still get past it. The git hooks in
 * .git/hooks are the second layer.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const MAX_DEPTH = 5;
const MAX_FILE_BYTES = 256 * 1024;

// ---------------------------------------------------------------- tokenizer

/**
 * Split shell source into simple commands. Each command is
 * { words: string[], heredocs: string[] }. Command/process substitutions are
 * returned separately in `nested` so they can be analysed recursively.
 */
function parseShell(src) {
  const commands = [];
  const nested = [];
  let words = [];
  let heredocs = [];
  let pendingHeredocs = [];
  let cur = '';
  let inWord = false;
  let skipNextWord = false;
  let hereStringNext = false;
  let redirects = [];
  let i = 0;

  const endWord = () => {
    if (inWord) {
      if (hereStringNext) { hereStringNext = false; heredocs.push(cur); }
      else if (skipNextWord) { skipNextWord = false; redirects.push(cur); }
      else words.push(cur);
    }
    cur = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    skipNextWord = false;
    hereStringNext = false;
    if (words.length || heredocs.length || redirects.length) commands.push({ words, heredocs, redirects });
    words = [];
    heredocs = [];
    redirects = [];
  };
  const readBalanced = (start) => {
    // src[start] is just after "$(" / "<(" / ">(" ; returns [content, endIndex]
    let depth = 1;
    let j = start;
    let quote = null;
    while (j < src.length) {
      const c = src[j];
      if (quote) {
        if (c === '\\' && quote === '"') j++;
        else if (c === quote) quote = null;
      } else if (c === '\'' || c === '"') quote = c;
      else if (c === '\\') j++;
      else if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return [src.slice(start, j), j];
      }
      j++;
    }
    return [src.slice(start), src.length];
  };

  while (i < src.length) {
    const c = src[i];

    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue; }
      cur += src[i + 1] ?? '';
      inWord = true;
      i += 2;
      continue;
    }
    if (c === '\'') {
      const end = src.indexOf('\'', i + 1);
      const stop = end === -1 ? src.length : end;
      cur += src.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') { cur += src[j + 1] ?? ''; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '(') {
          const [content, end] = readBalanced(j + 2);
          nested.push(content);
          cur += '$(...)';
          j = end + 1;
          continue;
        }
        if (src[j] === '`') {
          const end = src.indexOf('`', j + 1);
          const stop = end === -1 ? src.length : end;
          nested.push(src.slice(j + 1, stop));
          j = stop + 1;
          continue;
        }
        cur += src[j];
        j++;
      }
      inWord = true;
      i = j + 1;
      continue;
    }
    if ((c === '$' || c === '<' || c === '>') && src[i + 1] === '(') {
      const [content, end] = readBalanced(i + 2);
      nested.push(content);
      cur += '$(...)';
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      const stop = end === -1 ? src.length : end;
      nested.push(src.slice(i + 1, stop));
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === '#' && !inWord) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      // heredoc: <<WORD, <<-WORD, <<'WORD', <<"WORD"
      endWord();
      let j = i + 2;
      if (src[j] === '-') j++;
      while (src[j] === ' ' || src[j] === '\t') j++;
      let delim = '';
      if (src[j] === '\'' || src[j] === '"') {
        const q = src[j];
        const end = src.indexOf(q, j + 1);
        delim = src.slice(j + 1, end === -1 ? src.length : end);
        j = end === -1 ? src.length : end + 1;
      } else {
        while (j < src.length && !/[\s;&|<>()]/.test(src[j])) delim += src[j++];
      }
      pendingHeredocs.push(delim);
      i = j;
      continue;
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] === '<') {
      // here-string: the next word is fed to the command's stdin like a heredoc
      endWord();
      hereStringNext = true;
      i += 3;
      continue;
    }
    if (c === '>' || c === '<') {
      // redirection: drop a numeric fd prefix and keep the target word apart
      if (inWord && /^\d+$/.test(cur)) { cur = ''; inWord = false; }
      endWord();
      let j = i + 1;
      while (src[j] === '>' || src[j] === '<' || src[j] === '|') j++;
      if (src[j] === '&') {
        j++;
        if (/\d|-/.test(src[j] ?? '')) { while (/\d|-/.test(src[j] ?? '')) j++; i = j; continue; }
      }
      skipNextWord = true;
      i = j;
      continue;
    }
    if (c === '\n') {
      endCommand();
      i++;
      if (pendingHeredocs.length) {
        for (const delim of pendingHeredocs) {
          const lines = [];
          while (i < src.length) {
            const nl = src.indexOf('\n', i);
            const line = src.slice(i, nl === -1 ? src.length : nl);
            i = nl === -1 ? src.length : nl + 1;
            if (line.replace(/^\t+/, '') === delim) break;
            lines.push(line);
          }
          const body = lines.join('\n');
          const owner = commands[commands.length - 1];
          if (owner) owner.heredocs.push(body);
        }
        pendingHeredocs = [];
      }
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || (c === '{' && !inWord) || (c === '}' && !inWord)) {
      endCommand();
      i++;
      continue;
    }
    if (c === ' ' || c === '\t') {
      endWord();
      i++;
      continue;
    }
    cur += c;
    inWord = true;
    i++;
  }
  endCommand();
  return { commands, nested };
}

// ---------------------------------------------------------------- helpers

const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'tsx', 'ts-node']);
const PKG_RUNNERS = new Set(['npx', 'bunx', 'pnpx']);
const SHELL_KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!']);

// The safety layers themselves (AGENTS.md §9): changing these disables a layer.
const GUARD_PATH = /(^|\/)\.git\/(hooks(\/|$)|config$)|(^|\/)\.claude\/(hooks(\/|$)|settings(\.local)?\.json$)/;
// Secret files the Read deny rules cover; Bash is not covered by those rules.
// .env.example is the one env file that stays readable.
const SECRET_PATH = /(^|\/)\.env(rc)?(\.(?!example$)[\w.*-]+|\*)?$|\.(pem|p8|p12|key)$|(^|\/)supabase\/\.temp(\/|$)/;
const FILE_MUTATORS = new Set(['chmod', 'chown', 'chflags', 'chgrp', 'mv', 'cp', 'ln', 'tee', 'truncate', 'install', 'touch', 'dd', 'rsync', 'ditto']);
const CLEARS_CLAUDECODE = /\bunset\s+(-v\s+)?([\w\s]*\s)?CLAUDECODE\b|-u\s*CLAUDECODE\b|(^|[\s;&|(])CLAUDECODE=(?!1\b)|delete\s+process\.env\.CLAUDECODE|\benv\s+(-\S+\s+)*-i\b/;

function base(word) {
  return path.basename(word || '');
}

function isTempPath(p) {
  const tmp = [os.tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'];
  if (!path.isAbsolute(p)) return false;
  const resolved = path.resolve(p);
  return tmp.some((t) => resolved === t || resolved.startsWith(t.endsWith('/') ? t : t + '/'));
}

function readTextFile(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Strip env assignments and exec wrappers; returns the words of the real command. */
function stripWrappers(words, ctx) {
  let w = words.slice();
  for (let guard = 0; guard < 20 && w.length; guard++) {
    const head = w[0];
    const name = base(head);
    if (ENV_ASSIGN.test(head)) {
      if (/^FP_GIT_APPROVED=/.test(head)) ctx.flag('uses the FP_GIT_APPROVED approval token');
      if (/^GIT_(DIR|WORK_TREE|CONFIG\w*)=/.test(head)) ctx.gitEnv = true;
      w = w.slice(1);
      continue;
    }
    if (SHELL_KEYWORDS.has(head)) { w = w.slice(1); continue; }
    if (name === 'env') {
      let j = 1;
      while (j < w.length && (w[j].startsWith('-') || ENV_ASSIGN.test(w[j]))) {
        if (/^FP_GIT_APPROVED=/.test(w[j])) ctx.flag('uses the FP_GIT_APPROVED approval token');
        if (w[j] === '-u' || w[j] === '-C' || w[j] === '-S') j++;
        j++;
      }
      w = w.slice(j);
      continue;
    }
    if (name === 'sudo' || name === 'doas') {
      let j = 1;
      while (j < w.length && w[j].startsWith('-')) {
        if (['-u', '-g', '-C', '-h', '-p', '-U'].includes(w[j])) j++;
        j++;
      }
      w = w.slice(j);
      continue;
    }
    if (['command', 'builtin', 'exec', 'nohup', 'noglob', 'nocorrect', 'caffeinate', 'setsid', 'unbuffer'].includes(name)) {
      if (name === 'command' && (w[1] === '-v' || w[1] === '-V')) return [];
      let j = 1;
      while (j < w.length && w[j].startsWith('-')) j++;
      w = w.slice(j);
      continue;
    }
    if (name === 'time' || name === 'nice' || name === 'ionice' || name === 'stdbuf' || name === 'chronic') {
      let j = 1;
      while (j < w.length && w[j].startsWith('-')) {
        if (name === 'nice' && w[j] === '-n') j++;
        j++;
      }
      w = w.slice(j);
      continue;
    }
    if (name === 'timeout' || name === 'gtimeout') {
      let j = 1;
      while (j < w.length && w[j].startsWith('-')) {
        if (w[j] === '-s' || w[j] === '-k' || w[j] === '--signal' || w[j] === '--kill-after') j++;
        j++;
      }
      w = w.slice(j + 1); // skip the duration
      continue;
    }
    if (name === 'watch' || name === 'flock') {
      let j = 1;
      while (j < w.length && w[j].startsWith('-')) {
        if (['-n', '-d', '-w', '--interval'].includes(w[j])) j++;
        j++;
      }
      if (name === 'flock') j++; // lock file
      w = w.slice(j);
      continue;
    }
    if (name === 'xargs') {
      let j = 1;
      while (j < w.length && w[j].startsWith('-')) {
        if (['-n', '-I', '-L', '-P', '-d', '-s', '-E', '-a'].includes(w[j])) j++;
        j++;
      }
      w = w.slice(j);
      ctx.viaXargs = true;
      continue;
    }
    break;
  }
  return w;
}

// ---------------------------------------------------------------- analysers

function analyseGit(args, ctx) {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '-C' || a === '--git-dir' || a === '--work-tree' || a === '--namespace' || a === '--exec-path') { i += 2; continue; }
    if (a === '-c') {
      if (/hookspath|fsmonitor|sshcommand|core\.editor|alias\./i.test(args[i + 1] || '')) {
        ctx.flag('git -c overrides a hook/command setting');
      }
      i += 2;
      continue;
    }
    if (a.startsWith('-c') && a.length > 2) {
      if (/hookspath|fsmonitor/i.test(a)) ctx.flag('git -c overrides a hook setting');
      i++;
      continue;
    }
    if (a.startsWith('-')) { i++; continue; }
    break;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) return;
  if (sub === '' || sub.includes('$')) { ctx.flag('git subcommand built at runtime'); return; }
  const has = (...flags) => rest.some((r) => flags.includes(r) || flags.some((f) => f.endsWith('=') && r.startsWith(f)));
  const first = rest.find((r) => !r.startsWith('-'));

  if (rest.includes('--no-verify')) ctx.flag(`git ${sub} --no-verify`);

  switch (sub) {
    case 'pull':
      // fast-forward/merge pulls are caught by the pre-merge-commit git hook
      if (has('--rebase', '-r')) ctx.flag('git pull --rebase');
      return;
    case 'commit': case 'push': case 'merge': case 'rebase': case 'cherry-pick': case 'revert':
    case 'am': case 'filter-branch': case 'filter-repo': case 'update-ref': case 'replace':
    case 'send-pack': case 'fast-import': case 'commit-tree':
      ctx.flag(`git ${sub}`);
      return;
    case 'bisect': case 'submodule':
      if (first === 'run' || first === 'foreach') ctx.flag(`git ${sub} ${first}`);
      return;
    case 'reset':
      if (has('--hard', '--merge', '--keep')) ctx.flag('git reset --hard/--merge/--keep');
      return;
    case 'tag': {
      const listing = rest.length === 0 || has('-l', '--list', '-n', '--contains', '--points-at', '--merged', '--no-merged', '--sort=', '--format=');
      if (!listing) ctx.flag('git tag (create/delete)');
      return;
    }
    case 'branch':
      if (has('-d', '-D', '--delete', '-m', '-M', '--move', '-f', '--force', '-c', '-C', '--copy', '--set-upstream-to=', '-u', '--unset-upstream')) ctx.flag('git branch delete/move/force');
      return;
    case 'worktree':
      if (first === 'remove' || first === 'prune' || first === 'move') ctx.flag(`git worktree ${first}`);
      return;
    case 'clean':
      if (!has('-n', '--dry-run')) ctx.flag('git clean');
      return;
    case 'checkout':
      if (has('--', '.', '-f', '--force', '-B', '--ours', '--theirs', '-p', '--patch')) ctx.flag('git checkout discarding changes');
      return;
    case 'switch':
      if (has('--discard-changes', '-f', '--force', '-C', '--force-create')) ctx.flag('git switch discarding changes');
      return;
    case 'restore':
      if (!(has('--staged', '-S') && !has('--worktree', '-W'))) ctx.flag('git restore (discards working-tree changes)');
      return;
    case 'stash':
      if (first === 'drop' || first === 'clear') ctx.flag(`git stash ${first}`);
      return;
    case 'rm':
      if (!has('--cached')) ctx.flag('git rm');
      return;
    case 'config': {
      const reading = has('--get', '--get-all', '--list', '-l', '--get-regexp', '--show-origin');
      const writing = !reading && (rest.filter((r) => !r.startsWith('-')).length >= 2 || has('--add', '--replace-all', '--unset', '--unset-all', '-e', '--edit'));
      if (writing && rest.some((r) => /hookspath|fsmonitor/i.test(r))) ctx.flag('git config core.hooksPath/fsmonitor');
      // a stored alias or command setting can later run a git write under a harmless name
      else if (writing && rest.some((r) => /^(alias\.|core\.(sshcommand|editor|pager|askpass)|credential\.|include(if)?\.|url\.)/i.test(r))) ctx.flag('git config alias/command setting');
      else if (has('--global', '--system') && writing) ctx.flag('git config --global/--system write');
      return;
    }
    case 'remote':
      if (['add', 'set-url', 'remove', 'rm', 'rename', 'set-head', 'prune'].includes(first)) ctx.flag(`git remote ${first}`);
      return;
    case 'reflog':
      if (first === 'expire' || first === 'delete') ctx.flag(`git reflog ${first}`);
      return;
    case 'gc': case 'prune':
      if (sub === 'prune' || rest.some((r) => r.startsWith('--prune'))) ctx.flag(`git ${sub} --prune`);
      return;
    default:
  }
}

function analyseGh(args, ctx) {
  const a = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-R' || args[i] === '--repo') { i++; continue; }
    if (args[i].startsWith('--repo=')) continue;
    a.push(args[i]);
  }
  const [group, verb] = a;
  if (!group) return;
  if (group === 'api') {
    const methodIdx = a.findIndex((x) => x === '-X' || x === '--method');
    const attached = a.find((x) => /^-X./.test(x) || x.startsWith('--method='));
    const method = (methodIdx >= 0 ? (a[methodIdx + 1] || '') : (attached || '').replace(/^(-X|--method=)/, '')).toUpperCase();
    const writes = a.some((x) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(x) || /^-[fF]./.test(x) || x.startsWith('--field=') || x.startsWith('--raw-field=') || x.startsWith('--input='));
    if ((method && method !== 'GET') || writes) ctx.flag('gh api write request');
    return;
  }
  if (group === 'auth' && ['token', 'logout', 'refresh', 'setup-git'].includes(verb)) { ctx.flag(`gh auth ${verb}`); return; }
  if (group === 'secret' || group === 'variable' || group === 'release') {
    if (verb !== 'list' && verb !== 'view') ctx.flag(`gh ${group} ${verb || ''}`.trim());
    return;
  }
  const mutating = /^(create|delete|edit|merge|close|reopen|ready|run|set|rename|archive|unarchive|transfer|comment|review|lock|unlock|enable|disable|cancel|rerun|upload|fork|sync|deploy|pin|unpin|develop|add|remove)$/;
  if (verb && mutating.test(verb)) ctx.flag(`gh ${group} ${verb}`);
}

function analyseSupabase(args, ctx) {
  const safeFirst = new Set(['--version', '-v', '--help', '-h', 'help', 'status', 'start', 'init', 'completion', 'bootstrap']);
  const first = args.find((x) => !x.startsWith('--experimental')) || '';
  if (args.includes('--help') || args.includes('-h')) return;
  if (safeFirst.has(first)) return;
  if (first === 'stop' && !args.includes('--no-backup')) return;
  if (first === 'migration' && (args.includes('new') || (args.includes('list') && args.includes('--local')))) return;
  if (first === 'gen' && args.includes('--local')) return;
  ctx.flag(`supabase ${args.slice(0, 2).join(' ')}`.trim());
}

function analyseVercel(args, ctx) {
  const positional = args.filter((x) => !x.startsWith('-'));
  const first = positional[0] || args[0] || '';
  if (['--version', '-v', '--help', '-h', 'whoami', 'help', 'ls', 'list', 'inspect', 'logs'].includes(first) || args.includes('--help')) return;
  if (['env', 'project', 'domains', 'alias'].includes(first) && ['ls', 'list'].includes(positional[1])) return;
  ctx.flag(`vercel ${first}`.trim());
}

function analyseCapacitor(args, ctx) {
  const first = args.find((x) => !x.startsWith('-')) || '';
  if (['sync', 'copy', 'update', 'run', 'build', 'add', 'migrate', 'deploy'].includes(first)) ctx.flag(`cap ${first}`);
}

function analyseRm(args, ctx, cwd) {
  const flags = args.filter((x) => x.startsWith('-') && x !== '--');
  const targets = args.filter((x) => !x.startsWith('-'));
  const recursive = flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive');
  if (ctx.viaXargs || targets.length === 0) { ctx.flag('delete with targets from a pipe/xargs/find'); return; }
  // $VAR, globs and a bare ~ are expanded by the shell, so only a literal path can count as temp
  const allTemp = targets.every((t) => !/[$`*?[]|^~(?!\/)/.test(t) && isTempPath(path.resolve(cwd, t.replace(/^~(?=\/)/, os.homedir()))));
  if (allTemp) return;
  ctx.flag(recursive ? 'recursive delete (rm -r)' : 'file delete (rm)');
}

function analyseCurl(args, ctx) {
  const urls = args.filter((x) => /^https?:\/\//i.test(x));
  const remote = urls.some((u) => !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(u));
  if (!remote) return;
  const methodIdx = args.findIndex((x) => x === '-X' || x === '--request');
  const method = methodIdx >= 0 ? (args[methodIdx + 1] || '').toUpperCase() : '';
  const asQuery = args.includes('-G') || args.includes('--get'); // -G turns --data into a GET query
  const body = !asQuery && args.some((x) => /^(-d|--data.*|-F|--form.*|-T|--upload-file|--json)$/.test(x) || /^-(d|F|T)./.test(x));
  if ((method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) || body) ctx.flag('mutating HTTP request to a remote host');
}

const CODE_PATTERNS = [
  [/\bgit\b[^\n]{0,120}?\b(push|commit|merge|rebase|reset\s+--hard|clean\s+-[a-z]*f|branch\s+-D|worktree\s+remove|filter-branch)\b/, 'git write operation inside code'],
  [/(exec\w*|spawn\w*|system|popen|subprocess\.\w+|\brun|call)\s*\(\s*\[?\s*['"`](npx\s+(--yes\s+|-y\s+)?)?(supabase|psql|pg_dump|pg_restore|vercel|railway)\b/, 'database/deploy CLI launched from code'],
  [/(exec\w*|spawn\w*|system|popen|subprocess\.\w+|\brun|call)\s*\(\s*\[?\s*['"`](npx\s+)?cap\b['"\s,]+(sync|copy|run|build)\b/, 'cap sync launched from code'],
  [/rmSync\([^)]*recursive|\brm\(\s*[^)]*recursive|shutil\.rmtree|\brimraf\b|rm\s+-[a-zA-Z]*r[a-zA-Z]*\s/, 'recursive delete inside code'],
  [/FP_GIT_APPROVED/, 'uses the FP_GIT_APPROVED approval token'],
  [/core\.hooksPath/i, 'touches core.hooksPath'],
  [CLEARS_CLAUDECODE, 'clears CLAUDECODE (disables the git hooks)'],
];

// fp-guard's own tests are full of the commands it flags; they only call evaluate().
const GUARD_TESTS = /(^|\/)\.claude\/hooks\/[\w-]+\.node-test\.mjs$/;

function analyseCode(code, ctx) {
  for (const [re, reason] of CODE_PATTERNS) if (re.test(code)) ctx.flag(reason);
}

function analyseInterpreter(prog, args, heredocs, ctx, cwd) {
  const codeFlags = new Set(['-e', '-c', '--eval', '-p', '--print', '-E', 'eval']);
  for (let i = 0; i < args.length; i++) {
    if (codeFlags.has(args[i]) && args[i + 1] !== undefined) { analyseCode(args[i + 1], ctx); return; }
  }
  heredocs.forEach((h) => analyseCode(h, ctx));
  const script = args.find((x) => !x.startsWith('-') && /\.(c|m)?(j|t)sx?$|\.py$|\.rb$|\.pl$/.test(x));
  if (script && !(args.includes('--test') && GUARD_TESTS.test(path.resolve(cwd, script)))) {
    const text = readTextFile(path.resolve(cwd, script));
    if (text) analyseCode(text, ctx);
  }
}

function packageScripts(cwd) {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const text = readTextFile(path.join(dir, 'package.json'));
    if (text) {
      try { return JSON.parse(text).scripts || {}; } catch { return {}; }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return {};
}

// Script names that need approval regardless of body; cap:* is judged by its body.
const RISKY_SCRIPT = /^(deploy|release|publish|db:|migrat|supabase|prod|seed)/i;
const PM_BUILTINS = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'list', 'ls', 'why', 'outdated', 'audit', 'store', 'config', 'info', 'view', 'init', 'create', 'link', 'unlink', 'prune', 'rebuild', 'import', 'patch', 'env', 'setup', 'root', 'bin', 'help', 'cache', 'version', 'pack']);

function analysePackageManager(prog, args, ctx, cwd, depth) {
  const first = args[0];
  if (!first) return;
  if (['publish', 'unpublish', 'deprecate', 'dist-tag', 'owner', 'token', 'adduser', 'login'].includes(first)) {
    ctx.flag(`${prog} ${first}`);
    return;
  }
  if ((prog === 'pnpm' && first === 'dlx') || ((prog === 'pnpm' || prog === 'yarn') && first === 'exec') || (prog === 'npm' && first === 'exec')) {
    analyseCommandWords(['npx', ...args.slice(1)], [], ctx, cwd, depth + 1);
    return;
  }
  let script = null;
  if (first === 'run' || first === 'run-script') script = args.find((x, i) => i > 0 && !x.startsWith('-'));
  else if (first === 'test' || first === 't' || first === 'start') script = first === 't' ? 'test' : first;
  else if (prog !== 'npm' && !PM_BUILTINS.has(first) && !first.startsWith('-')) script = first;
  if (!script) return;
  if (RISKY_SCRIPT.test(script)) ctx.flag(`${prog} script "${script}"`);
  const scripts = packageScripts(cwd);
  for (const name of [`pre${script}`, script, `post${script}`]) {
    if (scripts[name]) analyseShell(scripts[name], ctx, cwd, depth + 1);
  }
}

function analyseCommandWords(rawWords, heredocs, ctx, cwd, depth) {
  const words = stripWrappers(rawWords, ctx);
  if (!words.length) return cwd;
  const prog = base(words[0]);
  const args = words.slice(1);

  if (prog === 'cd' && args[0] && !args[0].startsWith('-')) {
    return path.resolve(cwd, args[0].replace(/^~(?=\/|$)/, os.homedir()));
  }
  if (ctx.gitEnv && prog === 'git') ctx.flag('git with GIT_DIR/GIT_WORK_TREE override');
  if (words[0] === '' || words[0].includes('$')) ctx.flag('command name built at runtime ($VAR or substitution)');
  if (!['ls', 'test', '[', 'echo', 'printf', 'stat'].includes(prog) && args.some((x) => SECRET_PATH.test(x))) {
    ctx.flag('names an env or key file (Read deny rules do not cover Bash)');
  }
  const inPlace = (prog === 'sed' || prog === 'perl') && args.some((x) => /^-[a-zA-Z]*i/.test(x));
  if ((FILE_MUTATORS.has(prog) || inPlace) && args.some((x) => GUARD_PATH.test(x))) {
    ctx.flag('modifies a safety layer (git hooks, .claude hooks or settings)');
  }

  if (prog === 'git') analyseGit(args, ctx);
  else if (prog === 'gh') analyseGh(args, ctx);
  else if (prog === 'supabase') analyseSupabase(args, ctx);
  else if (['psql', 'pg_dump', 'pg_dumpall', 'pg_restore', 'dropdb', 'createdb', 'pg_ctl'].includes(prog)) ctx.flag(prog);
  else if (prog === 'vercel') analyseVercel(args, ctx);
  else if (prog === 'railway') { if (!['--version', 'status', 'whoami', 'logs'].includes(args[0])) ctx.flag(`railway ${args[0] || ''}`.trim()); }
  else if (prog === 'cap') analyseCapacitor(args, ctx);
  else if (['rm', 'unlink', 'rmdir', 'trash', 'shred'].includes(prog)) analyseRm(args, ctx, cwd);
  else if (prog === 'find') {
    if (args.includes('-delete')) ctx.flag('find -delete');
    const ex = args.findIndex((x) => x === '-exec' || x === '-execdir' || x === '-ok' || x === '-okdir');
    if (ex >= 0) {
      const end = args.findIndex((x, i) => i > ex && (x === ';' || x === '+' || x === '\\;'));
      const inner = args.slice(ex + 1, end === -1 ? undefined : end).filter((x) => x !== '{}');
      ctx.viaXargs = true;
      analyseCommandWords(inner, [], ctx, cwd, depth + 1);
      ctx.viaXargs = false;
    }
  }
  else if (prog === 'security' && /^(find-generic-password|find-internet-password|dump-keychain|export)$/.test(args[0] || '')) ctx.flag(`security ${args[0]}`);
  else if (['curl', 'wget', 'http', 'https'].includes(prog)) analyseCurl(args, ctx);
  else if (PKG_RUNNERS.has(prog)) {
    let j = 0;
    while (j < args.length && args[j].startsWith('-')) { if (args[j] === '-p' || args[j] === '--package') j++; j++; }
    const bin = args[j] || '';
    const rest = args.slice(j + 1);
    const binName = bin.replace(/(.)@[^/]*$/, '$1').replace(/^@(capacitor|railway)\/cli$/, '$1');
    if (binName === 'supabase') analyseSupabase(rest, ctx);
    else if (binName === 'vercel') analyseVercel(rest, ctx);
    else if (binName === 'cap' || binName === 'capacitor') analyseCapacitor(rest, ctx);
    else if (binName === 'railway') { if (!['--version', 'status', 'whoami'].includes(rest[0])) ctx.flag('railway'); }
    else if (binName === 'tsx' || binName === 'ts-node') analyseInterpreter(binName, rest, heredocs, ctx, cwd);
    else if (bin) analyseCommandWords([bin, ...rest], heredocs, ctx, cwd, depth + 1);
  }
  else if (['npm', 'pnpm', 'yarn'].includes(prog) || (prog === 'bun' && args[0] !== '-e')) analysePackageManager(prog, args, ctx, cwd, depth);
  else if (SHELLS.has(prog)) {
    const ci = args.findIndex((x) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(x));
    if (ci >= 0 && args[ci + 1] !== undefined) analyseShell(args[ci + 1], ctx, cwd, depth + 1);
    else {
      const file = args.find((x) => !x.startsWith('-'));
      if (file) {
        const text = readTextFile(path.resolve(cwd, file));
        if (text) analyseShell(text, ctx, cwd, depth + 1);
      } else heredocs.forEach((h) => analyseShell(h, ctx, cwd, depth + 1));
    }
  }
  else if (prog === 'source' || prog === '.') {
    const text = args[0] && readTextFile(path.resolve(cwd, args[0]));
    if (text) analyseShell(text, ctx, cwd, depth + 1);
  }
  else if (prog === 'eval') analyseShell(args.join(' '), ctx, cwd, depth + 1);
  else if (INTERPRETERS.has(prog) || /^python3(\.\d+)?$/.test(prog)) analyseInterpreter(prog, args, heredocs, ctx, cwd);
  else if (words[0].includes('/')) {
    // a local script or binary: follow shell scripts, scan other scripts as code
    const text = readTextFile(path.resolve(cwd, words[0]));
    if (text && text.startsWith('#!')) {
      const shebang = text.slice(0, text.indexOf('\n'));
      if (/\b(sh|bash|zsh|dash)\b/.test(shebang)) analyseShell(text, ctx, cwd, depth + 1);
      else analyseCode(text, ctx);
    }
  }
  return cwd;
}

function analyseShell(src, ctx, cwd, depth = 0) {
  if (depth > MAX_DEPTH) { ctx.flag('command nesting too deep to inspect'); return; }
  const { commands, nested } = parseShell(String(src));
  let dir = cwd;
  for (const cmd of commands) {
    ctx.viaXargs = false;
    ctx.gitEnv = false;
    for (const target of cmd.redirects) {
      if (GUARD_PATH.test(target)) ctx.flag('redirects into a safety layer (git hooks, .claude hooks or settings)');
      if (SECRET_PATH.test(target)) ctx.flag('redirects to or from an env or key file');
    }
    dir = analyseCommandWords(cmd.words, cmd.heredocs, ctx, dir, depth) || dir;
  }
  for (const n of nested) analyseShell(n, ctx, dir, depth + 1);
}

// ---------------------------------------------------------------- entry

function evaluate(command, cwd) {
  const reasons = new Set();
  const ctx = { flag: (r) => reasons.add(r), viaXargs: false, gitEnv: false };
  if (/FP_GIT_APPROVED/.test(command)) ctx.flag('uses the FP_GIT_APPROVED approval token');
  if (CLEARS_CLAUDECODE.test(command)) ctx.flag('clears CLAUDECODE (disables the git hooks)');
  try {
    analyseShell(command, ctx, cwd || process.cwd(), 0);
  } catch (err) {
    ctx.flag(`fp-guard could not parse the command (${err.message})`);
  }
  return [...reasons];
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    const command = input?.tool_input?.command;
    if (typeof command !== 'string' || !command.trim()) process.exit(0);
    const reasons = evaluate(command, input.cwd);
    if (reasons.length) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `FairPlayr guard (AGENTS.md §1): ${reasons.join('; ')}. Needs explicit approval for this specific command.`,
        },
      }));
    }
    process.exit(0);
  });
}

// import.meta.url is the realpath; argv[1] is not, so compare realpaths or the
// guard would silently do nothing when the project is reached through a symlink.
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isEntryPoint()) main();

export { evaluate, parseShell };
