const { Buffer } = require('node:buffer');

// Contrato interno: PCM assinado de 16 bits little-endian, mono, 24 kHz.
const FORMATO = Object.freeze({ codificacao: 'pcm_s16le', canais: 1, taxa: 24000 });
const MAX_TEXTO = 200_000;
const MAX_AUDIO = 64 * 1024 * 1024;

function dividirTexto(texto, limite = 5000) {
  if (typeof texto !== 'string' || !texto.trim() || !texto.isWellFormed()) {
    throw new Error('Informe um texto não vazio com Unicode válido.');
  }
  if (Buffer.byteLength(texto, 'utf8') > MAX_TEXTO) throw new Error('Texto excede 200.000 bytes.');
  if (!Number.isInteger(limite) || limite < 4 || limite > 5000) throw new Error('Limite de trecho inválido.');
  const trechos = [];
  let trecho = '', bytes = 0, separador = 0;
  for (const caractere of texto) {
    const tamanho = Buffer.byteLength(caractere, 'utf8');
    while (bytes + tamanho > limite) {
      const corte = separador || trecho.length;
      trechos.push(trecho.slice(0, corte));
      trecho = trecho.slice(corte);
      bytes = Buffer.byteLength(trecho, 'utf8');
      separador = 0;
    }
    trecho += caractere;
    bytes += tamanho;
    if (/\s|[.!?;:]/u.test(caractere)) separador = trecho.length;
  }
  if (trecho) trechos.push(trecho);
  return trechos;
}

function criarWav(partes, tamanho) {
  const cabecalho = Buffer.alloc(44);
  cabecalho.write('RIFF', 0);
  cabecalho.writeUInt32LE(36 + tamanho, 4);
  cabecalho.write('WAVEfmt ', 8);
  cabecalho.writeUInt32LE(16, 16);
  cabecalho.writeUInt16LE(1, 20);
  cabecalho.writeUInt16LE(FORMATO.canais, 22);
  cabecalho.writeUInt32LE(FORMATO.taxa, 24);
  cabecalho.writeUInt32LE(FORMATO.taxa * 2, 28);
  cabecalho.writeUInt16LE(2, 32);
  cabecalho.writeUInt16LE(16, 34);
  cabecalho.write('data', 36);
  cabecalho.writeUInt32LE(tamanho, 40);
  return Buffer.concat([cabecalho, ...partes], 44 + tamanho);
}

async function exportarWav({ texto, sintetizar, signal, progresso = () => {} }) {
  const trechos = dividirTexto(texto);
  if (typeof sintetizar !== 'function') throw new Error('Provedor de voz não configurado.');
  if (typeof progresso !== 'function') throw new Error('Observador de progresso inválido.');
  const partes = [];
  let tamanho = 0;
  signal?.throwIfAborted();
  progresso({ concluidos: 0, total: trechos.length });
  for (const [indice, trecho] of trechos.entries()) {
    signal?.throwIfAborted();
    let audio;
    try {
      audio = await sintetizar({ texto: trecho, formato: FORMATO, signal });
    } catch {
      signal?.throwIfAborted();
      // Não propagar mensagens do fornecedor que possam conter texto ou credenciais.
      throw new Error(`Falha ao gerar o trecho ${indice + 1}.`);
    }
    signal?.throwIfAborted();
    if (!audio || audio.codificacao !== FORMATO.codificacao || audio.canais !== 1 || audio.taxa !== 24000 ||
        !Buffer.isBuffer(audio.pcm) || !audio.pcm.length || audio.pcm.length % 2) {
      throw new Error('O provedor retornou áudio PCM incompatível.');
    }
    tamanho += audio.pcm.length;
    if (tamanho > MAX_AUDIO) throw new Error('Áudio excede 64 MiB.');
    partes.push(Buffer.from(audio.pcm));
    progresso({ concluidos: indice + 1, total: trechos.length });
  }
  signal?.throwIfAborted();
  return { arquivo: criarWav(partes, tamanho), tipo: 'audio/wav' };
}

module.exports = { dividirTexto, exportarWav };
