const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { criarServidor } = require('../backend/servidor.cjs');
const { criarGoogle, extrairPcm } = require('../backend/google.cjs');
const { exportarWav } = require('../backend/exportacao.cjs');
const token = 'a'.repeat(64), extensao = 'a'.repeat(32);
const audio = () => ({ pcm: Buffer.from([1, 0, 2, 0]), canais: 1, taxa: 24000, codificacao: 'pcm_s16le' });
async function wav() { return (await exportarWav({ texto: 'Teste', sintetizar: async () => audio() })).arquivo; }
async function ambiente(t, opcoes = {}) {
  const servidor = criarServidor({ token, extensao, sintetizar: async () => audio(), ...opcoes });
  await new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { servidor.close(resolve); servidor.closeAllConnections(); }));
  return async (id, method = 'GET', dados, headers = {}) => fetch(`http://127.0.0.1:${servidor.address().port}/jobs/${id}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: dados === undefined ? undefined : JSON.stringify(dados)
  });
}
async function aguardar(api, id) {
  for (let i = 0; i < 50; i++) {
    const estado = await (await api(id)).json();
    if (estado.estado !== 'gerando') return estado;
    await new Promise(r => setTimeout(r, 5));
  }
  assert.fail('Geração não terminou');
}
test('Google envia texto simples, voz fixa e credencial apenas no cabeçalho; extrai WAV', async () => {
  const arquivo = await wav();
  const sintetizar = criarGoogle({ accessToken: 'teste', projeto: 'projeto-teste', fetchImpl: async (url, opcoes) => {
    assert.equal(url, 'https://texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(opcoes.headers.Authorization, 'Bearer teste');
    assert.equal(opcoes.headers['x-goog-user-project'], 'projeto-teste');
    const corpo = JSON.parse(opcoes.body);
    assert.deepEqual(corpo.input, { text: '<b>ação & 😀</b>' });
    assert.equal(corpo.voice.name, 'pt-BR-Standard-A');
    assert.equal(corpo.audioConfig.audioEncoding, 'LINEAR16');
    assert.equal(opcoes.redirect, 'error');
    return new Response(JSON.stringify({ audioContent: arquivo.toString('base64') }));
  } });
  assert.deepEqual(await sintetizar({ texto: '<b>ação & 😀</b>' }), audio());
});
test('WAV aceita metadados e padding sem incluir metadados nas amostras', async () => {
  const original = await wav();
  const extra = Buffer.from([74, 85, 78, 75, 1, 0, 0, 0, 65, 0]);
  const arquivo = Buffer.concat([original.subarray(0, 12), extra, original.subarray(12)]);
  arquivo.writeUInt32LE(arquivo.length - 8, 4);
  assert.deepEqual(extrairPcm(arquivo), audio());
});
test('rejeita WAV truncado, comprimido, estéreo, taxa incorreta e sem dados', async () => {
  const original = await wav();
  for (const alterar of [b => b.subarray(0, 40), b => { b.writeUInt16LE(3, 20); return b; }, b => { b.writeUInt16LE(2, 22); return b; }, b => { b.writeUInt32LE(44100, 24); return b; }, b => { b.write('JUNK', 36); return b; }]) {
    assert.throws(() => extrairPcm(alterar(Buffer.from(original))), /WAV inválido/);
  }
});
test('Google não propaga erro remoto com segredo e rejeita base64/JSON inválido', async () => {
  for (const [status, corpo] of [[403, 'segredo'], [200, '{'], [200, '{}'], [200, '{"audioContent":"!!!="}']]) {
    const sintetizar = criarGoogle({ accessToken: 'teste', projeto: 'teste', fetchImpl: async () => new Response(corpo, { status }) });
    await assert.rejects(sintetizar({ texto: 'abc' }), erro => !erro.message.includes('segredo'));
  }
  assert.throws(() => criarGoogle({}), /Configure/);
});
test('Google recebe sinal cancelado e timeout', async () => {
  const controle = new AbortController(); controle.abort();
  const sintetizar = criarGoogle({ accessToken: 'teste', projeto: 'teste', fetchImpl: async (_, opcoes) => { opcoes.signal.throwIfAborted(); } });
  await assert.rejects(sintetizar({ texto: 'abc', signal: controle.signal }), { name: 'AbortError' });
  const lento = criarGoogle({ accessToken: 'teste', projeto: 'teste', timeout: 5, fetchImpl: async (_, opcoes) => {
    await new Promise(resolve => setTimeout(resolve, 15)); opcoes.signal.throwIfAborted();
  } });
  await assert.rejects(lento({ texto: 'abc' }), { name: 'TimeoutError' });
});
test('API gera, recupera progresso, baixa WAV e não duplica pedido', async t => {
  let chamadas = 0;
  const api = await ambiente(t, { sintetizar: async () => { chamadas++; return audio(); } });
  const id = randomUUID();
  assert.equal((await api(id, 'POST', { texto: 'Olá' })).status, 202);
  assert.equal((await aguardar(api, id)).estado, 'concluido');
  assert.equal((await api(id, 'POST', { texto: 'Outro' })).status, 200);
  const resposta = await api(id + '/audio');
  assert.equal(resposta.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(extrairPcm(Buffer.from(await resposta.arrayBuffer())), audio());
  assert.equal(chamadas, 1);
  assert.equal((await api(id, 'DELETE')).status, 200);
  assert.equal((await api(id + '/audio')).status, 409);
});
test('API rejeita acesso sem token, origem externa, método, conteúdo e ID inválidos', async t => {
  const api = await ambiente(t); const id = randomUUID();
  assert.equal((await api(id, 'GET', undefined, { Authorization: '' })).status, 401);
  assert.equal((await api(id, 'GET', undefined, { Origin: 'https://site.example' })).status, 403);
  const preflight = await api(id, 'OPTIONS', undefined, { Origin: `chrome-extension://${extensao}`, Authorization: '' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), `chrome-extension://${extensao}`);
  assert.equal((await api(id, 'PUT')).status, 405);
  assert.equal((await api(id, 'POST', { texto: '' })).status, 400);
  assert.equal((await api(id, 'POST', { texto: 'ok' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await api('x')).status, 404);
  assert.equal((await api(id)).status, 404);
});
test('API limita concorrência e cancela trabalho sem entregar áudio atrasado', async t => {
  let liberar;
  const api = await ambiente(t, { sintetizar: async () => new Promise(resolve => { liberar = () => resolve(audio()); }) });
  const id = randomUUID();
  await api(id, 'POST', { texto: 'abc' });
  assert.equal((await api(randomUUID(), 'POST', { texto: 'outro' })).status, 429);
  assert.equal((await api(id + '/audio')).status, 409);
  assert.equal((await (await api(id, 'DELETE')).json()).estado, 'cancelado');
  liberar();
  assert.equal((await aguardar(api, id)).estado, 'cancelado');
  assert.equal((await api(id + '/audio')).status, 409);
});
test('API expira resultado e aplica orçamento por hora', async t => {
  let tempo = 0;
  const api = await ambiente(t, { agora: () => tempo, retencao: 1000, orcamento: 3 });
  const id = randomUUID();
  await api(id, 'POST', { texto: 'abc' }); await aguardar(api, id);
  assert.equal((await api(randomUUID(), 'POST', { texto: 'a' })).status, 429);
  tempo = 2000;
  assert.equal((await api(id)).status, 404);
  tempo = 3600001;
  assert.equal((await api(randomUUID(), 'POST', { texto: 'abc' })).status, 202);
});
test('API oculta erro do provedor, limita registros e valida configuração', async t => {
  const api = await ambiente(t, { sintetizar: async () => { throw new Error('segredo'); } });
  for (let i = 0; i < 4; i++) {
    const id = randomUUID(); await api(id, 'POST', { texto: 'abc' });
    const estado = await aguardar(api, id);
    assert.equal(estado.estado, 'erro'); assert.ok(!JSON.stringify(estado).includes('segredo'));
  }
  assert.equal((await api(randomUUID(), 'POST', { texto: 'abc' })).status, 429);
  assert.throws(() => criarServidor({ token: 'curto', extensao, sintetizar: () => {} }), /Configure/);
});
test('API encerra trabalho no prazo e rejeita corpos acima do limite', async t => {
  const api = await ambiente(t, { prazo: 5, sintetizar: async ({ signal }) => {
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const id = randomUUID(); await api(id, 'POST', { texto: 'abc' });
  assert.equal((await aguardar(api, id)).estado, 'cancelado');
  assert.equal((await api(randomUUID(), 'POST', { texto: 'x'.repeat(1300001) })).status, 413);
});
