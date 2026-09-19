const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../leitura.js'), 'utf8');

function carregar({ suporte = true, lang = 'pt-BR' } = {}) {
  let listener, sair;
  const chamadas = [];
  const falas = [];
  const synth = {
    speak(fala) { chamadas.push('speak'); falas.push(fala); },
    pause() { chamadas.push('pause'); },
    resume() { chamadas.push('resume'); },
    cancel() { chamadas.push('cancel'); }
  };
  runInNewContext(source, {
    document: { documentElement: { lang } },
    window: { addEventListener(evento, fn) { assert.equal(evento, 'pagehide'); sair = fn; } },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
    ...(suporte ? { speechSynthesis: synth, SpeechSynthesisUtterance: function(texto) { this.text = texto; } } : {})
  });
  const enviar = (mensagem) => {
    const respostas = [];
    listener(mensagem, {}, (r) => respostas.push(JSON.parse(JSON.stringify(r))));
    return respostas;
  };
  return { synth, chamadas, falas, sair: () => sair(), enviar,
    comando(comando, texto) {
      const respostas = enviar({ acao: 'controlar_leitura', comando, texto });
      assert.equal(respostas.length, 1);
      return respostas[0];
    }
  };
}

test('não inicia automaticamente; consulta estado sem criar fala', () => {
  const p = carregar();
  assert.equal(p.comando('estado').estado, 'parado');
  assert.deepEqual(p.chamadas, []);
});

test('inicia texto completo, mantém referência e acompanha começo e fim', () => {
  const p = carregar({ lang: 'en-US' });
  assert.equal(p.comando('ouvir', 'Texto completo').estado, 'preparando');
  assert.equal(p.falas[0].text, 'Texto completo');
  assert.equal(p.falas[0].lang, 'en-US');
  p.falas[0].onstart();
  assert.equal(p.comando('estado').estado, 'lendo');
  p.falas[0].onend();
  assert.equal(p.comando('estado').estado, 'concluido');
});

for (const texto of ['', ' \n\t', null, 123, undefined]) {
  test(`rejeita texto vazio ou inválido: ${JSON.stringify(texto)}`, () => {
    const p = carregar();
    assert.match(p.comando('ouvir', texto).erro, /texto não vazio/);
    assert.deepEqual(p.chamadas, []);
    assert.match(p.comando('estado').erro, /texto não vazio/);
    p.comando('ouvir', 'Válido');
    assert.equal(p.comando('estado').erro, '');
  });
}

test('pausa, continua e para sem sobrepor leituras, inclusive durante preparação', () => {
  const p = carregar();
  p.comando('ouvir', 'Primeiro');
  p.comando('ouvir', 'Outro');
  assert.equal(p.comando('pausar').estado, 'pausado');
  p.falas[0].onstart();
  assert.equal(p.comando('estado').estado, 'pausado');
  p.comando('ouvir', 'Outro');
  assert.equal(p.comando('continuar').estado, 'lendo');
  p.comando('ouvir', 'Outro');
  assert.equal(p.falas.length, 1);
  assert.equal(p.comando('parar').estado, 'parado');
  assert.deepEqual(p.chamadas, ['resume', 'speak', 'pause', 'resume', 'cancel']);
});

test('eventos atrasados de fala cancelada não alteram a nova leitura', () => {
  const p = carregar();
  p.comando('ouvir', 'Antigo');
  const antiga = p.falas[0];
  p.comando('pausar');
  p.comando('parar');
  p.comando('ouvir', 'Novo');
  antiga.onstart(); antiga.onend(); antiga.onerror({ error: 'interrupted' });
  assert.equal(p.comando('estado').estado, 'preparando');
  assert.equal(p.falas.length, 2);
  assert.deepEqual(p.chamadas.slice(-2), ['resume', 'speak']);
});

for (const codigo of ['not-allowed', 'audio-busy', 'synthesis-failed']) {
  test(`erro assíncrono compreensível e recuperação: ${codigo}`, () => {
    const p = carregar();
    p.comando('ouvir', 'Texto');
    p.falas[0].onerror({ error: codigo });
    const estado = p.comando('estado');
    assert.equal(estado.estado, 'erro');
    assert.match(estado.erro, codigo === 'not-allowed' ? /Clique na página/ : /reproduzir a voz/);
    p.comando('ouvir', 'Tentativa');
    assert.equal(p.falas.length, 2);
  });
}

for (const metodo of ['speak', 'pause', 'resume', 'cancel']) {
  test(`trata exceção em ${metodo}`, () => {
    const p = carregar();
    p.comando('ouvir', 'Texto');
    p.synth[metodo] = () => { throw new Error('Falha simulada'); };
    if (metodo === 'speak') { p.comando('parar'); p.comando('ouvir', 'Novo'); }
    if (metodo === 'pause') p.comando('pausar');
    if (metodo === 'resume') { p.comando('pausar'); p.comando('continuar'); }
    if (metodo === 'cancel') p.comando('parar');
    assert.equal(p.comando('estado').estado, 'erro');
  });
}

test('ausência de suporte não lança erro', () => {
  const p = carregar({ suporte: false });
  for (const cmd of ['estado', 'ouvir', 'pausar', 'continuar', 'parar']) {
    assert.equal(p.comando(cmd, 'Texto').estado, 'indisponivel');
  }
});

test('comandos fora de estado são inofensivos e ações de outro script são ignoradas', () => {
  const p = carregar();
  for (const cmd of ['pausar', 'continuar', 'parar']) assert.equal(p.comando(cmd).estado, 'parado');
  assert.deepEqual(p.chamadas, []);
  assert.match(p.comando('inválido').erro, /inválido/);
  assert.deepEqual(p.enviar({ acao: 'pegar_artigo' }), []);
  assert.deepEqual(p.enviar(null), []);
});

test('navegação cancela fala e ignora eventos da página anterior', () => {
  const p = carregar();
  p.comando('ouvir', 'Texto');
  p.sair();
  p.falas[0].onend();
  assert.equal(p.comando('estado').estado, 'parado');
  assert.equal(p.chamadas.at(-1), 'cancel');
});

test('instâncias de páginas têm estados independentes', () => {
  const a = carregar(); const b = carregar();
  a.comando('ouvir', 'Texto');
  assert.equal(b.comando('estado').estado, 'parado');
  assert.deepEqual(b.chamadas, []);
});
