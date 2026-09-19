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


test('popup oferece campo somente leitura com rótulo e estilos locais', () => {
  const popup = readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.match(popup, /<html lang="pt-BR">/);
  assert.match(popup, /<label for="texto">Texto do artigo<\/label>/);
  assert.match(popup, /<textarea[^>]*id="texto"[^>]*readonly/);
  assert.match(popup, /aria-describedby="orientacao"/);
  assert.match(popup, /id="orientacao"/);
  assert.match(popup, /href="popup.css"/);
  assert.ok(existsSync(path.join(root, 'popup.css')));
});

test('scripts de voz estão conectados ao manifesto e aos controles do popup', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.content_scripts[0].js.includes('leitura.js'));
  const popup = readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.match(popup, /src="controles\.js"/);
  assert.ok(existsSync(path.join(root, 'controles.js')));
  for (const id of ['ouvir', 'pausar', 'continuar', 'parar']) {
    assert.match(popup, new RegExp(`<button id="${id}" disabled>`));
  }
  assert.match(popup, /id="estado-leitura" role="status"/);
});

test('seletores de voz e velocidade e progresso têm rótulos acessíveis', () => {
  const popup = readFileSync(path.join(root, 'popup.html'), 'utf8');
  for (const id of ['voz', 'velocidade']) {
    assert.match(popup, new RegExp(`<label for="${id}">`));
    assert.match(popup, new RegExp(`<select id="${id}"`));
  }
  assert.match(popup, /for="progresso"/);
  assert.match(popup, /<progress id="progresso"/);
});

test('exportação declara armazenamento de sessão e acesso somente ao backend local', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
  const popup = readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.match(popup, /src="abrir-exportacao.js"/);
  const pagina = readFileSync(path.join(root, 'exportar.html'), 'utf8');
  assert.match(pagina, /src="exportar.js"/);
  assert.match(pagina, /id="consentimento" type="checkbox"/);
  assert.match(pagina, /id="token" type="password"/);
  assert.match(pagina, /Google Cloud Text-to-Speech/);
  assert.ok(existsSync(path.join(root, 'exportar.css')));
});
