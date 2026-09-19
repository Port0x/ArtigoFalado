# Funcionamento e manutenção

Os testes unitários verificam nossa lógica com APIs simuladas. Um resultado verde no GitHub não comprova voz audível, permissões reais, compatibilidade com todos os sites ou comportamento após uma atualização do Chrome.

## Antes de publicar uma versão

1. Executar `sh scripts/check.sh` e conferir o workflow do commit publicado.
2. Recarregar a extensão e a página no Chrome. Capturar artigos curto e longo; conferir se o texto corresponde ao esperado.
3. Ouvir com uma voz local, acompanhar a passagem de trechos, pausar, continuar, fechar e reabrir o popup e parar. Conferir por escuta o começo, transições e término.
4. Verificar página restrita, conteúdo vazio, vozes ausentes e uma voz remota quando aplicável. Ao atualizar a página, a fila deve terminar.
5. Registrar versão do Chrome, sistema e voz usados. Antes de distribuir uma nova versão, atualizar em conjunto `manifest.json` e `package.json` e conferir as instruções de instalação.

Repetir a verificação real após mudanças relevantes no Chrome, nas vozes do sistema, nas permissões ou na arquitetura da extensão. Os hooks e o workflow atual executam testes unitários; não há monitor de compatibilidade em segundo plano.

## Limitações e prioridades futuras

- **Extração:** `article`, `main` e `body` são uma heurística simples. Sites podem mudar de estrutura, carregar texto depois ou incluir menus e anúncios. A conferência no popup continua necessária; extração mais seletiva requer uma tarefa própria.
- **Síntese:** a divisão em trechos reduz o tamanho de cada fala, mas não elimina falhas do motor de voz, bloqueios de reprodução ou problemas de rede. Não há repetição automática após erro, para evitar duplicar texto que já foi ouvido.
- **Navegação:** a fila e as opções vivem na página. Recarregar ou trocar de documento encerra a leitura; reabrir apenas o popup recupera seu estado. Persistência após navegação ainda não existe.
- **Abas e site:** abas diferentes podem falar ao mesmo tempo. A síntese iniciada pelo próprio site pode interagir com os controles da mesma página. Coordenação entre abas ou isolamento do motor precisariam de outra etapa.
- **Privacidade e distribuição:** vozes remotas podem usar serviços do fornecedor. A interface identifica vozes locais/remotas. Antes de distribuir publicamente, revisar a necessidade do carregamento em `<all_urls>` e considerar injeção apenas por clique, com teste das permissões e de atualização da extensão.
- **Ferramentas:** atualizar Node, GitHub Actions e scripts de preparação de forma explícita, executando a suíte após cada atualização. O projeto continua sem dependências npm e sem build.

Referências: [síntese de voz, limites e vozes locais/remotas](https://webaudio.github.io/web-speech-api/) e [histórico da exigência de interação do usuário no Chrome](https://developer.chrome.com/blog/chrome-71-deps-rems/).


## Exportação T5 — implementação em validação

A suíte atual tem 173 testes. Foram verificados com mocks e HTTP em loopback: requisição Google, validação WAV, geração sequencial, autenticação/origem, limites, expiração, cancelamento, recuperação da página, consentimento, limpeza de dados e solicitação de download. Nenhuma chamada de síntese real foi executada.

O acesso automatizado a `chrome://extensions` foi bloqueado pela política de segurança do navegador. A recarga e a conferência das novas permissões ficaram pendentes de ação manual. Isso não equivale a uma falha funcional observada na extensão.

Antes de fechar a issue #5:

- [ ] Recarregar extensão/página, confirmar armazenamento de sessão e acesso ao backend local.
- [ ] Configurar conta/projeto Google e token OAuth no backend, conforme `backend/README.md`.
- [ ] Gerar artigo curto, baixar WAV e abrir em reprodutor comum.
- [ ] Ouvir um artigo longo até o fim, conferindo ordem e transições.
- [ ] Conferir cancelamento, recarga da página de exportação e expiração do arquivo.
- [ ] Conferir mensagens para token local errado, acesso Google expirado, cota e backend desligado.
- [ ] Conferir limpeza de dados e navegação por teclado.
