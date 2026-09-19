const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../controles.js'), 'utf8');
const aguardar = () => new Promise((resolve) => setImmediate(resolve));

function carregar({ query = async () => [{ id: 42 }], sendMessage = async () => ({ estado: 'parado', erro: '' }) } = {}) {
  const elementos = {};
  let atualizar, sair, limpo = false;
  for (const id of ['ouvir', 'pausar', 'continuar', 'parar', 'estado-leitura', 'texto', 'voz', 'velocidade', 'aviso-voz', 'progresso', 'texto-progresso']) {
    elementos[id] = { disabled: true, value: '', textContent: '', addEventListener(evento, fn) { this.clicar = fn; }, replaceChildren(...filhos) { this.filhos = filhos; } };
  }
  runInNewContext(source, {
    document: { getElementById(id) { assert.ok(elementos[id]); return elementos[id]; }, createElement(tag) { assert.equal(tag, 'option'); return {}; } },
    chrome: { tabs: { query, sendMessage } },
    setInterval(fn) { atualizar = fn; return 77; },
    clearInterval(id) { assert.equal(id, 77); limpo = true; },
    window: { addEventListener(evento, fn) { assert.equal(evento, 'pagehide'); sair = fn; } }
  });
  return { elementos, atualizar: () => atualizar(), sair: () => sair(), limpo: () => limpo };
}

test('abrir popup consulta estado, sem iniciar voz; ouvir envia o texto após clique', async () => {
  const mensagens = [];
  const p = carregar({ sendMessage: async (id, mensagem) => {
    assert.equal(id, 42);
    mensagens.push(JSON.parse(JSON.stringify(mensagem)));
    return { estado: mensagem.comando === 'ouvir' ? 'preparando' : 'parado' };
  } });
  await aguardar();
  assert.deepEqual(mensagens, [{ acao: 'controlar_leitura', comando: 'estado' }]);
  p.elementos.texto.value = 'Texto conferido';
  await p.elementos.ouvir.clicar();
  assert.deepEqual(mensagens[1], { acao: 'controlar_leitura', comando: 'ouvir', texto: 'Texto conferido' });
  assert.equal(p.elementos.ouvir.disabled, true);
  assert.equal(p.elementos.parar.disabled, false);
});

for (const [estado, habilitados] of [
  ['parado', ['ouvir']], ['preparando', ['pausar', 'parar']],
  ['lendo', ['pausar', 'parar']], ['pausado', ['continuar', 'parar']],
  ['concluido', ['ouvir']], ['erro', ['ouvir']], ['indisponivel', []]
]) {
  test(`reabrir recupera ${estado} e habilita apenas controles aplicáveis`, async () => {
    const p = carregar({ sendMessage: async () => ({ estado }) });
    await aguardar();
    for (const id of ['ouvir', 'pausar', 'continuar', 'parar']) {
      assert.equal(p.elementos[id].disabled, !habilitados.includes(id), id);
    }
    assert.ok(p.elementos['estado-leitura'].textContent);
  });
}

test('pausar, continuar e parar enviam comandos e atualizam interface', async () => {
  const comandos = [];
  const p = carregar({ sendMessage: async (id, m) => {
    comandos.push(m.comando);
    return { estado: ({ estado: 'lendo', pausar: 'pausado', continuar: 'lendo', parar: 'parado' })[m.comando] };
  } });
  await aguardar();
  for (const c of ['pausar', 'continuar', 'parar']) await p.elementos[c].clicar();
  assert.deepEqual(comandos, ['estado', 'pausar', 'continuar', 'parar']);
  assert.equal(p.elementos.ouvir.disabled, false);
});

test('consulta periódica detecta fim sem retransmitir texto', async () => {
  let chamadas = 0;
  const p = carregar({ sendMessage: async (id, m) => {
    assert.equal(m.texto, undefined);
    return { estado: ++chamadas === 1 ? 'lendo' : 'concluido' };
  } });
  await aguardar();
  await p.atualizar();
  assert.equal(p.elementos['estado-leitura'].textContent, 'Leitura concluída.');
});

