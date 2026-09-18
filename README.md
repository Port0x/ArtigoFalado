# ArtigoFalado

Extensão para Google Chrome com o objetivo de transformar artigos da web em leitura em voz alta.

[Repositório](https://github.com/Port0x/ArtigoFalado) · [Issues](https://github.com/Port0x/ArtigoFalado/issues) · [Execuções dos testes](https://github.com/Port0x/ArtigoFalado/actions)

**Etapa atual — T1 e T2 implementadas sobre a versão 0.1.0:** a extensão captura e exibe título e texto bruto da aba ativa. O texto aparece em um campo somente leitura com rolagem. A reprodução de áudio ainda está planejada.

## O que já funciona

- Popup com o botão **Ler página**.
- Comunicação entre o popup e o script executado na página.
- Captura de `document.title` e apresentação do título.
- Exibição do texto completo capturado em campo somente leitura, com seleção, cópia e rolagem por teclado.
- Extração de `innerText` do primeiro `article`, depois `main` e, na ausência dos dois, `document.body`.
- Remoção de espaços nas extremidades e aviso explícito para conteúdo vazio.
- Mensagem de orientação quando não é possível acessar a página.

Apesar do nome do botão, esta etapa ainda não lê o artigo em voz alta.

## Instalação local

1. Baixe o repositório e extraia o ZIP, ou clone-o com Git.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta que contém `manifest.json`.
6. Abra ou atualize a página de um site HTTP/HTTPS.
7. Abra o ArtigoFalado pelo menu de extensões e clique em **Ler página**.

O título da página deve aparecer abaixo do botão e o conteúdo capturado no campo **Texto do artigo**. Não é necessário instalar dependências, configurar servidor ou executar um build para usar esta versão.

## Como o código funciona

```text
Clique em Ler página
  → popup.js encontra a aba ativa
  → envia a mensagem { acao: "pegar_artigo" }
  → content.js consulta document.title e extrai innerText de article, main ou body
  → responde com { titulo: "...", texto: "..." } ou { erro: "..." }
  → popup.js mostra o título em #status e o texto em #texto, com aviso para conteúdo vazio
```

| Arquivo | Responsabilidade |
| --- | --- |
| `manifest.json` | Declara a extensão Manifest V3, as permissões, o popup e o script de conteúdo. |
| `popup.html` | Define o botão, o status e o campo de texto somente leitura com rótulo acessível. |
| `popup.css` | Controla o tamanho do popup, a rolagem e os indicadores de foco. |
| `popup.js` | Consulta a aba, envia a mensagem e trata a resposta ou o erro. |
| `content.js` | Recebe a solicitação na página e retorna título e texto bruto, ou um erro de extração. |
| `AGENTS.md` | Orienta o Codex sobre desenvolvimento, validação e commits. |
| `docs/BACKLOG.md` | Descreve as tarefas de evolução e seus critérios de aceite. |

## Permissões e dados

O manifesto declara `activeTab` e um script de conteúdo com correspondência `<all_urls>`. Portanto, o script está configurado para ser carregado nas páginas compatíveis permitidas pelo navegador; a captura do título e do texto é solicitada pelo botão.

O código atual não envia o conteúdo para servidores, não usa uma API de IA e não armazena o artigo. O título e o texto não são registrados no console.

A extração é simples: menus, anúncios e outros conteúdos podem aparecer no resultado, especialmente ao usar o corpo da página. Um `article` ou `main` existente, mas vazio, produz texto vazio; a busca por alternativas ocorre apenas quando o elemento não existe. Espaços internos e quebras de linha são preservados. Não há acesso especial a conteúdo em iframes ou shadow DOM.

## Desenvolvimento e verificação

Após alterar o código, recarregue a extensão em `chrome://extensions` e atualize a aba do site para carregar a nova versão de `content.js`.

Verificação manual:

- Em um site HTTP/HTTPS, clicar no botão deve mostrar o título da aba.
- Repetir em outra aba deve mostrar o título correspondente.
- Em uma página sem título, deve aparecer **A página não tem título.**
- Em uma página restrita, deve aparecer uma orientação, sem deixar o popup preso em **Buscando artigo…**.

Para preparar o ambiente de desenvolvimento no macOS ou Linux:

```sh
sh scripts/bootstrap.sh
```

Esse comando baixa Node.js 24.21.0 do site oficial, verifica o SHA-256 e o instala em `.tools/node`, dentro do projeto, sem alterar o Node de outros projetos. Executa a suíte e, quando o repositório Git já existe, ativa os hooks. A pasta `.tools` não é versionada.

Para rodar todas as verificações a qualquer momento:

```sh
sh scripts/check.sh
```

### Testes e automação

Os testes em `tests/` usam o executor nativo `node:test`, com as APIs Chrome e DOM simuladas. Cobrem captura do título, atualização do título, mensagens desconhecidas, estados do popup, aba ausente, título vazio, falhas de comunicação, recuperação e integridade dos arquivos referenciados pelo manifesto.

- **Antes de commit:** o hook executa sintaxe e testes. Mudanças rastreadas fora do staging bloqueiam o commit para evitar testar uma versão diferente da registrada; revise os arquivos e adicione apenas os da tarefa.
- **Antes de push:** o hook executa novamente a suíte local.
- **No GitHub:** o workflow `Testes` executa em push, pull request e acionamento manual.
- **A cada evolução:** funcionalidades e correções precisam dos testes correspondentes, conforme `AGENTS.md` e o backlog.

Hooks são locais e precisam ser ativados em cada clone com o bootstrap ou `npm run setup`. O workflow verifica os commits enviados, mas não impede sozinho merges: isso exige configurar uma regra de proteção de branch que torne o check obrigatório. Testes unitários com mocks não verificam permissões reais, reprodução de áudio ou a interface completa do navegador; mantenha também a conferência manual acima.

Referências: [executor de testes do Node.js](https://nodejs.org/api/test.html) e [configuração de Node no GitHub Actions](https://github.com/actions/setup-node).

### Verificação da T1

Execute `sh scripts/check.sh` para verificar a sintaxe e toda a suíte `node:test`. Os testes cobrem prioridade dos elementos, texto vazio e longo, título atualizado, erros de extração, respostas inválidas, recuperação e comunicação entre os scripts com APIs simuladas. Eles não garantem o comportamento em todos os sites nem substituem testes no Chrome.

No Chrome, recarregue a extensão e a página. Confira o título em um site comum, o aviso **Nenhum texto encontrado nesta página.** em conteúdo vazio e a orientação de acesso em uma página restrita. O texto completo capturado já pode ser conferido no campo **Texto do artigo** (T2).

### Verificação da T2

Use Tab para focar **Ler página**, Enter para capturar e Tab para acessar **Texto do artigo**. O campo permite selecionar, copiar e percorrer o texto, mas não editar. Textos longos têm rolagem interna. Ao capturar novamente, o conteúdo anterior é limpo e o botão fica desabilitado até a resposta. Fechar o popup descarta o resultado; reabra e capture novamente.

Os testes incluem conteúdo literal semelhante a HTML, texto de 150 mil caracteres, limpeza após erros e bloqueio de capturas simultâneas. No Chrome foram conferidos artigo longo, rolagem até o fim, navegação por teclado, campo somente leitura e erro em página restrita. Conteúdo vazio e respostas inválidas também são cobertos com mocks.

## Problemas comuns

**Não foi possível acessar esta página:** atualize a página depois de instalar ou recarregar a extensão. Páginas internas como `chrome://extensions` e outras páginas protegidas pelo navegador não aceitam o script normalmente. Teste em um site HTTP/HTTPS comum.

**Não sai áudio:** isso é esperado nesta versão. A funcionalidade atual captura título e texto, mas ainda não reproduz áudio.

**O código mudou, mas o comportamento continua igual:** recarregue a extensão e a página, depois feche e abra novamente o popup.

## Próximas etapas

1. Extração do texto bruto do artigo — implementada (T1).
2. Exibição do texto no popup para conferência — implementada (T2).
3. Implementar leitura em voz alta com controles.
4. Melhorar a leitura de textos longos e a escolha da voz.
5. Avaliar a geração de um arquivo de áudio para download.

O escopo e os critérios de conclusão estão em [docs/BACKLOG.md](docs/BACKLOG.md). T1 e T2 estão implementadas; T3–T5 continuam planejadas.
