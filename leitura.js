// A fila e as opções pertencem à página e sobrevivem ao fechamento do popup.
(() => {
  let estado = "parado";
  let erro = "";
  let fala = null;
  let trechos = [];
  let indice = 0;
  let total = 0;
  let voz = "";
  let velocidade = 1;
  const velocidades = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const suporte = () => typeof speechSynthesis !== "undefined"
    && typeof SpeechSynthesisUtterance === "function";
  const ativo = () => ["preparando", "lendo", "pausado"].includes(estado);

  function vozesDisponiveis() {
    try { return suporte() ? (speechSynthesis.getVoices?.() || []) : []; }
    catch { return []; }
  }

  function resposta() {
    return {
      estado: suporte() ? estado : "indisponivel", erro,
      progresso: { concluidos: indice, total },
      configuracao: { voz, velocidade },
      vozes: vozesDisponiveis().map((v) => ({ id: v.voiceURI, nome: v.name, idioma: v.lang, local: v.localService }))
    };
  }

  function dividir(texto) {
    const partes = [];
    let inicio = 0;
    while (inicio < texto.length) {
      let fim = Math.min(inicio + 240, texto.length);
      if (fim < texto.length) {
        const janela = texto.slice(inicio, fim);
        const frases = [...janela.matchAll(/[.!?](?:["'”’)]*)\s+|\n+/gu)];
        const ultima = frases.at(-1);
        if (ultima) fim = inicio + ultima.index + ultima[0].length;
        else {
          const espacos = [...janela.matchAll(/\s+/gu)];
          const espaco = espacos.at(-1);
          if (espaco) fim = inicio + espaco.index + espaco[0].length;
          else if (/[\uD800-\uDBFF]/u.test(texto[fim - 1])) fim--;
        }
      }
      partes.push(texto.slice(inicio, fim));
      inicio = fim;
    }
    return partes;
  }

  function falhar(mensagem) {
    fala = null;
    trechos = [];
    estado = "erro";
    erro = mensagem;
  }

  function falhaDeControle() {
    fala = null;
    try { speechSynthesis.cancel(); } catch { /* API indisponível ou defeituosa. */ }
    falhar("Não foi possível controlar a leitura. Tente novamente.");
  }

  function proximo() {
    try {
      // Trechos só de espaços não precisam de síntese, mas contam como percorridos.
      while (indice < total && !trechos[indice].trim()) indice++;
      if (indice === total) {
        fala = null;
        trechos = [];
        estado = "concluido";
        return;
      }
      const escolhida = voz ? vozesDisponiveis().find((v) => v.voiceURI === voz) : null;
      if (voz && !escolhida) {
        falhar("A voz selecionada não está mais disponível. Escolha outra voz e inicie novamente.");
        return;
      }
      const atual = new SpeechSynthesisUtterance(trechos[indice]);
      atual.lang = escolhida?.lang || document.documentElement.lang || "pt-BR";
      if (escolhida) atual.voice = escolhida;
      atual.rate = velocidade;
      fala = atual;
      estado = "preparando";
      atual.onstart = () => {
        if (fala === atual && estado === "preparando") estado = "lendo";
      };
      atual.onend = () => {
        if (fala !== atual) return;
        fala = null;
        indice++;
        if (indice === total) {
          trechos = [];
          estado = "concluido";
        } else if (estado !== "pausado") proximo();
      };
      atual.onerror = (evento) => {
        if (fala !== atual) return;
        falhar(evento.error === "not-allowed"
          ? "O navegador bloqueou a voz. Clique na página e tente ouvir novamente."
          : "Não foi possível reproduzir a voz. Tente novamente ou escolha outra voz.");
      };
      speechSynthesis.speak(atual);
    } catch { falhaDeControle(); }
  }

  function parar() {
    const atual = fala;
    fala = null;
    trechos = [];
    indice = 0;
    total = 0;
    estado = "parado";
    erro = "";
    if (atual) speechSynthesis.cancel();
  }

  window.addEventListener("pagehide", () => {
    try { parar(); } catch { /* A página está sendo encerrada. */ }
  });

  chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    if (mensagem?.acao !== "controlar_leitura") return;
    const comando = mensagem.comando;
    if (!["estado", "configurar", "ouvir", "pausar", "continuar", "parar"].includes(comando)) {
      responder({ ...resposta(), erro: "Comando de leitura inválido." });
      return;
    }
    if (!suporte() || comando === "estado") {
      responder(resposta());
      return;
    }
    try {
      if (comando === "configurar" && !ativo()) {
        if (typeof mensagem.voz !== "string" || !velocidades.includes(mensagem.velocidade)) {
          erro = "Escolha uma voz e uma velocidade válidas.";
        } else if (mensagem.voz && !vozesDisponiveis().some((v) => v.voiceURI === mensagem.voz)) {
          erro = "A voz selecionada não está mais disponível. Escolha outra voz.";
        } else {
          voz = mensagem.voz;
          velocidade = mensagem.velocidade;
          erro = "";
        }
      } else if (comando === "ouvir" && !ativo()) {
        if (typeof mensagem.texto !== "string" || !mensagem.texto.trim()) {
          erro = "Capture um texto não vazio antes de ouvir.";
        } else {
          trechos = dividir(mensagem.texto);
          indice = 0;
          total = trechos.length;
          erro = "";
          // cancel() não remove o estado de pausa da síntese.
          speechSynthesis.resume();
          proximo();
        }
      } else if (comando === "pausar" && ["preparando", "lendo"].includes(estado)) {
        speechSynthesis.pause();
        estado = "pausado";
      } else if (comando === "continuar" && estado === "pausado") {
        speechSynthesis.resume();
        if (fala) estado = "lendo";
        else proximo();
      } else if (comando === "parar") parar();
    } catch { falhaDeControle(); }
    responder(resposta());
  });
})();
