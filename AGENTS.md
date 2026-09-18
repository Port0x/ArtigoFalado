# Instruções para o Codex

## Projeto

- Responder em português brasileiro e explicar mudanças de forma acessível.
- ArtigoFalado é uma extensão Chrome Manifest V3, feita com JavaScript e HTML, sem build ou dependências nesta etapa.
- A versão 0.1.0 captura apenas o título da página. Não apresentar recursos planejados como implementados.
- Implementar somente o escopo solicitado. Consultar README.md e docs/BACKLOG.md para contexto.
- Repositório remoto: `Port0x/ArtigoFalado` (privado). Usar `sh scripts/github.sh` para o GitHub CLI quando `gh` não estiver no PATH.

## Verificação

- Antes de editar, inspecionar os arquivos relevantes e o estado do Git.
- Em toda tarefa, executar `sh scripts/check.sh`, que verifica sintaxe e roda toda a suíte unitária. Não fazer commit ou push com testes falhando ou sem conseguir executá-los.
- Para cada funcionalidade ou correção, adicionar ou atualizar testes unitários de sucesso, erro e casos de borda aplicáveis. Cada etapa do backlog deve entregar os testes correspondentes.
- Usar `node:test` e mocks das APIs Chrome/DOM. Os testes unitários não substituem a verificação real de permissões e comportamento no navegador.
- Preparar o ambiente com `sh scripts/bootstrap.sh`; ativar hooks com `npm run setup` (ou o bootstrap) após inicializar/clonar o Git. Nunca usar `--no-verify` para contornar os testes.
- Verificar o comportamento no Chrome quando houver acesso. Se não houver, informar a limitação; nunca declarar teste que não foi executado.
- Atualizar o README quando a instalação, o comportamento ou as permissões mudarem.

## Commits ao concluir tarefas

- O usuário solicita commits automáticos pelo agente ao concluir tarefas de implementação neste projeto. Não pedir confirmação rotineira para cada commit dentro do escopo solicitado; respeitar as permissões exigidas pelo ambiente.
- Revisar o diff, verificar os arquivos e criar um commit por mudança lógica concluída.
- Usar mensagens curtas em português com prefixos `feat:`, `fix:`, `docs:` ou `chore:`.
- Adicionar arquivos explicitamente ao staging. Não incluir alterações preexistentes e alheias à tarefa, credenciais, arquivos locais ou artefatos temporários.
- Se uma verificação falhar, corrigir antes do commit. Se faltar uma ferramenta, preparar o ambiente; se isso estiver bloqueado, registrar a limitação e deixar commit e push pendentes.
- Não inventar nome ou email de autor. Se não houver identidade configurada, solicitar a informação necessária.
- Não reescrever histórico, fazer force push ou descartar alterações do usuário.
- Fazer push quando a tarefa autorizar publicação e houver destino autenticado; a orientação de commit automático, sozinha, não implica publicação de toda tarefa futura.
- Ao finalizar, informar o hash do commit, as verificações realizadas e se houve push. Se houver bloqueio, explicar qual etapa ficou pendente.
- Estas instruções orientam sessões do agente; não instalam um monitor ou agendamento em segundo plano.
