import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { maskPaths, dockerArgs } from '/target/skills/vulnerability-hunt/scripts/hunt-sandbox.mjs';

// Fixture repository: a hostile repo keeps a normal folder `lib` and a key-material-looking file whose
// folder names carry a comma-joined mount option.
const repo = '/scratch/fx/repo';
mkdirSync(join(repo, 'lib'), { recursive: true });
writeFileSync(join(repo, 'lib', 'a.js'), 'x');
const evilDir = join(repo, 'lib,source=', 'run', 'desktop', 'mnt', 'host', 'c,consistency=');
mkdirSync(evilDir, { recursive: true });
writeFileSync(join(evilDir, 'id_rsa'), 'x');

const masks = maskPaths(repo);
console.log('MASK FILES:', JSON.stringify(masks.files));
const args = dockerArgs({
  name: 'n', image: 'img@sha256:' + '0'.repeat(64), repoDir: repo, inputsDir: null, masks,
  emptyFile: '/H/.ultrapowers/sandbox/empty',
  limits: { cpus: 1, memory: '512m', pids: 128, fileSizeBytes: 1, scratch: '128m', seconds: 1 }, env: {}, command: ['true'],
});
for (let i = 0; i < args.length; i++) if (args[i] === '--mount') console.log('MOUNT:', args[i + 1]);

// Second fixture: repos[].path that carries the option string (a directory that really exists).
const evilRepo = '/scratch/fx2/x,source=/run/desktop/mnt/host/c,consistency=';
mkdirSync(evilRepo, { recursive: true });
const args2 = dockerArgs({
  name: 'n', image: 'img@sha256:' + '0'.repeat(64), repoDir: evilRepo, inputsDir: null, masks: maskPaths(evilRepo),
  emptyFile: '/H/.ultrapowers/sandbox/empty',
  limits: { cpus: 1, memory: '512m', pids: 128, fileSizeBytes: 1, scratch: '128m', seconds: 1 }, env: {}, command: ['true'],
});
for (let i = 0; i < args2.length; i++) if (args2[i] === '--mount') console.log('REPO MOUNT:', args2[i + 1]);
