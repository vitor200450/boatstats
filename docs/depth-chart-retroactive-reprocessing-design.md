# Design - Reprocessamento Retroativo de Standings (DEPTH_CHART)

## Status

- Estado: validado em brainstorming
- Escopo: design funcional e tecnico (sem implementacao)
- Data: 2026-03-16

## Understanding Summary

- O problema ocorre em temporadas com `DEPTH_CHART` quando mudancas retroativas (transferencias e alteracoes de prioridade) distorcem standings ja consolidadas.
- O objetivo e corrigir temporadas "contaminadas" sem reorganizacao manual corrida a corrida.
- A fonte de verdade para pontuacao de equipe por corrida sera o `SeasonTeamDepthChartEntry` com vigencia por rodada.
- Em lacuna de depth chart para determinada equipe/rodada, a equipe e tratada como nao existente naquela corrida (nao pontua).
- O recalculo deve ser deterministico e reproduzivel: duas execucoes com os mesmos dados devem gerar a mesma classificacao.
- O fluxo deve suportar disparo automatico e manual, inclusive para temporadas `COMPLETED`.
- O processo precisa ser atomico (tudo ou nada), com alvo de ate 30s para temporada de escala media.

## Assumptions

- Mudanca retroativa inclui pelo menos: `transferDriver`, `removeDriverFromTeam` e `saveTeamDepthChart` com vigencia por rodada.
- O recálculo nao altera dados brutos de corrida (`RoundResult`), apenas standings e agregados derivados.
- Permissoes seguem o padrao administrativo atual: `SUPER_ADMIN` e admins da liga.
- Escala alvo por temporada: ate ~40 corridas, ~120 pilotos, ~30 equipes.
- A regra de elegibilidade de pontuacao no modo `DEPTH_CHART` permanece igual ao comportamento atual (participou, pontuou, ordem de prioridade).

## Non-Functional Requirements

- Performance: concluir reprocessamento total de uma temporada media em ate 30s.
- Escala: manter estabilidade na faixa de 40 corridas / 120 pilotos / 30 equipes por temporada.
- Seguranca: somente administradores autorizados podem acionar fluxo manual; gatilho automatico roda no contexto de acao autorizada.
- Confiabilidade: execucao atomica com rollback completo em qualquer falha.
- Disponibilidade operacional: evitar dupla execucao concorrente da mesma temporada com lock por `seasonId`.
- Manutenibilidade: um unico fluxo canonico para recalculo (automatico e manual) para evitar divergencia de regra.

## Decision Log

1. **Fonte de verdade por corrida**
   - Decisao: depth chart por rodada (`effectiveFromRound`/`effectiveToRound`).
   - Alternativas: vinculo de piloto por temporada; roster por corrida como fonte primaria.
   - Motivo: aderencia direta ao modelo de pontuacao de equipe em `DEPTH_CHART`.

2. **Comportamento sem depth chart aplicavel**
   - Decisao: equipe nao pontua naquela corrida.
   - Alternativas: fallback para assignment; abortar execucao.
   - Motivo: evita inferencia ambigua e preserva determinismo.

3. **Abordagem de processamento**
   - Decisao: reprocessamento total sincronizado por temporada (Abordagem A).
   - Alternativas: snapshots incrementais; pipeline assincro com checkpoints.
   - Motivo: menor complexidade e menor risco de inconsistencias.

4. **Confiabilidade transacional**
   - Decisao: tudo ou nada.
   - Alternativas: parcial com checkpoint; best-effort.
   - Motivo: evita standings intermediarias quebradas.

5. **Acionamento do fluxo**
   - Decisao: automatico + opcao manual, incluindo temporadas `COMPLETED`.
   - Alternativas: apenas manual; apenas temporadas ativas.
   - Motivo: corrige legado e reduz operacao manual.

6. **Permissao para execucao manual**
   - Decisao: `SUPER_ADMIN` + admins da liga.
   - Alternativas: somente `SUPER_ADMIN`; owner + `SUPER_ADMIN`.
   - Motivo: alinhamento com governanca administrativa existente.

## Final Design

### 1) Arquitetura

