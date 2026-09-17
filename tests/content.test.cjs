const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../content.js'), 'utf8');

function carregar(titulo) {
  let listener;
  const document = { title: titulo };
  runInNewContext(source, {
    document,
    console: { log() {} },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } }
  });
  return { document, enviar: (mensagem, responder) => listener(mensagem, {}, responder) };
}

test('retorna o título solicitado', () => {
  const pagina = carregar('Artigo de exemplo');
  let resposta;
  pagina.enviar({ acao: 'pegar_titulo' }, (valor) => { resposta = valor; });
  assert.equal(resposta.titulo, 'Artigo de exemplo');
});

test('consulta o título atual mesmo quando a página muda', () => {
  const pagina = carregar('Antes');
  pagina.document.title = 'Depois';
  pagina.enviar({ acao: 'pegar_titulo' }, (resposta) => {
    assert.equal(resposta.titulo, 'Depois');
  });
});

test('retorna título vazio para o popup tratar', () => {
  const pagina = carregar('');
  pagina.enviar({ acao: 'pegar_titulo' }, (resposta) => {
    assert.equal(resposta.titulo, '');
  });
});

test('ignora ações desconhecidas sem responder', () => {
  carregar('Título').enviar({ acao: 'outra_acao' }, () => {
    assert.fail('Não deveria responder a outra ação');
  });
});
