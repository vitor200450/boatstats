# Plano de Implementação - Sistema de Ligas

## Overview

Este documento detalha o plano de implementação do Sistema de Ligas, dividido em fases incrementais e priorizadas.

---

## Fase 1: Fundação de Dados (Estimativa: 2-3 dias)

### Objetivo
Preparar o schema do banco de dados com todas as entidades necessárias.

### Tasks

1. **Schema Prisma**
   - [ ] Criar model `LeagueAdmin`
   - [ ] Atualizar model `League` com relações
   - [ ] Criar model `Season`
   - [ ] Criar model `Team`
   - [ ] Criar model `SeasonTeamAssignment`
   - [ ] Atualizar model `Driver`
   - [ ] Criar model `Race`
   - [ ] Criar model `EventRound`
   - [ ] Criar model `RoundResult`
   - [ ] Criar model `Standing`
   - [ ] Criar enums necessários

2. **Migração de Dados**
   - [ ] Gerar migration Prisma
   - [ ] Script de migração de dados antigos (se necessário)
   - [ ] Testar rollback da migration

3. **Seeds**
   - [ ] Seed para ligas de exemplo
   - [ ] Seed para temporadas de teste

### Checklist de Entrega
- [ ] `npx prisma migrate dev` executa sem erros
- [ ] Tabelas criadas no banco de dados
- [ ] Seed popula dados de teste

---

## Fase 2: Core Backend - Liga e Temporada (Estimativa: 3-4 dias)

### Objetivo
Implementar server actions para gerenciamento básico de ligas.

### Tasks

1. **Server Actions - Liga**
   - [ ] `createLeague(formData)` - Cria liga + primeira temporada
   - [ ] `getMyLeagues()` - Lista ligas do usuário atual
   - [ ] `getLeagueById(id)` - Detalhes da liga
   - [ ] `updateLeague(id, formData)` - Editar nome/desc
   - [ ] `deleteLeague(id)` - Soft delete
   - [ ] `inviteAdmin(leagueId, email)` - Adicionar admin
   - [ ] `removeAdmin(leagueId, userId)` - Remover admin

2. **Server Actions - Temporada**
   - [ ] `createSeason(leagueId, formData)` - Nova temporada
   - [ ] `getSeasons(leagueId)` - Listar temporadas
   - [ ] `getSeasonById(id)` - Detalhes
   - [ ] `updateSeason(id, formData)` - Editar
   - [ ] `activateSeason(id)` - Ativar temporada
   - [ ] `archiveSeason(id)` - Arquivar

3. **Validação**
   - [ ] Zod schemas para todas as actions
   - [ ] Verificação de permissões em cada action
   - [ ] Tratamento de erros padronizado

### Checklist de Entrega
- [ ] Testes manuais de todas as server actions
- [ ] Permissões funcionando (admin vs super_admin)
- [ ] Erros retornam mensagens amigáveis

---

## Fase 3: Interface Admin - Liga (Estimativa: 4-5 dias)

### Objetivo
Construir as telas de gerenciamento de ligas e temporadas.

### Tasks

1. **Layout Admin Atualizado**
   - [ ] Atualizar `AdminSidebar` com estrutura de ligas
   - [ ] Componente `LeagueSelector` (dropdown de contexto)

2. **Páginas de Liga**
   - [ ] `/admin/leagues` - Lista de minhas ligas
   - [ ] `/admin/leagues/new` - Form de criação
   - [ ] `/admin/leagues/[id]` - Dashboard da liga
   - [ ] `/admin/leagues/[id]/settings` - Configurações
   - [ ] `/admin/leagues/[id]/admins` - Gerenciar admins

3. **Páginas de Temporada**
   - [ ] `/admin/leagues/[id]/seasons` - Lista de temporadas
   - [ ] `/admin/leagues/[id]/seasons/new` - Nova temporada
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]` - Dashboard da temporada
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/settings` - Configurações

4. **Componentes Reutilizáveis**
   - [ ] `PointsSystemEditor` - Editor de sistema de pontos
   - [ ] `SeasonStatusBadge` - Badge de status
   - [ ] `ConfirmationModal` - Confirmações de ações

### Checklist de Entrega
- [ ] Fluxo completo: criar liga → criar temporada → configurar pontos
- [ ] Interface responsiva
- [ ] Feedback visual (toasts) para ações

---

## Fase 4: Sistema de Equipes (Estimativa: 3-4 dias)

### Objetivo
Gerenciamento de equipes e vínculos com pilotos.

### Tasks

1. **Server Actions - Equipes**
   - [ ] `createTeam(leagueId, formData)`
   - [ ] `getTeams(leagueId)`
   - [ ] `updateTeam(id, formData)`
   - [ ] `deleteTeam(id)`

2. **Server Actions - Vínculos**
   - [ ] `assignDriverToTeam(seasonId, teamId, driverId)`
   - [ ] `removeDriverFromTeam(assignmentId)`
   - [ ] `transferDriver(seasonId, driverId, newTeamId)`
   - [ ] `getTeamAssignments(seasonId, teamId?)`

