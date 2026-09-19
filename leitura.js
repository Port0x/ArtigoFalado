// A reprodução pertence à página, não ao popup.
(() => {
  let estado = "parado";
  let erro = "";
  let fala = null;
  const suporte = () => typeof speechSynthesis !== "undefined"
    && typeof SpeechSynthesisUtterance === "function";
  const resposta = () => ({ estado: suporte() ? estado : "indisponivel", erro });

  function falhar(mensagem) {
    fala = null;
    estado = "erro";
    erro = mensagem;
  }

  window.addEventListener("pagehide", () => {
    const ativa = fala;
    fala = null;
    estado = "parado";
    erro = "";
    if (ativa && suporte()) {
      try { speechSynthesis.cancel(); } catch { /* A página está sendo encerrada. */ }
    }
  });

  chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    if (mensagem?.acao !== "controlar_leitura") return;
    const comando = mensagem.comando;
    if (!["estado", "ouvir", "pausar", "continuar", "parar"].includes(comando)) {
      responder({ ...resposta(), erro: "Comando de leitura inválido." });
      return;
    }
    if (!suporte() || comando === "estado") {
      responder(resposta());
      return;
    }

    try {
      if (comando === "ouvir") {
        // Não reinicia nem enfileira outra leitura quando já existe uma ativa.
        if (!fala) {
          if (typeof mensagem.texto !== "string" || !mensagem.texto.trim()) {
            erro = "Capture um texto não vazio antes de ouvir.";
            responder(resposta());
            return;
          }
          const atual = new SpeechSynthesisUtterance(mensagem.texto);
          atual.lang = document.documentElement.lang || "pt-BR";
          fala = atual;
          estado = "preparando";
          erro = "";
          atual.onstart = () => {
            if (fala === atual && estado === "preparando") estado = "lendo";
          };
          atual.onend = () => {
            if (fala !== atual) return;
            fala = null;
            estado = "concluido";
          };
          atual.onerror = (evento) => {
            if (fala !== atual) return;
            falhar(evento.error === "not-allowed"
              ? "O navegador bloqueou a voz. Clique na página e tente ouvir novamente."
              : "Não foi possível reproduzir a voz. Tente novamente ou verifique as vozes do sistema.");
          };
          // cancel() não remove o estado de pausa de uma leitura anterior.
          speechSynthesis.resume();
          speechSynthesis.speak(atual);
        }
      } else if (comando === "pausar" && fala && ["preparando", "lendo"].includes(estado)) {
        speechSynthesis.pause();
        estado = "pausado";
      } else if (comando === "continuar" && fala && estado === "pausado") {
        speechSynthesis.resume();
        estado = "lendo";
      } else if (comando === "parar") {
        const ativa = fala;
        fala = null; // Ignora eventos de cancelamento que chegarem depois.
        if (ativa) speechSynthesis.cancel();
        estado = "parado";
        erro = "";
      }
    } catch (falha) {
      // Uma falha de controle não deve deixar uma fala órfã tocando.
      fala = null;
      try { speechSynthesis.cancel(); } catch { /* API indisponível ou defeituosa. */ }
      falhar("Não foi possível controlar a leitura. Tente novamente.");
    }
    responder(resposta());
  });
})();
