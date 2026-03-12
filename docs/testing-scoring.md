# Testing Scoring (QA)

Este documento resume a cobertura automatizada e o checklist manual para o sistema de pontuação (STANDARD, DEPTH_CHART, SLOT_MULLIGAN).

## Como rodar

```bash
bun run test
```

Opcional (watch):

```bash
bun run test:watch
```

## Matriz de cenários x testes

| Cenário | Arquivo de teste | Cobertura principal |
|---|---|---|
| Configuração de modo e mulligan | `src/lib/leagues/teamScoringConfig.test.ts` | Fallback seguro (`STANDARD`, mulligans `0`), normalização de valores |
| Fastest lap no modelo real da API | `src/lib/leagues/fastestLap.test.ts` | `driver_results` + `laps`, ignorando pilotos sem volta válida |
| Parsing de evento em cache | `src/lib/leagues/importHelpers.test.ts` | `rounds -> heats -> driver_results`, transformação para `RoundResult` |
| Importação de round com permissões | `src/lib/leagues/importActions.test.ts` | Fluxo de import com mocks (`auth`, `prisma`, `revalidate`, recálculo) |
| Estratégia STANDARD | `src/lib/leagues/teamScoringStrategies.test.ts` | Janela de vínculo por data, DSQ = 0 |
| Estratégia DEPTH_CHART | `src/lib/leagues/teamScoringStrategies.test.ts` | Top 3 elegíveis por participação em `QUALIFICATION` |
| Estratégia SLOT_MULLIGAN | `src/lib/leagues/teamScoringStrategies.test.ts` | Slots D1/D2/D3, MAIN/RESERVE, faltante = `0`, mulligan por slot |
| Regressão de standings por modo | `src/lib/leagues/teamScoringRegression.test.ts` | Snapshots estáveis de saída por modo |
| Regressão de tie-break e mulligan | `src/lib/leagues/standingsMathRegression.test.ts` | Desempate P1/P2/... e remoção determinística por `raceId` |

## Regras críticas validadas

- DSQ/DNF não pontua no agregado de equipe.
- DEPTH_CHART considera apenas pilotos que participaram de round de `QUALIFICATION`.
- SLOT_MULLIGAN calcula D1/D2/D3 por corrida e aplica mulligan por slot.
- Empates no mulligan usam ordem determinística por `raceId` (ascendente).
- Standings usam desempate por: pontos totais, vitórias, pódios, P1..P20.

## Checklist manual rápido (admin)

1. Criar temporada em `STANDARD`, importar 1 corrida e confirmar standings.
2. Trocar para `DEPTH_CHART`, definir prioridade no depth chart, recalcular e validar total de equipe.
3. Trocar para `SLOT_MULLIGAN`, configurar roster MAIN/RESERVE em uma corrida e validar D1/D2/D3.
4. Ajustar `teamSlotMulliganCount` e confirmar remoção de piores slots no total final.
5. Confirmar consistência entre páginas:
   - Admin standings
   - Detalhe da corrida
   - Portal público da liga

## Observações

- A suíte atual é focada em lógica de domínio e integração com mocks de infraestrutura.
- Warnings de lint de `<img>` já existentes não bloqueiam os testes de scoring.
