// Run: node --test .claude/hooks/fp-guard.node-test.mjs
// (named so Vitest's *.test.* glob does not pick it up)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate } from './fp-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-guard-'));
fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({
  scripts: {
    test: 'vitest run',
    verify: 'npm run test && npm run lint',
    lint: 'eslint',
    sneaky: 'node scripts/x.js && git -C . push origin main',
    'cap:sync:prod': 'cap sync',
    'ship:it': 'sh ./release.sh',
  },
}));
fs.writeFileSync(path.join(fixture, 'release.sh'), '#!/bin/sh\nset -e\ngit add -A\ngit commit -m "release"\n');
fs.writeFileSync(path.join(fixture, 'safe.sh'), '#!/bin/bash\necho ok\nls -la\n');
fs.writeFileSync(path.join(fixture, 'cleanup.py'), 'import shutil\nshutil.rmtree("build")\n');

const ask = (cmd, cwd = fixture) => assert.ok(evaluate(cmd, cwd).length > 0, `expected ask for: ${cmd}`);
const quiet = (cmd, cwd = fixture) => assert.deepEqual(evaluate(cmd, cwd), [], `expected no prompt for: ${cmd}`);

test('git write operations ask, including disguised forms', () => {
  ask('git commit -m "x"');
  ask('git push');
  ask('git -C /some/repo push origin main');
  ask('git -c push.default=current push');
  ask("git 'push' origin main");
  ask('/usr/bin/git commit -am wip');
  ask('git --git-dir=.git --work-tree=. merge feature');
  ask('cd /tmp && git commit -m x');
  ask('echo "$(git push)"');
  ask('sh -c "git push origin main"');
  ask("bash -lc 'cd x && git rebase main'");
  ask('eval git push');
  ask('env FOO=1 git push');
  ask('timeout 30 git push');
  ask('git reset --hard HEAD~1');
  ask('git clean -fd');
  ask('git checkout -- src/app.ts');
  ask('git restore src/app.ts');
  ask('git branch -D old');
  ask('git worktree remove ../wt');
  ask('git stash drop');
  ask('git tag v1.0');
  ask('git rm src/a.ts');
  ask('git -c core.hooksPath=/dev/null commit -m x');
  ask('git config core.hooksPath /dev/null');
  ask('git remote set-url origin https://example.com/x.git');
  ask('git commit --no-verify -m x');
  ask('GIT_DIR=/x/.git git log && git push');
});

test('read-only and local git operations stay quiet', () => {
  quiet('git status');
  quiet('git -C /some/repo log --oneline -5');
  quiet('git diff HEAD -- src');
  quiet('git add src/a.ts');
  quiet('git checkout -b feature/x');
  quiet('git switch main');
  quiet('git branch feature/y');
  quiet('git worktree add ../wt-a -b agent/a');
  quiet('git worktree list');
  quiet('git stash list');
  quiet('git tag');
  quiet('git tag -l "v*"');
  quiet('git restore --staged src/a.ts');
  quiet('git rm --cached file');
  quiet('git fetch origin');
  quiet('git config --get user.name');
  quiet('git clean -n');
});

test('text mentioning dangerous commands is not a command', () => {
  quiet('grep -rn "git push" docs/');
  quiet('echo "remember to git commit later"');
  quiet("rg 'supabase db push' AGENTS.md");
  quiet('cat <<EOF > notes.txt\ngit push origin main\nsupabase db push\nEOF');
  quiet('git log --grep="push"');
});

test('approval token always asks', () => {
  ask('FP_GIT_APPROVED=1 git commit -m "approved"');
  ask('export FP_GIT_APPROVED=1');
  ask('env FP_GIT_APPROVED=1 npm run verify');
});

