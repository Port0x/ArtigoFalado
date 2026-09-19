const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { dividirTexto, exportarWav } = require('./exportacao.cjs');
const { criarGoogle } = require('./google.cjs');

function criarServidor({ token, extensao, sintetizar, agora = Date.now, retencao = 600000, prazo = 600000, orcamento = 200000 }) {
  if (!/^[a-f0-9]{64}$/.test(token || '') || !/^[a-p]{32}$/.test(extensao || '') || typeof sintetizar !== 'function') {
    throw new Error('Configure token local de 64 dígitos hexadecimais, ID da extensão e provedor.');
  }
  const jobs = new Map(); let ativo = false, reservado = false, consumido = 0, janela = agora();
  const origem = `chrome-extension://${extensao}`;
  function limpar() {
    for (const [id, job] of jobs) if (job.fim !== undefined && agora() - job.fim >= retencao) jobs.delete(id);
  }
  const timer = setInterval(limpar, Math.min(retencao, 60000)); timer.unref();
  const servidor = http.createServer(async (req, res) => {
    const json = (status, dados) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(dados)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && origin !== origem) return json(403, { erro: 'Origem não permitida.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origem); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.writeHead(204); return res.end();
    }
    const fornecido = Buffer.from(req.headers.authorization || '');
    const esperado = Buffer.from(`Bearer ${token}`);
    if (fornecido.length !== esperado.length || !timingSafeEqual(fornecido, esperado)) return json(401, { erro: 'Token local inválido.' });
    limpar();
    const rota = /^\/jobs\/([a-f0-9-]{36})(\/audio)?$/.exec(req.url);
    if (!rota) return json(404, { erro: 'Rota não encontrada.' });
    const [, id, audio] = rota;
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) return json(400, { erro: 'Identificador inválido.' });
    const publico = job => ({ id, estado: job.estado, progresso: job.progresso, erro: job.erro || '' });
    const existente = jobs.get(id);
    if (req.method === 'GET') {
      if (!existente) return json(404, { erro: 'Exportação expirada ou backend reiniciado.' });
      if (!audio) return json(200, publico(existente));
      if (existente.estado !== 'concluido') return json(409, { erro: 'Áudio ainda não disponível.' });
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': existente.arquivo.length,
        'Content-Disposition': 'attachment; filename="artigo.wav"' }); return res.end(existente.arquivo);
    }
    if (req.method === 'DELETE' && !audio) {
      if (!existente) return json(404, { erro: 'Exportação não encontrada.' });
      existente.controle.abort(); existente.estado = 'cancelado'; existente.arquivo = undefined; existente.fim = agora();
      return json(200, publico(existente));
    }
    if (req.method !== 'POST' || audio) return json(405, { erro: 'Método não permitido.' });
    if (existente) return json(200, publico(existente)); // Repetição do mesmo ID não cobra novamente.
    if (ativo || reservado || jobs.size >= 4) return json(429, { erro: 'Aguarde a exportação atual ou a expiração dos arquivos (10 minutos).' });
    if (req.headers['content-type'] !== 'application/json') return json(415, { erro: 'Envie JSON.' });
    reservado = true;
    let dados;
    try {
      let tamanho = 0; const partes = [];
      for await (const parte of req) {
        tamanho += parte.length;
        if (tamanho > 1_300_000) { json(413, { erro: 'Requisição muito grande.' }); return; }
        partes.push(parte);
      }
      dados = JSON.parse(Buffer.concat(partes).toString('utf8'));
      dividirTexto(dados?.texto);
      if (agora() - janela >= 3600000) { janela = agora(); consumido = 0; }
      const bytes = Buffer.byteLength(dados.texto);
      if (consumido + bytes > orcamento) return json(429, { erro: 'Limite local de texto por hora atingido.' });
      consumido += bytes;
    } catch { return json(400, { erro: 'Texto vazio, inválido ou acima de 200.000 bytes.' }); }
    finally { reservado = false; }
    const controle = new AbortController();
    const job = { estado: 'gerando', progresso: { concluidos: 0, total: 0 }, controle };
    jobs.set(id, job); ativo = true;
    const limite = setTimeout(() => controle.abort(), prazo); limite.unref();
    exportarWav({ texto: dados.texto, sintetizar, signal: controle.signal, progresso: p => { job.progresso = p; } })
      .then(({ arquivo }) => { if (!controle.signal.aborted) { job.arquivo = arquivo; job.estado = 'concluido'; } })
      .catch(() => { job.estado = controle.signal.aborted ? 'cancelado' : 'erro'; job.erro = controle.signal.aborted ? '' : 'Falha na geração. Confira configuração, cota e validade do acesso ao serviço de voz.'; })
      .finally(() => { clearTimeout(limite); job.fim = agora(); ativo = false; });
    return json(202, publico(job));
  });
  servidor.requestTimeout = 15000;
  servidor.headersTimeout = 10000;
  servidor.on('close', () => { clearInterval(timer); for (const job of jobs.values()) job.controle.abort(); jobs.clear(); });
  return servidor;
}
if (require.main === module) {
  try {
    const servidor = criarServidor({ token: process.env.ARTIGOFALADO_TOKEN, extensao: process.env.EXTENSION_ID,
      sintetizar: criarGoogle({ accessToken: process.env.GOOGLE_ACCESS_TOKEN, projeto: process.env.GOOGLE_CLOUD_PROJECT }) });
    servidor.on('error', () => { console.error('Não foi possível iniciar o backend na porta 8787.'); process.exitCode = 1; });
    servidor.listen(8787, '127.0.0.1', () => console.log('Backend local em http://127.0.0.1:8787. Voz Google pt-BR-Standard-A, WAV, 1×.'));
    for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => { servidor.close(); servidor.closeAllConnections(); });
  } catch (erro) { console.error(erro.message); process.exitCode = 1; }
}
module.exports = { criarServidor };