for (const [nome, opcoes] of [
  ['aba ausente', { query: async () => [] }],
  ['falha de consulta', { query: async () => { throw new Error(); } }],
  ['falha de comunicação', { sendMessage: async () => { throw new Error(); } }],
  ['resposta ausente', { sendMessage: async () => undefined }],
  ['estado inválido', { sendMessage: async () => ({ estado: 'outro' }) }],
  ['erro inválido', { sendMessage: async () => ({ estado: 'erro', erro: {} }) }]
]) {
  test(`erro compreensível para ${nome}`, async () => {
    const p = carregar(opcoes);
    await aguardar();
    assert.match(p.elementos['estado-leitura'].textContent, /Não foi possível acessar/);
    assert.equal(p.elementos.ouvir.disabled, true);
  });
}

test('exibe erro retornado pela síntese', async () => {
  const p = carregar({ sendMessage: async () => ({ estado: 'erro', erro: 'Clique na página.' }) });
  await aguardar();
  assert.equal(p.elementos['estado-leitura'].textContent, 'Clique na página.');
});

test('não sobrepõe comandos nem aplica respostas após fechar popup', async () => {
  let resolver;
  let chamadas = 0;
  const p = carregar({ sendMessage: async () => {
    chamadas++;
    return new Promise((resolve) => { resolver = resolve; });
  } });
  await aguardar();
  await p.atualizar();
  await p.elementos.ouvir.clicar();
  assert.equal(chamadas, 1);
  const anterior = p.elementos['estado-leitura'].textContent;
  p.sair();
  assert.equal(p.limpo(), true);
  resolver({ estado: 'lendo' });
  await aguardar();
  await p.atualizar();
  assert.equal(chamadas, 1);
  assert.equal(p.elementos['estado-leitura'].textContent, anterior);
});

test('integra controles com reprodução real do script e mantém estado entre popups', async () => {
  let receber;
  const falas = [];
  runInNewContext(readFileSync(path.join(__dirname, '../leitura.js'), 'utf8'), {
    document: { documentElement: { lang: 'pt-BR' } },
    window: { addEventListener() {} },
    chrome: { runtime: { onMessage: { addListener(fn) { receber = fn; } } } },
    speechSynthesis: { speak(fala) { falas.push(fala); }, pause() {}, resume() {}, cancel() {} },
    SpeechSynthesisUtterance: function(texto) { this.text = texto; }
  });
  const sendMessage = async (id, mensagem) => {
    let resposta;
    receber(mensagem, {}, (r) => { resposta = r; });
    assert.ok(resposta);
    return resposta;
  };
  const primeiro = carregar({ sendMessage });
  await aguardar();
  primeiro.elementos.texto.value = 'Artigo para ouvir';
  await primeiro.elementos.ouvir.clicar();
  falas[0].onstart();
  primeiro.sair();
  const segundo = carregar({ sendMessage });
  await aguardar();
  assert.equal(segundo.elementos['estado-leitura'].textContent, 'Lendo em voz alta.');
  await segundo.elementos.pausar.clicar();
  assert.equal(segundo.elementos['estado-leitura'].textContent, 'Leitura pausada.');
  await segundo.elementos.continuar.clicar();
  await segundo.elementos.parar.clicar();
  assert.equal(segundo.elementos.ouvir.disabled, false);
  assert.equal(falas.length, 1);
});

test('consulta periódica não desabilita controles durante resposta pendente', async () => {
  let chamadas = 0, resolver;
  const p = carregar({ sendMessage: async () => {
    if (++chamadas === 1) return { estado: 'lendo' };
    return new Promise((resolve) => { resolver = resolve; });
  } });
  await aguardar();
  const consulta = p.atualizar();
  assert.equal(p.elementos.pausar.disabled, false);
  resolver({ estado: 'lendo' });
  await consulta;
});

