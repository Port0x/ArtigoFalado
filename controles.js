(() => {
  const botoes = Object.fromEntries(["ouvir", "pausar", "continuar", "parar"]
    .map((id) => [id, document.getElementById(id)]));
  const status = document.getElementById("estado-leitura");
  const seletorVoz = document.getElementById("voz");
  const seletorVelocidade = document.getElementById("velocidade");
  const avisoVoz = document.getElementById("aviso-voz");
  const progresso = document.getElementById("progresso");
  const textoProgresso = document.getElementById("texto-progresso");
  let catalogo = "";
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
    seletorVoz.disabled = ocupado || ativo || indisponivel;
    seletorVelocidade.disabled = ocupado || ativo || indisponivel;
    if (resposta.vozes && resposta.configuracao) {
      const assinatura = JSON.stringify([resposta.vozes, resposta.configuracao.voz]);
      if (assinatura !== catalogo) {
        const opcoes = [{ id: "", nome: "Padrão do navegador" }, ...resposta.vozes];
        if (resposta.configuracao.voz && !resposta.vozes.some((v) => v.id === resposta.configuracao.voz)) {
          opcoes.push({ id: resposta.configuracao.voz, nome: "Voz indisponível — escolha outra" });
        }
        seletorVoz.replaceChildren(...opcoes.map((v) => {
          const opcao = document.createElement("option");
          opcao.value = v.id;
          opcao.textContent = v.id && v.idioma
            ? `${v.nome} (${v.idioma}) — ${v.local ? "local" : "serviço remoto"}` : v.nome;
          return opcao;
        }));
        catalogo = assinatura;
      }
      seletorVoz.value = resposta.configuracao.voz;
      seletorVelocidade.value = String(resposta.configuracao.velocidade);
      avisoVoz.textContent = !resposta.vozes.length
        ? "Vozes ainda não disponíveis. Você pode tentar a voz padrão do navegador."
        : !resposta.vozes.some((v) => /^pt(?:-|$)/i.test(v.idioma))
          ? "Nenhuma voz em português disponível. Escolha outra voz ou use a padrão do navegador."
          : "Voz e velocidade valem para a próxima leitura. Vozes remotas podem usar a rede.";
    }
    const { concluidos = 0, total = 0 } = resposta.progresso || {};
    progresso.max = total || 1;
    progresso.value = concluidos;
    textoProgresso.textContent = total
      ? `${concluidos} de ${total} trechos concluídos${ativo ? ` · trecho ${Math.min(concluidos + 1, total)}` : ""}`
      : "Nenhuma leitura em andamento.";
    const mensagem = resposta.erro || mensagens[resposta.estado];
    if (status.textContent !== mensagem) status.textContent = mensagem;
  }

  async function enviar(comando) {
    const consulta = comando === "estado";
    if (encerrado || ocupado || (consulta && consultando)) return;
    const configuracao = comando === "configurar"
      ? { voz: seletorVoz.value, velocidade: Number(seletorVelocidade.value) } : {};
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
      const mensagem = { acao: "controlar_leitura", comando, ...configuracao };
      if (comando === "ouvir") mensagem.texto = document.getElementById("texto").value;
      const resposta = await chrome.tabs.sendMessage(abaId, mensagem);
      if (!resposta || !Object.hasOwn(mensagens, resposta.estado)
          || (resposta.erro !== undefined && typeof resposta.erro !== "string")) {
        throw new Error("Estado de leitura inválido");
      }
      if ((resposta.vozes !== undefined && (!Array.isArray(resposta.vozes)
          || resposta.vozes.some((v) => !v || typeof v.id !== "string" || typeof v.nome !== "string"
            || typeof v.idioma !== "string" || typeof v.local !== "boolean")))
          || (resposta.configuracao !== undefined && (!resposta.configuracao
            || typeof resposta.configuracao.voz !== "string"
            || ![0.5, 0.75, 1, 1.25, 1.5, 2].includes(resposta.configuracao.velocidade)))
          || (resposta.progresso !== undefined && (!resposta.progresso
            || !Number.isInteger(resposta.progresso.total) || resposta.progresso.total < 0
            || !Number.isInteger(resposta.progresso.concluidos) || resposta.progresso.concluidos < 0
            || resposta.progresso.concluidos > resposta.progresso.total))) {
        throw new Error("Dados de leitura inválidos");
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
  for (const seletor of [seletorVoz, seletorVelocidade]) {
    seletor.addEventListener("change", () => {
      if (!seletor.disabled) return enviar("configurar");
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
