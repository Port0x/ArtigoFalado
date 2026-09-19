(() => {
  const $ = id => document.getElementById(id);
  const id = location.hash.slice(1);
  const chave = `exportacao:${id}`;
  const base = `http://127.0.0.1:8787/jobs/${id}`;
  let registro, timer, ocupado = false, fechado = false, terminado = false, versao = 0, estadoAtual = '';
  const pendencias = new Set();
  function mensagem(texto) { $('status-exportacao').textContent = texto; }
  function botoes(estado = estadoAtual) {
    $('gerar').disabled = ocupado || !registro || registro.iniciado || !$('consentimento').checked;
    $('cancelar').disabled = ocupado || !registro?.iniciado || terminado;
    $('baixar').disabled = ocupado || estado !== 'concluido';
    $('limpar').disabled = ocupado;
  }
  async function requisitar(sufixo = '', opcoes = {}) {
    const controle = new AbortController(); pendencias.add(controle);
    try {
      const resposta = await fetch(base + sufixo, { ...opcoes, signal: AbortSignal.any([controle.signal, AbortSignal.timeout(15000)]),
        headers: { Authorization: `Bearer ${$('token').value.trim()}`, 'Content-Type': 'application/json' } });
      if (!resposta.ok) {
        const textos = { 400: 'Texto inválido.', 401: 'Confira o token local.', 403: 'Confira o ID da extensão no backend.', 404: 'Trabalho não encontrado: pode ter expirado ou o backend foi reiniciado.', 429: 'Limite local atingido. Aguarde antes de tentar novamente.' };
        throw new Error(textos[resposta.status] || 'O backend não pôde concluir a solicitação.');
      }
      return sufixo === '/audio' ? await resposta.blob() : await resposta.json();
    } finally { pendencias.delete(controle); }
  }
  function apresentar(dados) {
    if (!['gerando', 'concluido', 'cancelado', 'erro'].includes(dados.estado) ||
        !Number.isInteger(dados.progresso?.total) || !Number.isInteger(dados.progresso?.concluidos) ||
        dados.progresso.total < 0 || dados.progresso.concluidos < 0 || dados.progresso.concluidos > dados.progresso.total) throw new Error('Resposta inválida do backend.');
    estadoAtual = dados.estado;
    terminado = dados.estado !== 'gerando';
    $('progresso-exportacao').max = Math.max(1, dados.progresso.total);
    $('progresso-exportacao').value = dados.progresso.concluidos;
    $('rotulo-progresso').textContent = `${dados.progresso.concluidos}/${dados.progresso.total} trechos gerados.`;
    mensagem({ gerando: 'Gerando áudio…', concluido: 'Áudio pronto. Clique em Baixar WAV.', cancelado: 'Geração cancelada. Para outro pedido, capture o texto e abra uma nova exportação.', erro: 'Falha na geração. Confira as credenciais e a cota do serviço no backend. Para tentar novamente, abra uma nova exportação.' }[dados.estado]);
    botoes(dados.estado);
    if (!terminado && !fechado) timer = setTimeout(consultar, 1000);
  }
  async function consultar() {
    clearTimeout(timer);
    if (fechado || ocupado || !registro?.iniciado) return;
    const atual = versao;
    try { const dados = await requisitar(); if (atual === versao && !fechado) apresentar(dados); }
    catch (erro) {
      if (fechado || atual !== versao) return;
      mensagem(`${erro.message} A consulta será repetida; nenhum novo pedido será enviado.`);
      botoes(); timer = setTimeout(consultar, 5000);
    }
  }
  $('consentimento').addEventListener('change', () => botoes());
  $('gerar').addEventListener('click', async () => {
    if (ocupado || !registro || registro.iniciado || !$('consentimento').checked) return;
    if (!/^[a-f0-9]{64}$/.test($('token').value.trim())) { mensagem('Informe o token local de 64 dígitos hexadecimais em Configurar conexão local.'); return; }
    ocupado = true; versao++; botoes(); clearTimeout(timer);
    try {
      await chrome.storage.session.set({ tokenExportacao: $('token').value.trim(), [chave]: { ...registro, iniciado: true } });
      registro.iniciado = true;
      const dados = await requisitar('', { method: 'POST', body: JSON.stringify({ texto: registro.texto }) });
      ocupado = false; apresentar(dados);
    } catch (erro) {
      ocupado = false;
      mensagem(`${erro.message} Se o pedido foi recebido, recarregue esta página para consultar. Para novo pedido, abra outra exportação.`);
      botoes();
    }
  });
  $('cancelar').addEventListener('click', async () => {
    if (ocupado || !registro?.iniciado || terminado) return;
    ocupado = true; versao++; clearTimeout(timer); botoes();
    try { const dados = await requisitar('', { method: 'DELETE' }); ocupado = false; apresentar(dados); }
    catch (erro) { ocupado = false; mensagem(erro.message); botoes(); timer = setTimeout(consultar, 1000); }
  });
  $('baixar').addEventListener('click', async () => {
    if (ocupado || $('baixar').disabled) return;
    ocupado = true; botoes();
    try {
      const blob = await requisitar('/audio');
      if (blob.type !== 'audio/wav' || blob.size < 44) throw new Error('Arquivo de áudio inválido.');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'artigo.wav'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      mensagem('Download solicitado. Confira o arquivo nos downloads do navegador.');
      ocupado = false; botoes('concluido');
    } catch (erro) { ocupado = false; mensagem(erro.message); botoes('concluido'); }
  });
  $('limpar').addEventListener('click', async () => {
    if (ocupado) return;
    ocupado = true; versao++; clearTimeout(timer); botoes();
    try {
      let remoto = true;
      if (registro?.iniciado) { try { await requisitar('', { method: 'DELETE' }); } catch { remoto = false; } }
      await chrome.storage.session.remove([chave, 'tokenExportacao']);
      registro = undefined; $('artigo').value = ''; $('token').value = ''; terminado = true; estadoAtual = '';
      mensagem(remoto ? 'Texto e token removidos da sessão. Abra uma nova exportação pelo popup.' : 'Dados locais removidos. Não foi possível confirmar o cancelamento no backend; ele pode continuar até o limite de 10 minutos.');
    } catch { mensagem('Não foi possível limpar tudo. Verifique a conexão com o backend e tente novamente.'); }
    finally { ocupado = false; botoes(); }
  });
  window.addEventListener('pagehide', () => { fechado = true; clearTimeout(timer); for (const controle of pendencias) controle.abort(); });
  (async () => {
    try {
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new Error();
      const dados = await chrome.storage.session.get([chave, 'tokenExportacao']);
      registro = dados[chave];
      if (!registro || typeof registro.texto !== 'string') throw new Error();
      $('artigo').value = registro.texto; $('token').value = dados.tokenExportacao || '';
      mensagem('Confira o texto, configure a conexão e autorize o envio para gerar.');
      botoes(); if (registro.iniciado) await consultar();
    } catch { registro = undefined; botoes(); mensagem('Texto indisponível. Capture novamente pelo popup e abra a exportação.'); }
  })();
})();
