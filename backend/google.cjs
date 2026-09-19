const { Buffer } = require('node:buffer');

function extrairPcm(wav) {
  const invalido = () => { throw new Error('WAV inválido ou formato não suportado.'); };
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' ||
      wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt32LE(4) + 8 !== wav.length) invalido();
  let formato = false, pcm;
  for (let offset = 12; offset < wav.length;) {
    if (offset + 8 > wav.length) invalido();
    const id = wav.toString('ascii', offset, offset + 4);
    const tamanho = wav.readUInt32LE(offset + 4);
    const inicio = offset + 8, fim = inicio + tamanho;
    if (fim + tamanho % 2 > wav.length) invalido();
    if (id === 'fmt ') {
      if (formato || tamanho < 16 || wav.readUInt16LE(inicio) !== 1 ||
          wav.readUInt16LE(inicio + 2) !== 1 || wav.readUInt32LE(inicio + 4) !== 24000 ||
          wav.readUInt32LE(inicio + 8) !== 48000 || wav.readUInt16LE(inicio + 12) !== 2 ||
          wav.readUInt16LE(inicio + 14) !== 16) invalido();
      formato = true;
    }
    if (id === 'data') {
      if (pcm || !tamanho || tamanho % 2) invalido();
      pcm = wav.subarray(inicio, fim);
    }
    offset = fim + tamanho % 2;
  }
  if (!formato || !pcm) invalido();
  return { pcm, canais: 1, taxa: 24000, codificacao: 'pcm_s16le' };
}

function criarGoogle({ accessToken, projeto, fetchImpl = fetch, timeout = 30000 }) {
  if (!accessToken || !projeto) throw new Error('Configure GOOGLE_ACCESS_TOKEN e GOOGLE_CLOUD_PROJECT no backend.');
  return async ({ texto, signal }) => {
    const combinado = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
    const resposta = await fetchImpl('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST', signal: combinado, redirect: 'error',
      headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-user-project': projeto, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text: texto }, voice: { languageCode: 'pt-BR', name: 'pt-BR-Standard-A' },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: 1 } })
    });
    if (!resposta.ok) {
      await resposta.body?.cancel();
      throw new Error(`Serviço de voz indisponível (HTTP ${resposta.status}).`);
    }
    const partes = []; let tamanho = 0;
    for await (const parte of resposta.body) {
      tamanho += parte.length;
      if (tamanho > 32 * 1024 * 1024) throw new Error('Resposta do serviço de voz muito grande.');
      partes.push(Buffer.from(parte));
    }
    const dados = JSON.parse(Buffer.concat(partes).toString('utf8'));
    if (typeof dados.audioContent !== 'string' || !dados.audioContent.length ||
        dados.audioContent.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dados.audioContent)) {
      throw new Error('Resposta de áudio inválida.');
    }
    return extrairPcm(Buffer.from(dados.audioContent, 'base64'));
  };
}
module.exports = { criarGoogle, extrairPcm };