Criar um servico canonico de dominio, chamado por todos os caminhos de recalculo:

- `reprocessSeasonStandings(seasonId, reason)`

Entradas:

- `seasonId`
- `reason` (ex.: `TRANSFER`, `DEPTH_CHART_UPDATE`, `MANUAL`)
- `triggeredBy` opcional (usuario no caminho manual)

Saidas:

- `success`
- metadados de execucao (duracao, total de corridas, total de equipes processadas, total de lacunas de depth)

### 2) Fluxo (automatico e manual)

Ambos os caminhos chamam exatamente o mesmo servico:

1. Acao de dominio salva a mudanca retroativa.
2. Aciona `reprocessSeasonStandings`.
3. Servico processa temporada inteira em ordem deterministica.
4. Persistencia atomica de standings.
5. Revalidacao de paginas admin/publicas impactadas.

### 3) Algoritmo deterministico

Para cada corrida da temporada (ordem por `round ASC`):

1. Construir snapshot de depth chart por equipe valido na rodada:
   - `effectiveFromRound <= round`
   - `effectiveToRound` nulo ou `>= round`
   - quando houver multiplas versoes, escolher a versao mais recente para a equipe naquele round.
2. Determinar pilotos elegiveis por equipe pela ordem de prioridade, limitando aos 3 primeiros que satisfaçam a regra de elegibilidade atual.
3. Se equipe nao tiver depth chart aplicavel no round, nao pontua nesse round.
4. Agregar pontos por equipe e estatisticas auxiliares (wins, podiums, best finishes, racePoints).
5. Ao final, substituir standings da temporada em lote.

### 4) Concurrency e lock

- Aplicar lock logico por `seasonId` durante a execucao.
- Se houver nova requisicao concorrente para o mesmo `seasonId`, retornar estado "ja em processamento".

### 5) Tratamento de falhas

- Qualquer erro interno aborta a transacao e preserva estado anterior.
- Falha nao altera standings parcialmente.
- Resultado de erro deve ser explicito para o admin e logado para suporte.

### 6) Observabilidade minima

Registrar por execucao:

- `seasonId`, `reason`, `triggeredBy` (quando houver)
- inicio/fim/duracao
- status (`success`/`failed`)
- contagens: corridas, equipes pontuadas, lacunas sem depth

### 7) Regras de escopo (nao-goals)

- Nao alterar resultados de corrida (`RoundResult`, posicao, tempo, DSQ).
- Nao redesenhar modos `STANDARD` e `SLOT_MULLIGAN` nesta fase.
- Nao introduzir otimizacoes incrementais prematuras (YAGNI).

## Riscos e Mitigacoes

- **Risco:** janela de 30s estourar em temporadas proximas do limite.
  - Mitigacao: consultas agregadas por temporada, processamento em memoria, escrita final em lote, metricas de duracao.

- **Risco:** corrida concorrente de recalculo gerar sobrescrita indevida.
  - Mitigacao: lock por `seasonId` e recusa de segunda execucao concorrente.

- **Risco:** admins interpretarem "sem depth" como bug.
  - Mitigacao: expor no resultado/relatorio que a regra de negocio aplicada foi "equipe nao pontua".

## Estrategia de Validacao

- Testes de determinismo: duas execucoes consecutivas com mesmo dataset devem resultar em standings identicas.
- Testes de regressao para `DEPTH_CHART` com mudancas retroativas e lacunas de depth.
- Teste transacional: injetar falha no meio e validar rollback total.
- Teste de concorrencia: duas chamadas paralelas para mesmo `seasonId`.
- Teste de permissao: somente `SUPER_ADMIN` e admins da liga no caminho manual.

## Exit Criteria (brainstorming)

- Understanding lock confirmado.
- Abordagem aceita explicitamente: **A**.
- Assumptions documentadas.
- Riscos principais identificados e mitigados.
- Decision log consolidado.

## Handoff Requirement

Como a mudanca impacta classificacoes historicas e temporadas `COMPLETED`, tratar como high-impact.
Antes da implementacao, encaminhar este documento + Decision Log para revisao via skill `multi-agent-brainstorming`.
