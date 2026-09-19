const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const id = '12345678-1234-1234-1234-123456789abc', chave = `exportacao:${id}`;
const token = 'a'.repeat(64);
const tick = () => new Promise(resolve => setImmediate(resolve));
function montar({ script = 'exportar.js', iniciado = false, fetchImpl, falharStorage = false, semRegistro = false } = {}) {
  const elementos = {}, eventos = {}, chamadas = [], timers = new Map(); let timerId = 0;
  const storage = { tokenExportacao: token, ...(semRegistro ? {} : { [chave]: { texto: '<artigo>ação 😀</artigo>', iniciado, criado: Date.now() } }) };
  function elemento(nome) { return elementos[nome] ||= { value: '', disabled: false, checked: false, textContent: '', addEventListener(evento, fn) { this[evento] = fn; } }; }
  const contexto = {
    document: { getElementById: elemento, createElement: () => ({ click() { chamadas.push('download'); } }) },
    window: { addEventListener: (evento, fn) => { eventos[evento] = fn; } }, location: { hash: '#' + id },
    crypto: { randomUUID: () => id }, TextEncoder, AbortController, AbortSignal, Date,
    URL: { createObjectURL: () => 'blob:teste', revokeObjectURL: () => {} },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: n => timers.delete(n),
    fetch: async (...args) => { chamadas.push(args); return fetchImpl ? fetchImpl(...args) : new Response(JSON.stringify({ estado: 'concluido', progresso: { concluidos: 1, total: 1 } })); },
    chrome: { runtime: { getURL: p => 'chrome-extension://teste/' + p }, tabs: { create: async dados => chamadas.push(dados) }, storage: { session: {
      get: async () => { if (falharStorage) throw new Error('storage'); return storage; },
      set: async dados => { Object.assign(storage, dados); }, remove: async nomes => { for (const nome of [].concat(nomes)) delete storage[nome]; }
    } } }
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), contexto);
  return { elemento, storage, chamadas, eventos, timers };
}
test('abrir exportação exige texto e não envia nada à rede', async () => {
  const m = montar({ script: 'abrir-exportacao.js', semRegistro: true });
  await m.elemento('abrir-exportacao').click(); assert.equal(m.chamadas.length, 0);
  m.elemento('texto').value = 'Texto capturado';
  await m.elemento('abrir-exportacao').click();
  assert.equal(m.storage[chave].texto, 'Texto capturado');
  assert.equal(m.chamadas[0].url, `chrome-extension://teste/exportar.html#${id}`);
});
test('abrir exportação rejeita texto longo e falha de armazenamento', async () => {
  const m = montar({ script: 'abrir-exportacao.js' }); m.elemento('texto').value = 'é'.repeat(100001);
  await m.elemento('abrir-exportacao').click(); assert.equal(m.chamadas.length, 0);
  const erro = montar({ script: 'abrir-exportacao.js', falharStorage: true }); erro.elemento('texto').value = 'abc';
  await erro.elemento('abrir-exportacao').click(); assert.match(erro.elemento('aviso-exportacao').textContent, /Não foi possível/);
  assert.equal(erro.elemento('abrir-exportacao').disabled, false);
});
test('abrir exportação limita snapshots e remove antigos', async () => {
  const m = montar({ script: 'abrir-exportacao.js' }); m.elemento('texto').value = 'abc';
  for (let i = 0; i < 3; i++) m.storage['exportacao:' + i] = { criado: Date.now() };
  await m.elemento('abrir-exportacao').click(); assert.equal(m.chamadas.length, 0);
  m.storage['exportacao:0'].criado = 0;
  await m.elemento('abrir-exportacao').click(); assert.equal(m.chamadas.length, 1);
});
test('início mostra texto literal e exige consentimento; gera uma vez e permite download', async () => {
  const m = montar(); await tick();
  assert.equal(m.elemento('artigo').value, '<artigo>ação 😀</artigo>');
  assert.equal(m.elemento('gerar').disabled, true); assert.equal(m.chamadas.length, 0);
  await m.elemento('gerar').click(); assert.equal(m.chamadas.length, 0);
  m.elemento('consentimento').checked = true; m.elemento('consentimento').change();
  await m.elemento('gerar').click();
  assert.equal(m.storage[chave].iniciado, true);
  assert.equal(m.chamadas[0][1].method, 'POST');
  assert.equal(JSON.parse(m.chamadas[0][1].body).texto, '<artigo>ação 😀</artigo>');
  assert.equal(m.elemento('baixar').disabled, false);
  await m.elemento('gerar').click(); assert.equal(m.chamadas.length, 1);
  m.elemento('consentimento').change(); assert.equal(m.elemento('baixar').disabled, false);
});
test('recuperar página consulta sem gerar novamente', async () => {
  const m = montar({ iniciado: true }); await tick();
  assert.equal(m.chamadas.length, 1); assert.equal(m.chamadas[0][1].method, undefined);
  assert.equal(m.elemento('baixar').disabled, false);
});
test('bloqueia token inválido sem enviar texto', async () => {
  const m = montar(); await tick(); m.elemento('consentimento').checked = true; m.elemento('token').value = '';
  await m.elemento('gerar').click(); assert.equal(m.chamadas.length, 0);
});
test('recuperação trata backend offline sem repetir POST', async () => {
  const m = montar({ iniciado: true, fetchImpl: async () => { throw new Error('offline'); } }); await tick();
  assert.match(m.elemento('status-exportacao').textContent, /nenhum novo pedido/);
  assert.equal(m.elemento('baixar').disabled, true);
  assert.equal(m.timers.size, 1);
});
test('resposta inválida não habilita download', async () => {
  const m = montar({ iniciado: true, fetchImpl: async () => new Response('{"estado":"concluido"}') }); await tick();
  assert.equal(m.elemento('baixar').disabled, true);
  assert.match(m.elemento('status-exportacao').textContent, /Resposta inválida/);
});
test('cancelar ignora consulta anterior que chega atrasada', async () => {
  let liberar;
  const m = montar({ iniciado: true, fetchImpl: async (_, opcoes) => {
    if (opcoes.method === 'DELETE') return new Response(JSON.stringify({ estado: 'cancelado', progresso: { total: 1, concluidos: 0 } }));
    return new Promise(resolve => { liberar = () => resolve(new Response(JSON.stringify({ estado: 'concluido', progresso: { total: 1, concluidos: 1 } }))); });
  } }); await tick();
  await m.elemento('cancelar').click(); liberar(); await tick();
  assert.match(m.elemento('status-exportacao').textContent, /cancelada/);
  assert.equal(m.elemento('baixar').disabled, true);
});
test('baixar valida MIME e libera botão após erro', async () => {
  const m = montar({ iniciado: true, fetchImpl: async url => url.endsWith('/audio') ? new Response('erro') : new Response(JSON.stringify({ estado: 'concluido', progresso: { total: 1, concluidos: 1 } })) });
  await tick(); await m.elemento('baixar').click();
  assert.match(m.elemento('status-exportacao').textContent, /Arquivo de áudio inválido/);
  assert.equal(m.elemento('baixar').disabled, false);
});
test('download válido cria link com nome WAV', async () => {
  const m = montar({ iniciado: true, fetchImpl: async url => url.endsWith('/audio') ? new Response(new Uint8Array(48), { headers: { 'Content-Type': 'audio/wav' } }) : new Response(JSON.stringify({ estado: 'concluido', progresso: { total: 1, concluidos: 1 } })) });
  await tick(); await m.elemento('baixar').click(); assert.ok(m.chamadas.includes('download'));
});
test('limpar remove texto e token mesmo com backend indisponível', async () => {
  const m = montar({ iniciado: true, fetchImpl: async () => { throw new Error(); } }); await tick();
  await m.elemento('limpar').click();
  assert.equal(m.storage[chave], undefined); assert.equal(m.storage.tokenExportacao, undefined);
  assert.equal(m.elemento('artigo').value, ''); assert.match(m.elemento('status-exportacao').textContent, /Dados locais removidos/);
});
test('página sem snapshot mostra orientação e fechamento aborta consulta', async () => {
  const vazio = montar({ semRegistro: true }); await tick(); assert.match(vazio.elemento('status-exportacao').textContent, /Texto indisponível/);
  let sinal;
  const m = montar({ iniciado: true, fetchImpl: async (_, opcoes) => { sinal = opcoes.signal; return new Promise(() => {}); } }); await tick();
  m.eventos.pagehide(); assert.equal(sinal.aborted, true);
});