3. **Páginas**
   - [ ] `/admin/leagues/[id]/teams` - Lista de equipes
   - [ ] `/admin/leagues/[id]/teams/new` - Nova equipe
   - [ ] `/admin/leagues/[id]/teams/[teamId]` - Detalhes da equipe
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/drivers` - Gerenciar pilotos

4. **Componentes**
   - [ ] `TeamCard` - Card de equipe com pilotos
   - [ ] `DriverSelector` - Busca e seleção de pilotos
   - [ ] `AssignmentHistory` - Histórico de vínculos

### Checklist de Entrega
- [ ] Criar equipe com cor e nome
- [ ] Adicionar pilotos à equipe
- [ ] Transferir piloto entre equipes
- [ ] Ver histórico de vínculos

---

## Fase 5: Sistema de Corridas (Estimativa: 4-5 dias)

### Objetivo
Calendário de corridas e vínculo com API.

### Tasks

1. **Server Actions - Corridas**
   - [ ] `createRace(seasonId, formData)`
   - [ ] `getRaces(seasonId)`
   - [ ] `updateRace(id, formData)`
   - [ ] `deleteRace(id)`
   - [ ] `reorderRaces(seasonId, raceIds[])`

2. **Server Actions - EventRounds**
   - [ ] `linkApiEvent(raceId, apiEventId)` - Vincular evento
   - [ ] `detectRounds(raceId)` - Parse rounds da API
   - [ ] `configureRound(roundId, config)` - Configurar round
   - [ ] `unlinkApiEvent(raceId)` - Desvincular

3. **Páginas**
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/races` - Calendário
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/races/new` - Nova corrida
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/races/[raceId]` - Detalhes
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/races/[raceId]/configure` - Configurar rounds

4. **Componentes**
   - [ ] `RaceCalendar` - Visualização em calendário/lista
   - [ ] `RoundConfigurator` - Configurar cada round
   - [ ] `ApiEventLinker` - Input para ID do evento + verificação
   - [ ] `RoundStatusBadge` - Status do round

### Checklist de Entrega
- [ ] Criar corrida no calendário
- [ ] Vincular evento da API
- [ ] Detectar rounds automaticamente
- [ ] Configurar sistema de pontos por round

---

## Fase 6: Importação de Resultados (Estimativa: 3-4 dias)

### Objetivo
Importar resultados da API e calcular pontos.

### Tasks

1. **Serviço de Importação**
   - [ ] Refatorar `frosthexAPI.ts` para novo formato
   - [ ] `importRoundResults(roundId)` - Importar resultados
   - [ ] `recalculatePoints(seasonId)` - Recalcular toda temporada
   - [ ] `calculateDriverPoints()` - Lógica de cálculo
   - [ ] `calculateTeamPoints()` - Soma dos pilotos

2. **Lógica de Pontos**
   - [ ] Implementar `pointsEngine.ts` com novo schema
   - [ ] Suporte a posições, bônus e regras especiais
   - [ ] Aplicar multiplicadores por round

3. **Páginas**
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/races/[raceId]/import` - Importar
   - [ ] Preview de resultados antes de confirmar

4. **Componentes**
   - [ ] `ImportPreview` - Preview de dados da API
   - [ ] `ImportLogs` - Logs do processo
   - [ ] `RecalculateButton` - Botão de recalcular com confirmação

### Checklist de Entrega
- [ ] Importar resultados de um round
- [ ] Calcular pontos corretamente
- [ ] Recalcular pontos após mudança de sistema
- [ ] Logs visíveis do processo

---

## Fase 7: Classificações (Estimativa: 3-4 dias)

### Objetivo
Cálculo e exibição de standings de pilotos e construtores.

### Tasks

1. **Server Actions - Standings**
   - [ ] `calculateStandings(seasonId)` - Calcular e salvar
   - [ ] `getDriverStandings(seasonId)` - Classificação de pilotos
   - [ ] `getTeamStandings(seasonId)` - Classificação de construtores
   - [ ] `getDriverHistory(driverId)` - Histórico do piloto

2. **Páginas Públicas (Atualizar)**
   - [ ] Atualizar `/leagues/[id]` para mostrar temporadas
   - [ ] `/leagues/[id]/seasons/[seasonId]` - Página da temporada
   - [ ] Componentes de standings na página pública

3. **Páginas Admin**
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/standings` - Ver standings
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/standings/drivers` - Pilotos
   - [ ] `/admin/leagues/[id]/seasons/[seasonId]/standings/teams` - Construtores

4. **Componentes**
   - [ ] `DriverStandingsTable` - Tabela de pilotos
   - [ ] `TeamStandingsTable` - Tabela de construtores
   - [ ] `RaceByRacePoints` - Pontos corrida por corrida
   - [ ] `StandingRow` - Linha com posição, mudanças, etc.

### Checklist de Entrega
- [ ] Standings de pilotos atualizados
- [ ] Standings de construtores calculados
- [ ] Visualização pública acessível
- [ ] Cache funcionando (standings salvos no banco)

