import { mkdirSync, writeFileSync } from 'node:fs';
const { analyze } = await import('/target/hooks/lib/qa-shell-writes.mjs');
const root = '/scratch/proj';
mkdirSync(`${root}/reviews/audit-x`, { recursive: true });
mkdirSync(`${root}/.ultrapowers`, { recursive: true });
mkdirSync(`${root}/.agents`, { recursive: true });
writeFileSync(`${root}/.agents/ultrapowers.json`, '{}');
const cmds = [
  "git -c alias.zz='!id' zz",
  "git status -c alias.zz='!id' zz",
  "git --attr-source status -c alias.zz='!id' zz",
  "git --attr-source status commit --allow-empty -m x",
  "git --attr-source status config core.pager 'id'",
  "git --attr-source status fetch https://example.invalid/x.git",
  "git --attr-source log -c core.fsmonitor=id status",
  "git --attr-source=HEAD status",
  "git --attr-source HEAD status",
];
for (const profile of ['hunt', 'qa']) {
  for (const c of cmds) {
    let out;
    try { out = analyze(c, { cwd: root, root, ticket: 'audit-x', profile, ignoreCase: false }); } catch (e) { out = 'THROW ' + e.message; }
    console.log(`[${profile}] ${out === '' ? 'ALLOW' : 'DENY '} :: ${c}${out ? '\n        -> ' + String(out).slice(0, 110) : ''}`);
  }
}