test('comando não é perdido durante consulta e resposta antiga não desfaz a pausa', async () => {
  let chamadas = 0, resolver;
  const p = carregar({ sendMessage: async (id, m) => {
    chamadas++;
    if (chamadas === 1) return { estado: 'lendo' };
    if (m.comando === 'estado') return new Promise((resolve) => { resolver = resolve; });
    assert.equal(m.comando, 'pausar');
    return { estado: 'pausado' };
  } });
  await aguardar();
  const consulta = p.atualizar();
  await p.elementos.pausar.clicar();
  assert.equal(p.elementos['estado-leitura'].textContent, 'Leitura pausada.');
  resolver({ estado: 'lendo' });
  await consulta;
  assert.equal(p.elementos['estado-leitura'].textContent, 'Leitura pausada.');
  assert.equal(chamadas, 3);
});

function estadoT4(alteracoes = {}) {
  return { estado: 'parado', vozes: [], configuracao: { voz: '', velocidade: 1 }, progresso: { concluidos: 0, total: 0 }, ...alteracoes };
}
const vozPt = { id: 'pt', nome: '<b>Voz</b>', idioma: 'pt-BR', local: true };

test('carrega vozes assíncronas com nomes literais e alternativa explícita', async () => {
  let resposta = estadoT4();
  const p = carregar({ sendMessage: async () => resposta });
  await aguardar();
  assert.match(p.elementos['aviso-voz'].textContent, /ainda não disponíveis/);
  resposta = estadoT4({ vozes: [{ ...vozPt, idioma: 'en-US', local: false }] });
  await p.atualizar();
  assert.match(p.elementos['aviso-voz'].textContent, /Nenhuma voz em português/);
  assert.equal(p.elementos.voz.filhos[1].textContent, '<b>Voz</b> (en-US) — serviço remoto');
  resposta = estadoT4({ vozes: [vozPt] });
  await p.atualizar();
  assert.match(p.elementos['aviso-voz'].textContent, /próxima leitura/);
});

test('mudança envia valores selecionados e restaura configuração confirmada', async () => {
  const mensagens = [];
  const p = carregar({ sendMessage: async (id, m) => {
    mensagens.push(m);
    return estadoT4({ vozes: [vozPt], configuracao: m.comando === 'configurar'
      ? { voz: m.voz, velocidade: m.velocidade } : { voz: '', velocidade: 1 } });
  } });
  await aguardar();
  p.elementos.voz.value = 'pt';
  p.elementos.velocidade.value = '1.5';
  await p.elementos.voz.clicar();
  assert.equal(mensagens[1].comando, 'configurar');
  assert.equal(mensagens[1].voz, 'pt');
  assert.equal(mensagens[1].velocidade, 1.5);
  assert.equal(p.elementos.voz.value, 'pt');
  assert.equal(p.elementos.velocidade.value, '1.5');
});

test('recupera progresso e opções ao reabrir durante pausa', async () => {
  const p = carregar({ sendMessage: async () => estadoT4({ estado: 'pausado', vozes: [vozPt],
    configuracao: { voz: 'pt', velocidade: 2 }, progresso: { concluidos: 3, total: 10 } }) });
  await aguardar();
  assert.equal(p.elementos.progresso.max, 10);
  assert.equal(p.elementos.progresso.value, 3);
  assert.match(p.elementos['texto-progresso'].textContent, /3 de 10.*trecho 4/);
  assert.equal(p.elementos.voz.value, 'pt');
  assert.equal(p.elementos.voz.disabled, true);
  assert.equal(p.elementos.velocidade.value, '2');
  assert.equal(p.elementos.velocidade.disabled, true);
});

test('voz removida permanece identificada para o usuário escolher alternativa', async () => {
  const p = carregar({ sendMessage: async () => estadoT4({ configuracao: { voz: 'removida', velocidade: 1 } }) });
  await aguardar();
  assert.match(p.elementos.voz.filhos.at(-1).textContent, /Voz indisponível/);
  assert.equal(p.elementos.voz.value, 'removida');
});

for (const campos of [{ vozes: {} }, { vozes: [null] }, { configuracao: null }, { configuracao: { voz: '', velocidade: 99 } }, { progresso: { concluidos: 2, total: 1 } }, { progresso: null }]) {
  test(`rejeita metadados inválidos: ${JSON.stringify(campos)}`, async () => {
    const p = carregar({ sendMessage: async () => estadoT4(campos) });
    await aguardar();
    assert.match(p.elementos['estado-leitura'].textContent, /Não foi possível acessar/);
  });
}
