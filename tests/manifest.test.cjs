const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('manifesto referencia arquivos existentes e a versão do projeto', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  for (const arquivo of [manifest.action.default_popup, ...manifest.content_scripts.flatMap((item) => item.js)]) {
    assert.ok(existsSync(path.join(root, arquivo)), `Arquivo ausente: ${arquivo}`);
  }
  const popup = readFileSync(path.join(root, manifest.action.default_popup), 'utf8');
  assert.match(popup, /id="ler"/);
  assert.match(popup, /id="status"/);
  assert.match(popup, /src="popup\.js"/);
});
