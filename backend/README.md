# Exportação local com backend Node.js — T5

O backend fica neste repositório, sem pacotes npm adicionais, e atende somente em `127.0.0.1:8787`. A síntese real usa Google Cloud Text-to-Speech, voz **pt-BR-Standard-A**, velocidade **1×**, com saída **WAV mono, PCM 16 bits a 24 kHz**. A escolha de voz/velocidade da reprodução no navegador é independente.

O adaptador e o fluxo estão implementados e cobertos com respostas simuladas. A geração com conta real e a escuta completa ainda precisam ser validadas. Este servidor é para uso local individual; não está pronto para hospedagem pública ou múltiplos usuários.

## Configuração

1. Na raiz, execute `sh scripts/bootstrap.sh`. Ele prepara Node.js 24 e os hooks. Se usar o Node instalado pelo projeto, acrescente `.tools/node/bin` ao PATH desta sessão ou use `.tools/node/bin/node` nos comandos Node abaixo.
2. Em uma conta Google Cloud sua, escolha um projeto, habilite faturamento e a Cloud Text-to-Speech API. Isso pode gerar custos; nada é contratado pelo código. Configure a CLI oficial `gcloud` com sua conta e as permissões do projeto, seguindo a [preparação oficial](https://docs.cloud.google.com/text-to-speech/docs/before-you-begin).
3. Copie `.env.example` para `.env`. O arquivo `.env` é ignorado pelo Git. Preencha `GOOGLE_CLOUD_PROJECT` e o `EXTENSION_ID` exibido para a extensão em `chrome://extensions`.
4. Gere `ARTIGOFALADO_TOKEN` com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` e salve o valor no `.env`. Esse é o token **local**, diferente da credencial Google.
5. Obtenha o token OAuth temporário com `gcloud auth print-access-token` e coloque-o em `GOOGLE_ACCESS_TOKEN`. Não envie esse token em issues, capturas de tela ou conversas. O backend usa Bearer e o projeto de cota; ao expirar o acesso, renove o token e reinicie o backend. Não há renovação automática nesta versão. Veja o [exemplo oficial de síntese via REST](https://docs.cloud.google.com/text-to-speech/docs/create-audio-text-command-line).
6. Execute `node --env-file=.env backend/servidor.cjs` (ou `npm run backend`). O servidor informa o endereço, sem imprimir tokens ou artigos. Para encerrar, use Ctrl+C.
7. Recarregue a extensão e a página do artigo. Capture o texto e clique em **Exportar áudio…**. Na nova página, abra **Configurar conexão local** e informe somente o `ARTIGOFALADO_TOKEN`.
8. Confira o texto, marque a autorização de envio e clique em **Gerar WAV**. Ao terminar, clique em **Baixar WAV**.

Não é necessário configurar o backend para continuar usando a leitura em voz alta da T4. O programa normal não oferece modo de áudio falso: o provedor simulado está restrito aos testes.

## Dados, custos e limites

- Somente o texto capturado é enviado para síntese. A URL e o título da página não são enviados pelo fluxo. O texto vai da extensão ao backend local e, por HTTPS, ao Google; o fornecedor processa esses dados conforme suas condições. O usuário autoriza na página antes de gerar.
- A credencial Google permanece no `.env`/memória do backend. O token local e o snapshot do artigo ficam em `chrome.storage.session`, não no armazenamento persistente. Essa área não é exposta aos scripts de conteúdo por padrão; o projeto não amplia esse acesso.
- **Limpar dados** tenta cancelar/apagar o resultado no backend e remove o snapshot e o token da sessão. Se o backend estiver indisponível, a interface informa que o cancelamento remoto não foi confirmado. O token compartilhado pode continuar em memória em outras páginas de exportação abertas.
- Fechar o popup ou a página de exportação não cancela um pedido já aceito pelo servidor. Recarregar a mesma página recupera seu estado. Fechar/reiniciar o navegador perde o armazenamento de sessão; reiniciar o servidor perde todos os trabalhos.
- Até quatro snapshots são mantidos pela interface. Ao abrir outra exportação, registros com mais de uma hora são removidos. Fechar uma aba não remove seu snapshot imediatamente; use **Limpar dados**.
- Limite de 200.000 bytes UTF-8 por texto e por hora no servidor, uma geração ativa e quatro trabalhos retidos. A cota horária é conservadora, inclui tentativas aceitas que falhem e é reiniciada com o processo; não substitui controle de faturamento no Google.
- Cada trecho tem até 5.000 bytes. Máximo de 64 MiB de PCM por arquivo, 30 segundos por chamada Google e 10 minutos por trabalho. O áudio completo fica em memória, com cópias; o consumo de RAM pode exceder 64 MiB.
- Arquivos e estados terminados expiram após 10 minutos (limpeza periódica ou na próxima consulta). O texto não é registrado em logs nem salvo pelo backend. Não há retries automáticos de síntese: repetir um ID ainda retido consulta o mesmo trabalho. Depois da expiração, o servidor não mantém histórico de IDs.
- O formato WAV é maior que MP3. A divisão é heurística e pode introduzir pausas nas transições; qualidade e continuidade exigem escuta real. Preços e alternativas estão na [avaliação da T5](../docs/EXPORTACAO_AUDIO.md).

## API local

Todas as rotas exigem `Authorization: Bearer <ARTIGOFALADO_TOKEN>`. Requisições com Origin só são aceitas do ID configurado. O corpo POST usa `Content-Type: application/json`. Não habilite acesso de rede nem use este token compartilhado como autenticação de um serviço público.

| Operação | Resultado |
| --- | --- |
| `POST /jobs/<UUID>` com `{ "texto": "..." }` | Cria trabalho ou retorna o já existente para esse ID. |
| `GET /jobs/<UUID>` | Estado, trechos concluídos/total e erro genérico. |
| `GET /jobs/<UUID>/audio` | Arquivo WAV quando concluído. |
| `DELETE /jobs/<UUID>` | Cancela a geração e descarta o áudio armazenado. |

Estados: `gerando`, `concluido`, `erro`, `cancelado`. O progresso mede trechos sintetizados, não duração nem conclusão do download. Se uma solicitação falhar sem confirmar recebimento, a página orienta consultar o mesmo trabalho antes de abrir outra exportação.

## Módulos e testes

- `exportacao.cjs`: divide o texto, chama um provedor sequencialmente, valida PCM, monta WAV e trata cancelamento.
- `google.cjs`: faz a requisição REST, limita tempo/tamanho da resposta e extrai as amostras de um WAV validado, inclusive quando há chunks de metadados.
- `servidor.cjs`: autenticação local, trabalhos em memória, limites e download.

Execute `sh scripts/check.sh`. A suíte inclui integração HTTP em loopback e precisa de permissão para abrir portas locais. Os testes não usam credenciais e não chamam o Google.

Antes de considerar T5 concluída: testar credenciais reais, permissões no Chrome, download em reprodutor comum, artigo curto e longo por escuta integral, cancelamento, expiração e falhas de acesso/cota. O projeto não declara essas verificações como concluídas só porque os mocks passam.
