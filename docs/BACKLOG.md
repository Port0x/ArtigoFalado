# Tarefas de evolução

As tarefas foram publicadas no [GitHub](https://github.com/Port0x/ArtigoFalado/issues). Os identificadores T1–T5 são locais; os links abaixo apontam para as issues correspondentes. T1–T4 implementadas; T5 continua planejada.

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
- [x] Uma página com `article` retorna o texto desse elemento.
- [x] Uma página sem `article`, mas com `main`, usa `main`.
- [x] A ausência dos dois elementos usa o corpo da página.
- [x] Conteúdo vazio recebe tratamento explícito.
- [x] Documentar que menus e anúncios ainda podem aparecer no resultado.
- [x] A captura atual do título continua funcionando.

**Validação:** sintaxe e 39 testes automatizados aprovados, incluindo integração dos scripts com mocks. No Chrome, captura do título em página real e orientação em página restrita verificadas. As alternativas de extração e os casos de borda foram verificados com DOM simulado; a compatibilidade com todos os sites não está garantida.

**Próxima etapa:** T2 pode começar com o contrato `{ titulo, texto }` e o retorno `{ erro }` definidos. A conferência visual do texto extraído será parte dessa etapa.

## T2 — Exibir o texto capturado no popup

**Depende de:** T1.

**Objetivo:** permitir conferir o artigo antes de iniciar a leitura.

**Escopo:** adicionar uma área de texto somente leitura, apresentar título e texto e ajustar o tamanho do popup com rolagem.

**Critérios de aceite:**
- [x] O texto recebido aparece sem ser interpretado como HTML.
- [x] Textos longos podem ser percorridos sem quebrar o layout.
- [x] Há indicação de carregamento, conteúdo vazio e erro de comunicação.
- [x] O botão e os campos têm nomes acessíveis e são utilizáveis por teclado.

**Validação:** 50 testes aprovados em `sh scripts/check.sh`. No Chrome, texto longo exibido, rolagem até o fim por teclado, campo somente leitura e erro em página restrita confirmados. Casos de conteúdo vazio, HTML literal, falhas e limpeza de resultados anteriores cobertos por testes com mocks.

## T3 — Ler o artigo em voz alta e controlar a reprodução

**Depende de:** T1 e T2.

**Objetivo:** ouvir o texto com a síntese de voz do navegador.

**Escopo:** implementar comandos de ouvir, pausar, continuar e parar; manter o controle de reprodução fora do ciclo de vida do popup, inicialmente no script da página. Esta tarefa não gera arquivo de áudio.

**Critérios de aceite:**
- [x] Um clique explícito inicia a leitura de um texto não vazio.
- [x] Pausar, continuar e parar têm os efeitos esperados.
- [x] Fechar o popup não encerra a leitura em andamento.
- [x] Reabrir o popup permite recuperar o estado da leitura na aba.
- [x] Cliques repetidos não sobrepõem leituras na mesma aba.
- [x] Falta de suporte ou erro de síntese produz uma mensagem compreensível.
- [x] Documentar o comportamento ao atualizar, navegar ou fechar a aba.

**Validação:** sintaxe e 92 testes aprovados. No Chrome, estados de leitura, pausa, continuação, parada e recuperação após reabrir o popup conferidos. A qualidade audível e a reprodução integral de texto longo ainda precisam de conferência por escuta. T3 publicada, com workflow aprovado e issue #3 fechada.

## T4 — Melhorar leitura de textos longos e seleção de voz

**Depende de:** T3.

**Objetivo:** tornar a reprodução de artigos extensos mais controlável.

**Escopo:** dividir o texto em trechos respeitando frases quando possível, mostrar progresso por trecho e permitir selecionar voz e velocidade entre as opções disponíveis.

**Critérios de aceite:**
- [x] Os trechos são lidos na ordem, sem repetição ou omissão introduzida pela divisão.
- [x] Parar cancela também os trechos pendentes.
- [x] Pausar e continuar preservam a posição na fila.
- [x] Vozes carregadas de forma assíncrona aparecem na interface.
- [x] A ausência de uma voz em português tem alternativa explícita.
- [x] A leitura é verificada com artigo curto e artigo longo.

**Validação:** 122 testes e sintaxe aprovados. No Chrome, leitura curta concluída (1/1) e artigo longo acompanhado até 8/79, com voz local Luciana a 2×, pausa, continuação, recuperação do progresso e cancelamento. Não houve escuta integral do artigo longo. T4 publicada no commit `2223c16`, com [workflow aprovado](https://github.com/Port0x/ArtigoFalado/actions/runs/35439494554) e issue #4 fechada.

## T5 — Avaliar e implementar exportação de áudio

**Depende de:** T1 e T2. Pode ser planejada após a validação da leitura no navegador.

**Objetivo:** permitir baixar o artigo como arquivo de áudio.

**Avaliação:** opções de serviço com backend e geração local registradas em [EXPORTACAO_AUDIO.md](EXPORTACAO_AUDIO.md). Escolha do mecanismo e implementação continuam pendentes.

**Escopo inicial:** avaliar um mecanismo de texto para fala que produza arquivo, definir formato, limites, custos e tratamento dos dados antes de implementar. Não assumir que a leitura do navegador fornece um MP3.

**Critérios de aceite:**
- [ ] Registrar a opção escolhida e suas limitações.
- [ ] Se houver serviço externo, informar quais dados são enviados e não embutir chaves secretas na extensão.
- [ ] Mostrar progresso e erros de geração.
- [ ] O arquivo baixado contém o texto solicitado e abre em um reprodutor comum.
- [ ] Documentar instalação e configuração adicionais, quando necessárias.
