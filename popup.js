document.getElementById("ler").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Buscando título…";

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
      acao: "pegar_titulo"
    });

    status.textContent = resposta?.titulo || "A página não tem título.";
  } catch (erro) {
    console.error("Não foi possível acessar a página:", erro);
    status.textContent = "Não foi possível acessar esta página. Abra um site comum (http ou https), atualize a página e tente novamente.";
  }
});
