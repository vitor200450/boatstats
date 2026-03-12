# Design: Rodadas Sprint por Temporada (V1)

## Entendimento Consolidado

- O objetivo e suportar corridas sprint sem quebrar o fluxo atual de corridas/rodadas.
- O escopo da V1 e apenas sprint no estilo F1 (sem generalizacao completa agora).
- A classificacao de sprint sera manual pelo admin, pois a API nao retorna tipo de rodada com confiabilidade.
- Sprint sera modelada no nivel de rodada (`EventRound`), nao no nivel da corrida (`Race`).
- Cada corrida pode ter no maximo 1 rodada sprint; tambem pode nao ter sprint.
- Sprint pode ser:
  - `Classificatoria (0 pts)`: apenas registra/exibe resultados.
  - `Pontuavel`: aplica pontos.
- A regra padrao da sprint sera configurada por temporada em novo bloco "Regras de Sprint".

## Nao Objetivos (V1)

- Nao aplicar automaticamente grid da final com base na sprint.
- Nao criar auditoria dedicada para alteracoes de tipo/modo sprint.
- Nao introduzir outros tipos especiais (alem de sprint) na primeira entrega funcional.

## Assumptions

- Dados existentes permanecem validos com `specialType = NONE` por padrao.
- Volume esperado: ate 30 corridas por temporada e ate 5 rodadas por corrida.
- Permissoes seguem o modelo atual (owner/admin/super_admin).
- Camada de dominio em `src/lib/leagues` centraliza regras para manutencao futura.

## Abordagens Consideradas

1. **Extensao explicita no `EventRound` (escolhida)**
   - Campos dedicados para tipo especial e modo sprint.
   - Mantem compatibilidade com `pointsSystem` e `countsForStandings`.
2. Convencao sobre campos atuais (`countsForStandings`/`pointsSystem`)
   - Rejeitada por ambiguidade semantica.
3. Entidade separada de regras (ex.: `RaceFormatRule`)
   - Rejeitada por overengineering para V1 (YAGNI).

## Decisoes

1. Escopo inicial: apenas sprint F1.
2. Classificacao manual de sprint no detalhe da corrida.
3. Sprint no nivel de `EventRound`.
4. Modos explicitos: classificatoria vs pontuavel.
5. Limite de 0 ou 1 sprint por corrida.
6. Campos explicitos para extensibilidade futura.
7. Exibicao publica com badge discreto.
8. Configuracao de sprint por temporada em novo bloco.

## Modelo de Dados (Proposto)

Adicionar em `EventRound`:

- `specialType`: enum
  - `NONE` (default)
  - `SPRINT`
- `sprintMode`: enum nullable
  - `CLASSIFICATION`
  - `POINTS`
  - `null` quando `specialType = NONE`

Regras de consistencia:

- Se `specialType = SPRINT`, `sprintMode` e obrigatorio.
- Se `specialType = NONE`, `sprintMode` deve ser `null`.
- Uma unica rodada sprint por `raceId`.

Retrocompatibilidade:

- Migracao marca rodadas existentes com `specialType = NONE`.
- `sprintMode` inicial `null`.

## Regras de Dominio

Criar/centralizar funcoes na camada de dominio (ex.: `src/lib/leagues`):

- `validateSpecialRoundConfig(...)`
- `validateSingleSprintPerRace(...)`
- `deriveRoundScoringPolicy(...)`

Politica efetiva de pontuacao:

- `SPRINT + CLASSIFICATION` => nao pontua (pontos = 0).
- `SPRINT + POINTS` => pontua.
- `NONE` => comportamento atual.

Observacao: manter `countsForStandings` por compatibilidade, mas a decisao final de pontuacao deve usar a politica efetiva derivada.

## Fluxo de UI/Admin

Tela: detalhe da corrida (`RaceDetailsClient`), por rodada.

Novo controle por rodada:

- `Normal`
- `Sprint - Classificatoria`
- `Sprint - Pontuavel`

Comportamentos:

- Bloquear selecao de segunda sprint na mesma corrida com erro amigavel.
- Ao marcar sprint classificatoria, refletir visual de nao pontuavel.
- Ao voltar para normal, limpar metadados de sprint.
- Em temporada inativa, manter somente visualizacao (sem edicao).

## Configuracao da Temporada

Adicionar bloco **"Regras de Sprint"** em configuracoes da temporada:

- `Modo padrao da sprint`
  - `Classificatoria (0 pts)`
  - `Pontuavel`
- `Sistema de pontos da sprint` (ativo quando modo padrao = pontuavel)

Precedencia:

1. Configuracao explicita da rodada sprint.
2. Configuracao padrao da temporada.
3. Fallback seguro: `Classificatoria (0 pts)`.

## Importacao e Recalculo

No fluxo de importacao de resultados por rodada:

- Aplicar `deriveRoundScoringPolicy` antes de calcular pontos.
- Se politica for classificatoria, forcar pontos 0.

Ao alterar tipo/modo de rodada ja importada:

- Recalcular pontos da rodada.
- Recalcular standings da temporada.
- Revalidar paginas afetadas (detalhe da corrida, temporada, standings).

## Exibicao Publica

- Exibir badge discreto em rodadas sprint:
  - `Sprint`
  - `Sprint (Classificatoria)` quando aplicavel.

Sem secoes especiais novas na V1.

## NFRs

- **Performance:** volume baixo/moderado, operacoes por `raceId`; impacto esperado baixo.
- **Escala:** suporte planejado para ate 30 corridas x 5 rodadas.
- **Seguranca:** mesmas regras de autorizacao atuais.
- **Confiabilidade:** alteracoes em rodadas importadas sempre disparam recalc de pontos/standings.
- **Manutencao:** regras centralizadas na camada de dominio, reduzindo logica duplicada em UI/action.

## Riscos e Mitigacoes

- Risco: inconsistencias ao editar sprint apos importacao.
  - Mitigacao: recalc obrigatorio e validacoes server-side.
- Risco: confusao entre flags antigas e novas.
  - Mitigacao: politica efetiva unica no dominio e UI com estados explicitos.
- Risco: evolucao para outros tipos especiais.
  - Mitigacao: `specialType` explicito como base extensivel.

## Prontidao para Implementacao

Checklist de saida do brainstorming:

- Entendimento confirmado.
- Abordagem selecionada.
- Assumptions e nao objetivos documentados.
- Riscos principais mapeados.
- Decision log consolidado.