test('database, deploy and native sync ask', () => {
  ask('supabase db push');
  ask('supabase migration up');
  ask('supabase link --project-ref abc');
  ask('npx supabase db reset');
  ask('npx --yes supabase@latest functions deploy x');
  ask('psql "$DATABASE_URL" -c "select 1"');
  ask('pg_dump mydb > dump.sql');
  ask('vercel --prod');
  ask('npx vercel@latest deploy');
  ask('npx --yes vercel@latest env add X production');
  ask('npx cap sync ios');
  ask('npx @capacitor/cli sync');
  ask('npm run cap:sync:prod');
  ask('railway up');
  quiet('supabase --version');
  quiet('supabase status');
  quiet('supabase migration new add_table');
  quiet('vercel --version');
  quiet('npx cap open ios');
});

test('indirect execution through npm scripts, shell scripts and code', () => {
  ask('npm run sneaky');
  ask('npm run ship:it');
  ask('bash release.sh');
  ask('./release.sh');
  ask('source release.sh');
  ask('python3 cleanup.py');
  ask('node -e "require(\'child_process\').execSync(\'git push\')"');
  ask("python3 -c 'import subprocess; subprocess.run([\"git\",\"commit\",\"-m\",\"x\"])'");
  ask('python3 - <<\'EOF\'\nimport subprocess\nsubprocess.run(["supabase", "db", "push"])\nEOF');
  ask('bash <<EOF\ngit push\nEOF');
  quiet('npm run verify');
  quiet('npm test');
  quiet('npm run lint');
  quiet('bash safe.sh');
  quiet('./safe.sh');
  quiet('node -e "console.log(require(\'./package.json\').name)"');
  quiet('npx vitest run src/domain/fairness.test.ts');
  quiet('npx playwright test e2e/live-sideline.spec.ts');
});

test('deletes ask unless they only touch temp directories', () => {
  const project = '/work/fairplayr';
  ask('rm src/a.ts', project);
  ask('rm -rf node_modules', project);
  ask('find . -name "*.log" -delete', project);
  ask('find . -name "*.tmp" -exec rm {} \\;', project);
  ask('ls *.patch | xargs rm', project);
  ask('cd src && rm -r domain', project);
  ask('cd /tmp && rm -rf ~/Claude', project);
  quiet('rm -rf /tmp/fp-scratch');
  quiet(`rm -f ${path.join(os.tmpdir(), 'x.txt')}`);
  quiet('rm -rf /private/tmp/claude-501/session/scratchpad/out');
});

test('remote mutating HTTP and GitHub writes ask; reads stay quiet', () => {
  ask('curl -X POST https://api.supabase.com/v1/projects -d "{}"');
  ask('curl -s https://example.com/api -d @payload.json');
  ask('gh pr create --title x --body y');
  ask('gh pr merge 12');
  ask('gh api repos/o/r/issues -f title=x');
  ask('gh api -X DELETE repos/o/r');
  ask('gh auth token');
  ask('security find-generic-password -s x -w');
  quiet('curl -s http://localhost:3100/no');
  quiet('curl -sI https://fairplayr.vercel.app/');
  quiet('gh pr view 12');
  quiet('gh pr list');
  quiet('gh api repos/o/r/pulls');
  quiet('gh run list');
});

test('hook protocol: emits ask JSON or stays silent', () => {
  const script = path.join(__dirname, 'fp-guard.mjs');
  const run = (command) => spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: fixture }),
    encoding: 'utf8',
  });
  const risky = run('git -C . push');
  assert.equal(risky.status, 0);
  const out = JSON.parse(risky.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /git push/);

  const safe = run('git status');
  assert.equal(safe.status, 0);
  assert.equal(safe.stdout, '');

  const garbage = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, '');
});