---

## Fase 8: Dashboard e Polimento (Estimativa: 3-4 dias)

### Objetivo
Dashboards informativos e polimento geral.

### Tasks

1. **Dashboard da Liga**
   - [ ] Estatísticas gerais
   - [ ] Lista de temporadas
   - [ ] Admins da liga
   - [ ] Atalhos rápidos

2. **Dashboard da Temporada**
   - [ ] Próxima corrida
   - [ ] Líderes atuais
   - [ ] Estatísticas da temporada
   - [ ] Contador de corridas
   - [ ] Gráfico de evolução (opcional)

3. **Melhorias de UX**
   - [ ] Loading states
   - [ ] Empty states
   - [ ] Error boundaries
   - [ ] Toasts de feedback
   - [ ] Confirmações de ações destrutivas

4. **Documentação**
   - [ ] README atualizado
   - [ ] Guia de uso para admins
   - [ ] Troubleshooting comum

### Checklist de Entrega
- [ ] Dashboards informativos
- [ ] UX polida
- [ ] Documentação completa

---

## Fase 9: Testes e Otimização (Estimativa: 3-4 dias)

### Objetivo
Garantir qualidade e performance.

### Tasks

1. **Testes**
   - [ ] Testar fluxo completo como admin
   - [ ] Testar como super_admin
   - [ ] Testar permissões (tentar acessar liga de outro)
   - [ ] Testar edge cases (empates, descartes, etc.)

2. **Performance**
   - [ ] Analisar queries lentas
   - [ ] Adicionar índices necessários
   - [ ] Otimizar cálculo de standings
   - [ ] Testar com dados de volume

3. **Bugs e Ajustes**
   - [ ] Lista de bugs encontrados
   - [ ] Ajustes finos de UI
   - [ ] Correções de cálculo

### Checklist de Entrega
- [ ] Sistema testado end-to-end
- [ ] Performance aceitável
- [ ] Bugs críticos resolvidos

---

## Cronograma Resumido

| Fase | Duração | Acumulado |
|------|---------|-----------|
| 1: Fundação de Dados | 2-3 dias | 2-3 dias |
| 2: Core Backend | 3-4 dias | 5-7 dias |
| 3: Interface Admin - Liga | 4-5 dias | 9-12 dias |
| 4: Sistema de Equipes | 3-4 dias | 12-16 dias |
| 5: Sistema de Corridas | 4-5 dias | 16-21 dias |
| 6: Importação | 3-4 dias | 19-25 dias |
| 7: Classificações | 3-4 dias | 22-29 dias |
| 8: Dashboard | 3-4 dias | 25-33 dias |
| 9: Testes | 3-4 dias | 28-37 dias |

**Total Estimado: 5-7 semanas** (trabalhando consistentemente)

---

## Dependências Entre Fases

```
Fase 1 (Schema)
    │
    ├──▶ Fase 2 (Backend Liga)
    │       │
    │       ├──▶ Fase 3 (UI Liga)
    │       │       │
    │       │       ├──▶ Fase 4 (Equipes)
    │       │       │       │
    │       │       │       ├──▶ Fase 5 (Corridas)
    │       │       │       │       │
    │       │       │       │       ├──▶ Fase 6 (Importação)
    │       │       │       │       │       │
    │       │       │       │       │       └──▶ Fase 7 (Standings)
    │       │       │       │       │               │
    │       │       │       │       │               └──▶ Fase 8 (Dashboard)
    │       │       │       │       │                       │
    │       │       │       │       │                       └──▶ Fase 9 (Testes)
```

---

## Notas de Implementação

### Prioridades de Escopo

**Must Have (MVP):**
- Criar liga + temporada
- Cadastrar equipes e pilotos
- Adicionar corridas ao calendário
- Vincular evento da API
- Importar resultados (1 round)
- Calcular standings simples

**Should Have:**
- Múltiplos rounds por corrida (Sprint + Main)
- Sistemas de pontos personalizados
- Histórico de vínculos de pilotos
- Transferência de pilotos
- Dashboards visuais

**Nice to Have:**
- Gráficos de evolução
- Estatísticas avançadas
- Exportação de dados
- Notificações

### Decisões Técnicas Pendentes

1. **Cache de Standings:** Atualizar em tempo real ou batch?
   - Recomendação: Atualizar na importação, recalcular sob demanda

2. **Soft Delete:** Implementar deletedAt nas entidades principais?
   - Recomendação: Sim, para ligas, temporadas e equipes

3. **API Cache:** Armazenar JSON completo da API?
   - Recomendação: Sim, em `Race.apiEventCache` para reprocessamento

---

## Próximos Passos

1. Revisar este plano
2. Ajustar prioridades se necessário
3. Começar pela Fase 1 (Schema)
4. Fazer checkpoint ao final de cada fase

---

## Checklist de Preparação

Antes de começar:
- [ ] Backup do banco de dados atual
- [ ] Branch dedicada no git
- [ ] Ambiente de desenvolvimento configurado
- [ ] API Frosthex acessível para testes
