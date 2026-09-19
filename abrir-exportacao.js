(() => {
  const botao = document.getElementById('abrir-exportacao');
  const aviso = document.getElementById('aviso-exportacao');
  botao.addEventListener('click', async () => {
    if (botao.disabled) return;
    const texto = document.getElementById('texto').value;
    if (!texto.trim()) { aviso.textContent = 'Capture um texto antes de exportar.'; return; }
    if (new TextEncoder().encode(texto).length > 200000) { aviso.textContent = 'O texto excede o limite de 200.000 bytes para exportação.'; return; }
    botao.disabled = true;
    let chave;
    try {
      const registros = await chrome.storage.session.get(null);
      const antigos = Object.keys(registros).filter(k => k.startsWith('exportacao:') && Date.now() - registros[k].criado > 3600000);
      await chrome.storage.session.remove(antigos);
      if (Object.keys(registros).filter(k => k.startsWith('exportacao:') && !antigos.includes(k)).length >= 4) {
        aviso.textContent = 'Há quatro páginas de exportação. Use “Limpar dados” em uma delas antes de abrir outra.'; return;
      }
      const id = crypto.randomUUID(); chave = `exportacao:${id}`;
      await chrome.storage.session.set({ [chave]: { texto, criado: Date.now(), iniciado: false } });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`exportar.html#${id}`) });
      aviso.textContent = 'Confira as opções na página de exportação.';
    } catch { if (chave) await chrome.storage.session.remove(chave).catch(() => {}); aviso.textContent = 'Não foi possível abrir a exportação.'; }
    finally { botao.disabled = false; }
  });
})();
