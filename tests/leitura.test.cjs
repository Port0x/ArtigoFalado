const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../leitura.js'), 'utf8');

function carregar({ suporte = true, lang = 'pt-BR', vozes = [] } = {}) {
  let listener, sair;
  const chamadas = [];
  const falas = [];
  const synth = {
    getVoices() { return vozes; },
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
    comando(comando, texto, opcoes = {}) {
      const respostas = enviar({ acao: 'controlar_leitura', comando, texto, ...opcoes });
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

for (const [nome, texto] of [
  ['frases e parágrafos', 'Primeira frase. Segunda frase! Terceira?\n'.repeat(80)],
  ['texto sem pontuação', 'palavra '.repeat(1000)],
  ['palavra muito longa', 'a'.repeat(1001)],
  ['emoji no limite', 'a'.repeat(239) + '😀'.repeat(130)],
  ['espaços e quebras', ' \nOlá\t mundo.\n\n'.repeat(120)],
  ['texto de 150 mil caracteres', 'ação '.repeat(30000)]
]) {
  test(`divide sem perda ou repetição e conclui em ordem: ${nome}`, () => {
    const p = carregar();
    const inicio = p.comando('ouvir', texto);
    assert.ok(inicio.progresso.total > 1);
    let n = 0;
    while (p.comando('estado').estado !== 'concluido') {
      assert.ok(n < 10000, 'Fila deve terminar');
      assert.equal(p.falas.length, n + 1, 'Apenas um trecho é enviado por vez');
      const fala = p.falas[n++];
      assert.ok(fala.text.length <= 240);
      assert.equal(fala.text.isWellFormed(), true);
      fala.onstart();
      fala.onend();
      fala.onend(); // Evento duplicado não pode pular um trecho.
    }
    assert.equal(p.falas.map((f) => f.text).join(''), texto);
    const fim = p.comando('estado').progresso;
    assert.equal(fim.concluidos, fim.total);
  });
}

test('prefere terminar trecho em uma frase quando possível', () => {
  const p = carregar();
  p.comando('ouvir', 'Frase curta. ' + 'palavra '.repeat(80));
  assert.equal(p.falas[0].text, 'Frase curta. ');
});

test('parar cancela fila inteira e início seguinte zera progresso', () => {
  const p = carregar();
  p.comando('ouvir', 'Frase. '.repeat(300));
  const antiga = p.falas[0];
  p.comando('parar');
  antiga.onend();
  assert.equal(p.falas.length, 1);
  assert.deepEqual(p.comando('estado').progresso, { concluidos: 0, total: 0 });
  p.comando('ouvir', 'Novo');
  assert.deepEqual(p.comando('estado').progresso, { concluidos: 0, total: 1 });
});

test('pausa na fronteira de trechos preserva fila e retoma do próximo', () => {
  const p = carregar();
  p.comando('ouvir', 'Uma frase. '.repeat(100));
  p.comando('pausar');
  p.falas[0].onend();
  assert.equal(p.falas.length, 1);
  assert.equal(p.comando('estado').estado, 'pausado');
  assert.equal(p.comando('estado').progresso.concluidos, 1);
  p.comando('ouvir', 'Não deve substituir');
  assert.equal(p.falas.length, 1);
  p.comando('continuar');
  assert.equal(p.falas.length, 2);
  assert.equal(p.comando('estado').progresso.concluidos, 1);
});

test('erro em trecho posterior interrompe a fila e preserva progresso para diagnóstico', () => {
  const p = carregar();
  p.comando('ouvir', 'Uma frase. '.repeat(100));
  p.falas[0].onend();
  p.falas[1].onerror({ error: 'network' });
  p.falas[1].onend();
  assert.equal(p.comando('estado').estado, 'erro');
  assert.equal(p.comando('estado').progresso.concluidos, 1);
  assert.equal(p.falas.length, 2);
});

const vozLocal = { voiceURI: 'voz-pt', name: 'Português', lang: 'pt-BR', localService: true };

test('vozes que chegam depois aparecem na consulta de estado', () => {
  const vozes = [];
  const p = carregar({ vozes });
  assert.deepEqual(p.comando('estado').vozes, []);
  vozes.push(vozLocal);
  assert.deepEqual(p.comando('estado').vozes, [{ id: 'voz-pt', nome: 'Português', idioma: 'pt-BR', local: true }]);
});

test('aplica voz e velocidade a todos os trechos, mantendo opções entre consultas', () => {
  const p = carregar({ vozes: [vozLocal] });
  p.comando('configurar', undefined, { voz: 'voz-pt', velocidade: 1.5 });
  p.comando('ouvir', 'Frase. '.repeat(100));
  assert.equal(p.falas[0].voice, vozLocal);
  assert.equal(p.falas[0].rate, 1.5);
  p.comando('configurar', undefined, { voz: '', velocidade: 2 });
  p.falas[0].onend();
  assert.equal(p.falas[1].voice, vozLocal);
  assert.equal(p.falas[1].rate, 1.5);
  assert.deepEqual(p.comando('estado').configuracao, { voz: 'voz-pt', velocidade: 1.5 });
});

for (const opcoes of [{ voz: '', velocidade: 0 }, { voz: '', velocidade: '2' }, { voz: '', velocidade: 10 }, { voz: null, velocidade: 1 }, { voz: 'ausente', velocidade: 1 }]) {
  test(`rejeita opções inválidas sem alterar configuração: ${JSON.stringify(opcoes)}`, () => {
    const p = carregar();
    assert.ok(p.comando('configurar', undefined, opcoes).erro);
    assert.deepEqual(p.comando('estado').configuracao, { voz: '', velocidade: 1 });
  });
}

test('voz removida entre trechos interrompe e permite escolher alternativa', () => {
  const vozes = [vozLocal];
  const p = carregar({ vozes });
  p.comando('configurar', undefined, { voz: 'voz-pt', velocidade: 1 });
  p.comando('ouvir', 'Frase. '.repeat(100));
  vozes.pop();
  p.falas[0].onend();
  assert.equal(p.comando('estado').estado, 'erro');
  assert.match(p.comando('estado').erro, /voz selecionada/);
  p.comando('configurar', undefined, { voz: '', velocidade: 1 });
  p.comando('ouvir', 'Alternativa');
  assert.equal(p.falas.length, 2);
  assert.equal(p.falas[1].voice, undefined);
});

test('falha ao listar vozes mantém alternativa padrão', () => {
  const p = carregar();
  p.synth.getVoices = () => { throw new Error(); };
  assert.deepEqual(p.comando('estado').vozes, []);
  p.comando('ouvir', 'Texto');
  assert.equal(p.falas.length, 1);
});
