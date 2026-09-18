document.getElementById("ler").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Buscando artigo…";

  try {
    const [aba] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!aba?.id) {
      status.textContent = "Nenhuma aba ativa encontrada.";
      return;
    }

    const resposta = await chrome.tabs.sendMessage(aba.id, {
      acao: "pegar_artigo"
    });

    if (resposta?.erro) {
      status.textContent = "Não foi possível extrair o texto desta página.";
      return;
    }

    if (typeof resposta?.titulo !== "string" || typeof resposta?.texto !== "string") {
      throw new Error("Resposta inválida ao solicitar o artigo.");
    }

    const titulo = resposta.titulo || "A página não tem título.";
    status.textContent = resposta.texto.trim()
      ? titulo
      : `${titulo} — Nenhum texto encontrado nesta página.`;
  } catch (erro) {
    console.error("Não foi possível acessar a página:", erro);
    status.textContent = "Não foi possível acessar esta página. Abra um site comum (http ou https), atualize a página e tente novamente.";
  }
});
