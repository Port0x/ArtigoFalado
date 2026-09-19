const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dividirTexto, exportarWav } = require('../backend/exportacao.cjs');
const resposta = (pcm = Buffer.from([0, 0, 255, 127])) => ({ pcm, taxa: 24000, canais: 1, codificacao: 'pcm_s16le' });

for (const texto of ['Olá! 😊 '.repeat(10000), 'x'.repeat(200000), 'a'.repeat(4999) + '😀fim', '  Ação.\nOutra frase!  ']) {
  test(`divide e reconstrói sem perder Unicode ou espaços (${texto.length})`, () => {
    const partes = dividirTexto(texto);
    assert.equal(partes.join(''), texto);
    for (const parte of partes) {
      assert.ok(parte.isWellFormed());
      assert.ok(Buffer.byteLength(parte) <= 5000);
      assert.ok(parte.length);
    }
  });
}
for (const texto of [null, 42, '', ' \n', '\ud800', 'é'.repeat(100001)]) {
  test(`rejeita texto inválido antes de chamar provedor (${typeof texto}, ${texto?.length})`, async () => {
    let chamadas = 0;
    await assert.rejects(exportarWav({ texto, sintetizar: () => { chamadas++; } }));
    assert.equal(chamadas, 0);
  });
}
test('valida limite e prefere fronteira de palavra', () => {
  assert.deepEqual(dividirTexto('abc defghi', 7), ['abc ', 'defghi']);
  for (const limite of [0, 3, 5001, 4.5, '10']) assert.throws(() => dividirTexto('abc', limite));
});
test('monta WAV com amostras em ordem, cabeçalho único e progresso', async () => {
  const entradas = [], eventos = [];
  const texto = 'x'.repeat(5000) + 'fim';
  const resultado = await exportarWav({ texto, progresso: p => eventos.push(p), sintetizar: async entrada => {
    entradas.push(entrada.texto);
    return resposta(Buffer.from([entradas.length, 0]));
  } });
  const wav = resultado.arquivo;
  assert.equal(entradas.join(''), texto);
  assert.equal(resultado.tipo, 'audio/wav');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.readUInt32LE(16), 16);
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(28), 48000);
  assert.equal(wav.readUInt16LE(32), 2);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 4);
  assert.deepEqual([...wav.subarray(44)], [1, 0, 2, 0]);
  assert.deepEqual(eventos, [{ concluidos: 0, total: 2 }, { concluidos: 1, total: 2 }, { concluidos: 2, total: 2 }]);
});
test('falha intermediária não repete chamadas nem entrega arquivo parcial', async () => {
  let chamadas = 0;
  await assert.rejects(exportarWav({ texto: 'x'.repeat(12000), sintetizar: async () => {
    if (++chamadas === 2) throw new Error('segredo do fornecedor');
    return resposta();
  } }), { message: 'Falha ao gerar o trecho 2.' });
  assert.equal(chamadas, 2);
});
for (const alteracao of [{ pcm: Buffer.alloc(0) }, { pcm: Buffer.alloc(3) }, { pcm: 'abc' }, { taxa: 44100 }, { canais: 2 }, { codificacao: 'mp3' }]) {
  test(`rejeita áudio incompatível: ${Object.keys(alteracao)}`, async () => {
    await assert.rejects(exportarWav({ texto: 'Olá', sintetizar: async () => ({ ...resposta(), ...alteracao }) }), /PCM incompatível/);
  });
}
test('cancelamento anterior evita chamar provedor', async () => {
  const controle = new AbortController(); controle.abort();
  await assert.rejects(exportarWav({ texto: 'Olá', signal: controle.signal, sintetizar: () => assert.fail('não chamar') }), { name: 'AbortError' });
});
test('descarta resposta atrasada depois de cancelar e não avança a fila', async () => {
  const controle = new AbortController(); let chamadas = 0; const eventos = [];
  await assert.rejects(exportarWav({ texto: 'x'.repeat(12000), signal: controle.signal, progresso: p => eventos.push(p), sintetizar: async ({ signal }) => {
    chamadas++; assert.equal(signal, controle.signal); controle.abort(); return resposta();
  } }), { name: 'AbortError' });
  assert.equal(chamadas, 1); assert.equal(eventos.length, 1);
});
test('limita áudio acumulado', async () => {
  await assert.rejects(exportarWav({ texto: 'Olá', sintetizar: async () => resposta(Buffer.alloc(64 * 1024 * 1024 + 2)) }), /64 MiB/);
});
test('exige provedor e observador válidos', async () => {
  await assert.rejects(exportarWav({ texto: 'Olá' }), /não configurado/);
  await assert.rejects(exportarWav({ texto: 'Olá', sintetizar: async () => resposta(), progresso: null }), /progresso inválido/);
});
test('emoji após separador distante nunca ultrapassa limite de bytes', () => {
  const texto = ' ' + 'a'.repeat(4998) + '😀';
  const partes = dividirTexto(texto);
  assert.equal(partes.join(''), texto);
  assert.ok(partes.every(p => Buffer.byteLength(p) <= 5000));
});
test('copia buffers reutilizados pelo provedor', async () => {
  const pcm = Buffer.alloc(2); let indice = 0;
  const { arquivo } = await exportarWav({ texto: 'x'.repeat(10000), sintetizar: async () => {
    pcm.writeInt16LE(++indice); return resposta(pcm);
  } });
  assert.deepEqual([...arquivo.subarray(44)], [1, 0, 2, 0]);
});
test('cancelamento no progresso final impede entrega do arquivo', async () => {
  const controle = new AbortController();
  await assert.rejects(exportarWav({ texto: 'Olá', signal: controle.signal, sintetizar: async () => resposta(), progresso: p => {
    if (p.concluidos === p.total) controle.abort();
  } }), { name: 'AbortError' });
});
