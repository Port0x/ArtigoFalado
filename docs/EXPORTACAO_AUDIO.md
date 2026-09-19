# T5 — Avaliação da exportação de áudio

Avaliação em 19/09/2026. Nenhum mecanismo foi escolhido ou implementado, nenhum serviço foi contratado e nenhum artigo foi enviado nesta avaliação. A leitura atual continua funcionando como na T4.

## O que precisamos acrescentar

A interface de síntese da Web Speech API controla reprodução, vozes e eventos, mas não oferece uma saída de arquivo ou fluxo de áudio. Portanto, a implementação atual não pode simplesmente salvar a fala como MP3. Essa conclusão decorre da [interface documentada de síntese](https://webaudio.github.io/web-speech-api/#tts-section).

## Opções avaliadas

| Aspecto | Google Cloud Text-to-Speech com backend próprio | Piper instalado no computador |
| --- | --- | --- |
| Arquivo | MP3 ou WAV; artigos extensos exigem montagem dos trechos | WAV; MP3 exigiria conversão adicional |
| Instalação | Usuário usa a extensão; projeto mantém servidor e credenciais | Usuário instala motor, modelo de voz e integração com a extensão |
| Texto | Enviado ao nosso backend e ao Google após ação explícita | Processado pelo programa local, após baixar o modelo |
| Custo | Síntese por uso, mais infraestrutura | Processamento e armazenamento locais, sem cobrança de API por caractere |
| Dependência | Rede, conta, cotas e disponibilidade do serviço | Compatibilidade do sistema, modelo e instalação local |

### Serviço com backend

O Google oferece vozes em português brasileiro e saídas MP3 e LINEAR16 com cabeçalho WAV. As vozes de exportação seriam próprias desse serviço: não podemos prometer usar a voz Luciana do macOS. Fontes: [catálogo](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) e [formatos](https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/AudioEncoding).

Na tabela consultada, Standard custa US$ 4 por milhão de caracteres e Neural2, US$ 16. Para 10 mil caracteres, isso equivale a US$ 0,04 ou US$ 0,16, antes das franquias gratuitas. Há franquias mensais de 4 milhões e 1 milhão, respectivamente, mas é necessário ativar faturamento. Servidor, armazenamento, impostos e eventual câmbio não estão incluídos nessa estimativa. Preços devem ser reconferidos antes da contratação. Fonte: [preços oficiais](https://cloud.google.com/text-to-speech/pricing).

A síntese comum aceita até 5.000 bytes por requisição. Não devemos reutilizar o limite de 240 unidades UTF-16 da reprodução: a exportação precisa medir bytes UTF-8, incluindo acentos e emojis, e preservar a ordem. Fonte: [limites da API](https://docs.cloud.google.com/text-to-speech/quotas).

Proposta técnica, ainda não implementada: manter segredos somente no backend; autenticar usuários e limitar consumo; gerar um trabalho identificado que continue ao fechar o popup. Para artigos extensos, montar amostras PCM com parâmetros compatíveis e produzir um único arquivo, sem concatenar cabeçalhos WAV ou presumir que juntar MP3s resulta em arquivo correto. Definir retenção e exclusão dos textos e arquivos, revisar as condições de dados do fornecedor e evitar conteúdo em logs antes de disponibilizar o serviço.

### Geração local

O Piper gera WAV pela interface de linha de comando e exige instalação do motor e download de modelo. A lista inclui português brasileiro. A licença do motor é GPL-3.0; cada voz tem informações próprias no `MODEL_CARD`, que precisam ser conferidas antes de distribuir um pacote. Fontes: [projeto](https://github.com/OHF-Voice/piper1-gpl), [uso e saída WAV](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md) e [vozes e licenças](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md).

Proposta técnica: começar com WAV e um programa auxiliar local. A ponte com o Chrome precisaria ser projetada e validada, com acesso restrito à extensão. Isso muda a instalação simples atual; desempenho, qualidade em português e compatibilidade com o macOS deste projeto ainda precisam de um protótipo. Não instalamos nem executamos o Piper nesta avaliação.

## Recomendação e decisão pendente

Se a prioridade for instalação simples para vários usuários, recomendo testar o caminho com backend e Google Standard, comparando a qualidade com Neural2 antes de decidir. Se a prioridade for manter o texto no computador e evitar cobrança por uso, recomendo prototipar Piper com WAV, aceitando a instalação adicional. São recomendações de arquitetura, não resultados de comparação auditiva.

A próxima decisão é escolher entre serviço externo e programa local. Depois disso, definir voz, formato inicial, limite de artigo, orçamento ou requisitos da máquina e comportamento ao cancelar. A exportação deve ter controles próprios e não interromper a leitura da T4.

## Validação exigida na implementação

- Testes unitários: texto vazio, acentos/emojis, limites, reconstrução sem perda, ordem, erro no meio da geração, cancelamento e respostas atrasadas.
- Integração: falha de rede/cota/autenticação ou programa local ausente; reabertura do popup sem duplicar o trabalho; falha no download e limpeza de arquivos temporários.
- Arquivo real: conferir formato, duração, início/fim e transições dos trechos; abrir em reprodutor comum e ouvir um artigo curto e um longo até o fim.
- Conferir permissões reais no Chrome e garantir que exportar somente ocorra após ação explícita. Mocks não comprovam áudio íntegro, qualidade de voz ou compatibilidade do programa auxiliar.

Esta etapa entrega pesquisa e proposta. Não há testes de exportação executados nem critérios de implementação da T5 concluídos.
