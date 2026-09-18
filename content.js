chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.acao !== "pegar_artigo") return;

  try {
    const elemento = document.querySelector("article")
      || document.querySelector("main")
      || document.body;
    const texto = (elemento?.innerText ?? "").trim();
    responder({ titulo: document.title, texto });
  } catch (erro) {
    responder({ erro: "Não foi possível extrair o texto desta página." });
  }
});