test('hook runs when reached through a symlinked path', () => {
  const link = path.join(fixture, 'linked-hooks');
  fs.symlinkSync(__dirname, link);
  const res = spawnSync(process.execPath, [path.join(link, 'fp-guard.mjs')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: fixture }),
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('here-strings, runtime-built command names and stored aliases ask', () => {
  ask('bash <<< "git push"');
  ask("sh <<< 'git reset --hard'");
  ask('python3 <<< "import shutil; shutil.rmtree(\'build\')"');
  ask('g=git; $g push');
  ask('git ${x:-push}');
  ask('cmd=push; git $cmd');
  ask('$(echo git) push');
  ask('`echo git` push');
  ask("git config alias.p '!git reset --hard'");
  ask('git config --local core.sshCommand "ssh -i k"');
  ask('git commit-tree HEAD^{tree} -m x');
  ask('git bisect run ./test.sh');
  ask('git submodule foreach "git push"');
  ask('gh api repos/o/r/pulls -XPOST');
  ask('gh api repos/o/r/issues -ftitle=x');
  quiet('cat <<< "hello"');
  quiet('git config --get alias.p');
  quiet('git config user.name');
  quiet('git config --list');
  quiet('git bisect start');
  quiet('git submodule status');
});

test('tampering with the safety layers asks', () => {
  ask('chmod -x .git/hooks/pre-push');
  ask('mv .git/hooks/pre-commit /tmp/x');
  ask("echo 'exit 0' > .git/hooks/pre-push");
  ask("sed -i '' 's/exit 1/exit 0/' .git/hooks/pre-commit");
  ask('echo x > .claude/hooks/fp-guard.mjs');
  ask('cp /tmp/s.json .claude/settings.json');
  ask('tee -a .git/config < /tmp/c');
  ask('unset CLAUDECODE; git status');
  ask('env -u CLAUDECODE git status');
  ask('CLAUDECODE= git status');
  ask('env -i PATH=/usr/bin git status');
  quiet('sh .claude/hooks/install-git-guard.sh --check');
  quiet('cat .claude/hooks/fp-guard.mjs');
  quiet('ls -la .git/hooks');
  quiet('node --test .claude/hooks/fp-guard.node-test.mjs');
  quiet('echo "${CLAUDECODE:-unset}"');
});

test('env and key files ask from Bash; .env.example stays quiet', () => {
  ask('cat .env.local');
  ask('source .env');
  ask('grep KEY .env.production');
  ask('head -3 ios/App/.env');
  ask('cp .env.local /tmp/x');
  ask('cat .env.*');
  ask('less supabase/.temp/project-ref');
  ask('openssl x509 -in cert.pem');
  ask('node -p 1 < .env.local');
  ask('echo SECRET=1 >> .env.local');
  quiet('cat .env.example');
  quiet('head -20 .env.example');
  quiet('ls -a .env*');
  quiet('cat src/lib/env.ts');
  quiet('grep -rn NEXT_PUBLIC src');
});

test('rm only counts literal temp paths as temp', () => {
  ask('rm -rf ~', '/tmp');
  ask('rm -rf $HOME/x', '/tmp');
  ask('rm -rf *', '/tmp');
  ask('rm -rf "$(pwd)"', '/tmp');
  quiet('rm -rf /tmp/fp-x');
  quiet('rm -f ./scratch.txt', '/tmp');
});

test('everyday development commands stay quiet', () => {
  quiet('git status --short');
  quiet('git diff --stat');
  quiet('git log --oneline -5');
  quiet('git add src/x.ts');
  quiet('git fetch origin');
  quiet('git switch -c sec-03 origin/main');
  quiet('git checkout -b feature');
  quiet('git stash push -u -m tag');
  quiet('git restore --staged src/x.ts');
  quiet('git pull --ff-only');
  quiet('npm run test');
  quiet('npm run typecheck && npm run lint');
  quiet('npx vitest run src/domain/x.test.ts');
  quiet('npx playwright test e2e/live.spec.ts --project=375x667');
  quiet('npm run roadmap:render && npm run roadmap:check');
  quiet('node --version');
  quiet('grep -rn "useLiveSubstitution" src | head');
});

test('core.hooksPath: writes ask, reads stay quiet', () => {
  ask('git config core.hooksPath /dev/null');
  ask('git config --unset core.hooksPath');
  ask('git -c core.hooksPath=/dev/null commit -m x');
  quiet('git config --get core.hooksPath');
  quiet('git config core.hooksPath');
});
