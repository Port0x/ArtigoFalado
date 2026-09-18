# Tarefas de evolução

As tarefas foram publicadas no [GitHub](https://github.com/Port0x/ArtigoFalado/issues). Os identificadores T1–T5 são locais; os links abaixo apontam para as issues correspondentes. Todas as tarefas abaixo estão planejadas.

| Etapa | Issue |
| --- | --- |
| T1 — Extração do texto | [#1](https://github.com/Port0x/ArtigoFalado/issues/1) |
| T2 — Exibição no popup | [#2](https://github.com/Port0x/ArtigoFalado/issues/2) |
| T3 — Leitura e controles | [#3](https://github.com/Port0x/ArtigoFalado/issues/3) |
| T4 — Textos longos e vozes | [#4](https://github.com/Port0x/ArtigoFalado/issues/4) |
| T5 — Exportação de áudio | [#5](https://github.com/Port0x/ArtigoFalado/issues/5) |

## Qualidade obrigatória em todas as etapas

- Adicionar ou atualizar testes unitários para o comportamento implementado, incluindo sucesso, erros e casos de borda relevantes.
- Executar `sh scripts/check.sh` e manter a suíte inteira passando antes de commit e push.
- Conferir o resultado do workflow Testes no GitHub e realizar a verificação manual aplicável no Chrome.
- Na extração, testar as alternativas de elementos e conteúdo vazio; no popup, estados de interface; no áudio, simular a síntese de voz para testar comandos, fila, cancelamento e erros sem depender de som real.

## T1 — Extrair o texto bruto do artigo

**Objetivo:** retornar o conteúdo textual da página, além do título.

**Escopo:** em `content.js`, buscar `article`, depois `main` e, como alternativa, `document.body`; capturar `innerText`, remover espaços nas extremidades e responder com título e texto. Renomear a ação para `pegar_artigo` nos dois scripts. Não incluir áudio nesta tarefa.

**Critérios de aceite:**
- [ ] Uma página com `article` retorna o texto desse elemento.
- [ ] Uma página sem `article`, mas com `main`, usa `main`.
- [ ] A ausência dos dois elementos usa o corpo da página.
- [ ] Conteúdo vazio recebe tratamento explícito.
- [ ] Documentar que menus e anúncios ainda podem aparecer no resultado.
- [ ] A captura atual do título continua funcionando.

## T2 — Exibir o texto capturado no popup

**Depende de:** T1.

**Objetivo:** permitir conferir o artigo antes de iniciar a leitura.

**Escopo:** adicionar uma área de texto somente leitura, apresentar título e texto e ajustar o tamanho do popup com rolagem.

**Critérios de aceite:**
- [ ] O texto recebido aparece sem ser interpretado como HTML.
- [ ] Textos longos podem ser percorridos sem quebrar o layout.
- [ ] Há indicação de carregamento, conteúdo vazio e erro de comunicação.
- [ ] O botão e os campos têm nomes acessíveis e são utilizáveis por teclado.

## T3 — Ler o artigo em voz alta e controlar a reprodução

**Depende de:** T1 e T2.

**Objetivo:** ouvir o texto com a síntese de voz do navegador.

**Escopo:** implementar comandos de ouvir, pausar, continuar e parar; manter o controle de reprodução fora do ciclo de vida do popup, inicialmente no script da página. Esta tarefa não gera arquivo de áudio.

**Critérios de aceite:**
- [ ] Um clique explícito inicia a leitura de um texto não vazio.
- [ ] Pausar, continuar e parar têm os efeitos esperados.
- [ ] Fechar o popup não encerra a leitura em andamento.
- [ ] Reabrir o popup permite recuperar o estado da leitura na aba.
- [ ] Cliques repetidos não sobrepõem leituras na mesma aba.
- [ ] Falta de suporte ou erro de síntese produz uma mensagem compreensível.
- [ ] Documentar o comportamento ao atualizar, navegar ou fechar a aba.

## T4 — Melhorar leitura de textos longos e seleção de voz

**Depende de:** T3.

**Objetivo:** tornar a reprodução de artigos extensos mais controlável.

**Escopo:** dividir o texto em trechos respeitando frases quando possível, mostrar progresso por trecho e permitir selecionar voz e velocidade entre as opções disponíveis.

**Critérios de aceite:**
- [ ] Os trechos são lidos na ordem, sem repetição ou omissão introduzida pela divisão.
- [ ] Parar cancela também os trechos pendentes.
- [ ] Pausar e continuar preservam a posição na fila.
- [ ] Vozes carregadas de forma assíncrona aparecem na interface.
- [ ] A ausência de uma voz em português tem alternativa explícita.
- [ ] A leitura é verificada com artigo curto e artigo longo.

## T5 — Avaliar e implementar exportação de áudio

**Depende de:** T1 e T2. Pode ser planejada após a validação da leitura no navegador.

**Objetivo:** permitir baixar o artigo como arquivo de áudio.

**Escopo inicial:** avaliar um mecanismo de texto para fala que produza arquivo, definir formato, limites, custos e tratamento dos dados antes de implementar. Não assumir que a leitura do navegador fornece um MP3.

**Critérios de aceite:**
- [ ] Registrar a opção escolhida e suas limitações.
- [ ] Se houver serviço externo, informar quais dados são enviados e não embutir chaves secretas na extensão.
- [ ] Mostrar progresso e erros de geração.
- [ ] O arquivo baixado contém o texto solicitado e abre em um reprodutor comum.
- [ ] Documentar instalação e configuração adicionais, quando necessárias.
