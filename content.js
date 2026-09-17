chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem.acao === "pegar_titulo") {
    console.log("Título da página:", document.title);
    responder({ titulo: document.title });
  }
});
