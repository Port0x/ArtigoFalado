(() => {
  const botoes = Object.fromEntries(["ouvir", "pausar", "continuar", "parar"]
    .map((id) => [id, document.getElementById(id)]));
  const status = document.getElementById("estado-leitura");
  const mensagens = {
    parado: "Leitura parada. Capture o artigo e clique em Ouvir.",
    preparando: "Preparando leitura…",
    lendo: "Lendo em voz alta.",
    pausado: "Leitura pausada.",
    concluido: "Leitura concluída.",
    erro: "Não foi possível reproduzir a voz. Tente novamente.",
    indisponivel: "Este navegador não oferece síntese de voz."
  };
  let abaId;
  let ocupado = false;
  let consultando = false;
  let sequencia = 0;
  let encerrado = false;
  let ultimo = { estado: "indisponivel" };

  function mostrar(resposta) {
    const ativo = ["preparando", "lendo", "pausado"].includes(resposta.estado);
    const indisponivel = resposta.estado === "indisponivel";
    botoes.ouvir.disabled = ocupado || ativo || indisponivel;
    botoes.pausar.disabled = ocupado || !["preparando", "lendo"].includes(resposta.estado);
    botoes.continuar.disabled = ocupado || resposta.estado !== "pausado";
    botoes.parar.disabled = ocupado || !ativo;
    const mensagem = resposta.erro || mensagens[resposta.estado];
    if (status.textContent !== mensagem) status.textContent = mensagem;
  }

  async function enviar(comando) {
    const consulta = comando === "estado";
    if (encerrado || ocupado || (consulta && consultando)) return;
    const ordem = ++sequencia;
    if (consulta) consultando = true;
    else {
      ocupado = true;
      mostrar(ultimo);
    }
    try {
      if (abaId === undefined) {
        const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!Number.isInteger(aba?.id)) throw new Error("Aba ausente");
        abaId = aba.id;
      }
      const mensagem = { acao: "controlar_leitura", comando };
      if (comando === "ouvir") mensagem.texto = document.getElementById("texto").value;
      const resposta = await chrome.tabs.sendMessage(abaId, mensagem);
      if (!resposta || !Object.hasOwn(mensagens, resposta.estado)
          || (resposta.erro !== undefined && typeof resposta.erro !== "string")) {
        throw new Error("Estado de leitura inválido");
      }
      if (ordem === sequencia) ultimo = resposta;
    } catch {
      if (ordem === sequencia) ultimo = { estado: "indisponivel", erro: "Não foi possível acessar a leitura nesta página. Atualize a página e reabra o popup." };
    } finally {
      if (consulta) consultando = false;
      else ocupado = false;
      if (!encerrado && ordem === sequencia) mostrar(ultimo);
    }
  }

  for (const [comando, botao] of Object.entries(botoes)) {
    botao.addEventListener("click", () => {
      if (!botao.disabled) return enviar(comando);
    });
  }
  mostrar(ultimo);
  enviar("estado");
  // Consulta apenas o estado, sem retransmitir o artigo a cada atualização.
  const intervalo = setInterval(() => enviar("estado"), 700);
  window.addEventListener("pagehide", () => {
    encerrado = true;
    clearInterval(intervalo);
  });
})();
