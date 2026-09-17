const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../popup.js'), 'utf8');

function carregar({ query = async () => [{ id: 42 }], sendMessage = async () => ({ titulo: 'Artigo' }) } = {}) {
  let clicar;
  const status = { textContent: '' };
  const erros = [];
  runInNewContext(source, {
    document: { getElementById(id) {
      if (id === 'status') return status;
      if (id === 'ler') return { addEventListener(evento, fn) {
        assert.equal(evento, 'click');
        clicar = fn;
      } };
      throw new Error(`Elemento inesperado: ${id}`);
    } },
    chrome: { tabs: { query, sendMessage } },
    console: { error(...args) { erros.push(args); } }
  });
  return { clicar: () => clicar(), status, erros };
}

test('consulta a aba ativa da janela atual e mostra seu título', async () => {
  const popup = carregar({
    query: async (filtro) => {
      assert.equal(filtro.active, true);
      assert.equal(filtro.currentWindow, true);
      return [{ id: 17 }];
    },
    sendMessage: async (id, mensagem) => {
      assert.equal(id, 17);
      assert.equal(mensagem.acao, 'pegar_titulo');
      return { titulo: 'Meu artigo' };
    }
  });
  await popup.clicar();
  assert.equal(popup.status.textContent, 'Meu artigo');
  assert.equal(popup.erros.length, 0);
});

test('mostra carregamento enquanto aguarda a aba', async () => {
  let resolver;
  const popup = carregar({ query: () => new Promise((resolve) => { resolver = resolve; }) });
  const leitura = popup.clicar();
  assert.equal(popup.status.textContent, 'Buscando título…');
  resolver([{ id: 42 }]);
  await leitura;
  assert.equal(popup.status.textContent, 'Artigo');
});

for (const abas of [[], [{}]]) {
  test(`trata aba ausente ou sem identificador: ${JSON.stringify(abas)}`, async () => {
    const popup = carregar({
      query: async () => abas,
      sendMessage: () => assert.fail('Não deve enviar sem aba válida')
    });
    await popup.clicar();
    assert.equal(popup.status.textContent, 'Nenhuma aba ativa encontrada.');
  });
}

for (const resposta of [{ titulo: '' }, {}, undefined]) {
  test(`trata resposta sem título: ${JSON.stringify(resposta)}`, async () => {
    const popup = carregar({ sendMessage: async () => resposta });
    await popup.clicar();
    assert.equal(popup.status.textContent, 'A página não tem título.');
  });
}

for (const etapa of ['query', 'sendMessage']) {
  test(`trata falha em ${etapa} sem rejeição não capturada`, async () => {
    const popup = carregar({ [etapa]: async () => { throw new Error('Falha simulada'); } });
    await popup.clicar();
    assert.match(popup.status.textContent, /Não foi possível acessar esta página/);
    assert.equal(popup.erros.length, 1);
  });
}

test('uma nova tentativa pode se recuperar de um erro', async () => {
  let tentativas = 0;
  const popup = carregar({ sendMessage: async () => {
    if (++tentativas === 1) throw new Error('Página não carregada');
    return { titulo: 'Recuperado' };
  } });
  await popup.clicar();
  await popup.clicar();
  assert.equal(popup.status.textContent, 'Recuperado');
});
