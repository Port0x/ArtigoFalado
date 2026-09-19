# Base de exportação — T5.1

Módulo Node.js no mesmo repositório da extensão, sem dependências adicionais. Esta primeira parte valida o processamento usando um provedor simulado nos testes. Não há servidor HTTP, provedor comercial, credenciais ou conexão com o popup nesta etapa.

## Contrato interno

`exportarWav({ texto, sintetizar, signal, progresso })` retorna uma Promise com `{ arquivo: Buffer, tipo: 'audio/wav' }`.

- `texto`: até 200.000 bytes UTF-8, não vazio e Unicode válido. A divisão preserva o texto, com até 5.000 bytes por trecho e preferência por espaços/pontuação. Essa preferência é heurística e pode dividir palavras longas.
- `sintetizar({ texto, formato, signal })`: função assíncrona fornecida pelo futuro adaptador. Deve retornar `{ pcm: Buffer, codificacao: 'pcm_s16le', canais: 1, taxa: 24000 }`, com amostras de 16 bits little-endian, sem cabeçalho WAV. Não se deve passar diretamente o arquivo LINEAR16/WAV de um fornecedor: o adaptador precisará validar e extrair as amostras.
- `signal`: AbortSignal opcional. O adaptador deve cancelar sua requisição ao receber o sinal. O módulo verifica cancelamento antes e depois de cada chamada e não entrega respostas atrasadas; não consegue interromper à força um provedor que ignore o sinal. Timeout de rede fica pendente para o adaptador.
- `progresso({ concluidos, total })`: observador síncrono opcional, iniciado em zero. Mede trechos sintetizados, não porcentagem de tempo nem download concluído. Se o observador lançar erro, a operação para.

A geração é sequencial, sem tentativas automáticas, e produz um único cabeçalho WAV. Falhas rejeitam a operação sem retornar arquivo parcial. O limite de áudio é 64 MiB de PCM; há cópias em memória, portanto esse valor não representa o consumo total de RAM. Limites globais e concorrência serão necessários antes de expor um servidor.

O módulo não salva arquivos, registra textos ou realiza requisições. O provedor simulado existe somente nos testes e fornece amostras artificiais: elas não representam fala do artigo.

## Verificação

Na raiz do projeto:

```sh
sh scripts/bootstrap.sh
sh scripts/check.sh
```

Os testes cobrem divisão por bytes, Unicode, ordem e integridade das amostras, cabeçalho WAV, progresso, respostas inválidas, erro intermediário, cancelamento e limites. Não comprovam qualidade audível nem funcionamento de um serviço real.

## Próxima parte

Implementar o adaptador de voz real, definir timeout e política de dados/custos, adicionar API com controle de acesso e trabalhos recuperáveis, integrar progresso/download no popup e validar áudio curto e longo em um reprodutor. A T5 permanece aberta até concluir esse fluxo.

Referências: [Buffer no Node.js](https://nodejs.org/docs/latest-v24.x/api/buffer.html) e [estrutura WAVE, com especificações originais vinculadas](https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html).
