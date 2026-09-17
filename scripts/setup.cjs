const { execFileSync } = require('node:child_process');
const { chmodSync } = require('node:fs');
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'pipe' });
  const hooks = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  if (hooks && hooks !== '.githooks') throw new Error(`Já existem hooks configurados em ${hooks}. Preserve-os e integre a verificação manualmente.`);
} catch (erro) {
  // git config retorna 1 quando a chave ainda não existe.
  if (erro.status !== 1) { console.error(erro.message); process.exit(1); }
}
for (const hook of ['pre-commit', 'pre-push']) chmodSync(path.join('.githooks', hook), 0o755);
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('Hooks locais ativados: testes antes de commit e push.');
