const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../content.js'), 'utf8');

function carregar({ titulo = 'Título', article = null, main = null, body = { innerText: 'Corpo' } } = {}) {
  let listener;
  const elementos = { article, main };
  const document = { title: titulo, body, querySelector: (seletor) => elementos[seletor] };
  runInNewContext(source, {
    document,
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } }
  });
  return { document, elementos, enviar(mensagem = { acao: 'pegar_artigo' }) {
    const respostas = [];
    listener(mensagem, {}, (valor) => respostas.push(JSON.parse(JSON.stringify(valor))));
    return respostas;
  } };
}

for (const [nome, elementos, esperado] of [
  ['prioriza article sobre main e body', { article: { innerText: ' Artigo ' }, main: { innerText: 'Principal' } }, 'Artigo'],
  ['usa main quando não há article', { main: { innerText: '\nPrincipal\t' } }, 'Principal'],
  ['usa body quando não há article nem main', {}, 'Corpo'],
  ['preserva espaços internos, parágrafos e acentos', { article: { innerText: ' \nOlá  mundo\n\nAção!\t ' } }, 'Olá  mundo\n\nAção!'],
  ['não troca article vazio por main ou body', { article: { innerText: ' \n\t ' }, main: { innerText: 'Menu' } }, ''],
  ['não troca main vazio por body', { main: { innerText: '' } }, ''],
  ['trata corpo vazio', { body: { innerText: '' } }, ''],
  ['trata ausência de corpo', { body: null }, ''],
  ['trata elemento sem innerText', { article: {} }, ''],
  ['retorna texto longo sem truncar', { article: { innerText: 'ação\n'.repeat(20000) } }, 'ação\n'.repeat(20000).trim()]
]) {
  test(nome, () => {
    assert.deepEqual(carregar(elementos).enviar(), [{ titulo: 'Título', texto: esperado }]);
  });
}

test('consulta título e conteúdo atuais em cada solicitação', () => {
  const pagina = carregar();
  assert.deepEqual(pagina.enviar(), [{ titulo: 'Título', texto: 'Corpo' }]);
  pagina.document.title = 'Depois';
  pagina.elementos.article = { innerText: 'Novo artigo' };
  assert.deepEqual(pagina.enviar(), [{ titulo: 'Depois', texto: 'Novo artigo' }]);
});

test('preserva título vazio com texto disponível', () => {
  assert.deepEqual(carregar({ titulo: '' }).enviar(), [{ titulo: '', texto: 'Corpo' }]);
});

for (const mensagem of [null, {}, { acao: 'outra_acao' }, { acao: 'pegar_titulo' }]) {
  test(`ignora mensagem não reconhecida: ${JSON.stringify(mensagem)}`, () => {
    assert.deepEqual(carregar().enviar(mensagem), []);
  });
}

for (const etapa of ['seleção', 'leitura']) {
  test(`responde explicitamente ao erro de ${etapa} e permite nova tentativa`, () => {
    const pagina = carregar();
    if (etapa === 'seleção') {
      pagina.document.querySelector = () => { throw new Error('Falha simulada'); };
    } else {
      pagina.document.body = { get innerText() { throw new Error('Falha simulada'); } };
    }
    assert.deepEqual(pagina.enviar(), [{ erro: 'Não foi possível extrair o texto desta página.' }]);
    pagina.document.querySelector = () => null;
    pagina.document.body = { innerText: 'Recuperado' };
    assert.deepEqual(pagina.enviar(), [{ titulo: 'Título', texto: 'Recuperado' }]);
  });
}
