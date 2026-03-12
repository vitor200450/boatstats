# Sistema de Ligas - Design Document

## Overview

Sistema completo de gerenciamento de ligas de boat racing no Minecraft, permitindo administradores criarem temporadas com múltiplas corridas, gerenciarem equipes/construtores, e sincronizarem resultados automaticamente da API Frosthex.

---

## Contexto

### O que já existe
- Sistema de autenticação (ADMIN, SUPER_ADMIN)
- Schema básico: User, League, Event, Track, Driver, Result
- Motor de cálculo de pontos simples (F1 padrão)
- Importação básica de eventos da API
- Páginas públicas de visualização de ligas/classificações

### O que será construído
- Interface completa de criação/gerenciamento de ligas
- Sistema de temporadas independentes
- Gerenciamento de equipes (construtores) com histórico de membros
- Calendário de corridas com múltiplos rounds
- Sistema de pontos flexível por temporada e por round
- Classificações de pilotos e construtores

---

## Arquitetura de Dados

### Diagrama de Relacionamentos

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEAGUE                                  │
│  (Criada por Admin, pode ter múltiplos admins)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SEASON 1 (2025) - ACTIVE                               │   │
│  │  • Sistema de pontos: { "positions": {...}, "bonuses": } │   │
│  │                                                         │   │
│  │  TEAMS: [Red Bull, Mercedes, Ferrari...]                │   │
│  │  └── Drivers (via SeasonTeamAssignment)                 │   │
│  │                                                         │   │
│  │  RACES:                                                 │   │
│  │  ├─ Race 1: Australian GP                               │   │
│  │  │   ├─ EventRound: Qualy (0 pts)                       │   │
│  │  │   └─ EventRound: Main Race (25 pts)                  │   │
│  │  │                                                       │   │
│  │  ├─ Race 2: Bahrain GP                                  │   │
│  │  │   ├─ EventRound: Qualy                               │   │
│  │  │   ├─ EventRound: Sprint (8 pts)                      │   │
│  │  │   └─ EventRound: Main Race (25 pts)                  │   │
│  │  │                                                       │   │
│  │  └─ Race 3: Monaco GP (2x pontos)                       │   │
│  │      └─ EventRound: Main Race (50 pts)                  │   │
│  │                                                          │   │
│  │  STANDINGS (cache): Drivers & Teams                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SEASON 2 (2026) - DRAFT                                │   │
│  │  (estrutura similar, dados independentes)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schema Prisma

### Models Principais

```prisma
// Liga e Temporada
model League {
  id          String   @id @default(cuid())
  name        String
  description String?
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])

  seasons     Season[]
  teams       Team[]
  admins      LeagueAdmin[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model LeagueAdmin {
  id       String @id @default(cuid())
  leagueId String
  league   League @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  addedAt  DateTime @default(now())
  addedBy  String?

  @@unique([leagueId, userId])
}

model Season {
  id            String       @id @default(cuid())
  leagueId      String
  league        League       @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  name          String       // "2025", "Season 5"
  year          Int?
  status        SeasonStatus @default(DRAFT)

  // Sistema de pontos da temporada (JSON)
  pointsSystem  Json         // { name, positions, bonuses, rules }

  races         Race[]
  teamAssignments SeasonTeamAssignment[]
  standings     Standing[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum SeasonStatus {
  DRAFT
  ACTIVE
  COMPLETED
  ARCHIVED
}
```

### Equipes e Pilotos

```prisma
model Team {
  id          String   @id @default(cuid())
  leagueId    String
  league      League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  name        String
  color       String?  // Hex para UI
  logoUrl     String?

  assignments SeasonTeamAssignment[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([leagueId, name])
}

// Vínculo Piloto-Equipe em uma Temporada específica
model SeasonTeamAssignment {
  id          String   @id @default(cuid())
  seasonId    String
  season      Season   @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  teamId      String
  team        Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  driverId    String
  driver      Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  joinedAt    DateTime @default(now())
  leftAt      DateTime? // Null = ainda ativo

  @@unique([seasonId, driverId])
}

model Driver {
  id          String   @id @default(cuid())
  uuid        String   @unique // Minecraft Player UUID
  currentName String?

  results     RoundResult[]
  assignments SeasonTeamAssignment[]
  standings   Standing[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Corridas e Rounds

```prisma
model Race {
  id              String      @id @default(cuid())
  seasonId        String
  season          Season      @relation(fields: [seasonId], references: [id], onDelete: Cascade)

  name            String      // "Australian Grand Prix"
  round           Int         // Número da rodada no campeonato

  // Vínculo com API externa
  apiEventId      String?     @unique
  apiEventCache   Json?       // Cache do JSON completo da API

  // Rounds são criados automaticamente ao vincular evento
  eventRounds     EventRound[]

  trackApiName    String?
  scheduledDate   DateTime?

  status          RaceStatus  @default(SCHEDULED)

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

enum RaceStatus {
  SCHEDULED    // Agendada, sem evento vinculado
  PENDING      // Evento vinculado, aguardando configuração
  COMPLETED    // Todos os rounds importados
  CANCELLED    // Cancelada
}

model EventRound {
  id              String      @id @default(cuid())
  raceId          String
  race            Race        @relation(fields: [raceId], references: [id], onDelete: Cascade)

  // Identificação do round na API
  apiRoundName    String      // "R1-Qualy", "R2-Race"
  apiRoundType    String      // "QUALIFICATION", "RACE", "SPRINT_RACE"

  // Qual heat usar (geralmente o último/final)
  targetHeatName  String?     // "R1Q1", "R2R1"

  // Configuração de pontos para ESTE round
  pointsSystem    Json?       // null = não pontua

  // Se true, inclui na classificação geral
  countsForStandings Boolean @default(true)

  status          RoundStatus @default(PENDING)

  results         RoundResult[]

  importedAt      DateTime?

  @@unique([raceId, apiRoundName])
}

enum RoundStatus {
  PENDING
  CONFIGURED    // Configurado, pronto para importar
  IMPORTED
  CANCELLED
}

model RoundResult {
  id              String      @id @default(cuid())
  eventRoundId    String
  eventRound      EventRound  @relation(fields: [eventRoundId], references: [id], onDelete: Cascade)
  driverId        String
  driver          Driver      @relation(fields: [driverId], references: [id])

  // Dados da API
  position        Int
  startPosition   Int?
  finishTimeMs    Int?
  fastestLap      Boolean     @default(false)
  pitstops        Int         @default(0)

  // Calculado
  points          Int         @default(0)

  // Volta mais rápida detalhada
  fastestLapTime  Int?

  createdAt       DateTime    @default(now())

  @@unique([eventRoundId, driverId])
}
```

### Cache de Classificação

```prisma
model Standing {
  id              String       @id @default(cuid())
  seasonId        String
  season          Season       @relation(fields: [seasonId], references: [id], onDelete: Cascade)

  type            StandingType // DRIVER or TEAM

  // Referência ao alvo
  driverId        String?
  driver          Driver?      @relation(fields: [driverId], references: [id])
  teamId          String?
  team            Team?        @relation(fields: [teamId], references: [id])

  position        Int
  totalPoints     Int
  wins            Int          @default(0)
  podiums         Int          @default(0)

  // Snapshot dos pontos por corrida/round
  racePoints      Json         // { "raceId": { "roundName": points, "total": points } }

  // Tie-breakers
  bestFinishes    Json?        // {"1": 3, "2": 5, "3": 2} para desempate

  updatedAt       DateTime     @updatedAt

  @@unique([seasonId, type, driverId])
  @@unique([seasonId, type, teamId])
}

enum StandingType {
  DRIVER
  TEAM
}
```

---

## Sistema de Pontos (JSON Schema)

### Estrutura

```typescript
interface PointsSystem {
  name: string;
  positions: Record<string, number>;  // {"1": 25, "2": 18, ...}
  bonuses: {
    fastestLap?: number;
    polePosition?: number;
    mostLapsLed?: number;
    positionsGained?: { threshold: number; points: number };
    finishRace?: number;
  };
  rules: {
    dropLowestScores?: number;      // Descarta N piores resultados
    requireFinishToScore?: boolean; // Só pontua se terminar
  };
}
```

### Exemplos

```json
// F1 Tradicional
{
  "name": "F1 Standard",
  "positions": { "1": 25, "2": 18, "3": 15, "4": 12, "5": 10, "6": 8, "7": 6, "8": 4, "9": 2, "10": 1 },
  "bonuses": { "fastestLap": 1 },
  "rules": {}
}

// F1 com Sprint
{
  "name": "F1 Sprint",
  "positions": { "1": 8, "2": 7, "3": 6, "4": 5, "5": 4, "6": 3, "7": 2, "8": 1 },
  "bonuses": {},
  "rules": {}
}

// Todos pontuam
{
  "name": "Everyone Scores",
  "positions": { "1": 40, "2": 35, "3": 34, "4": 33, "5": 32, ... },
  "bonuses": { "polePosition": 1, "fastestLap": 1 },
  "rules": { "dropLowestScores": 2 }
}
```

---

## Fluxos do Administrador

### 1. Criação de Liga

```
Painel Admin → "Minhas Ligas" → "Nova Liga"
  │
  ├── Nome da Liga *
  ├── Descrição
  └── ───────────────────────────
      Configuração da Primeira Temporada
      ├── Nome da Temporada * (default: ano atual)
      └── Sistema de Pontos *
          ├── Padrão F1 (25-18-15...)
          ├── Padrão F1 Sprint (8-7-6...)
          ├── Todos ganham pontos
          └── Personalizado...
  │
  └── [Criar Liga]
        └── Redireciona para Dashboard da Temporada
```

### 2. Estrutura de Navegação

```
📁 MINHAS LIGAS
   └── 🏆 Nome da Liga
       ├── 📊 Dashboard (temporada ativa)
       ├── 🗓️ Temporadas
       │   ├── 2025 (ativa) → [Races, Standings, Settings]
       │   └── 2026 (draft)
       ├── 🏎️ Equipes
       ├── 👥 Pilotos (histórico/global)
       └── ⚙️ Configurações da Liga
```

### 3. Gerenciamento de Equipes

**Lista de Equipes:**
- Card por equipe com: nome, cor, pilotos atuais, estatísticas
- Ações: Editar, Remover
- Seção "Sem equipe" para pilotos não alocados

**Editar Equipe:**
- Nome, cor, logo
- Adicionar/remover pilotos da temporada atual
- Histórico de membros mostrando entradas/saídas

### 4. Gerenciamento de Corridas (Calendário)

**Visualização:**
- Lista cronológica ou visualização de calendário
- Filtros: todas, agendadas, pendentes, concluídas

**Adicionar Corrida:**
- Nome da corrida *
- Rodada *
- Data prevista
- Pista (API name para estatísticas)

**Após vincular evento da API:**
- Sistema detecta rounds automaticamente
- Admin configura cada round:
  - Heat alvo (se múltiplos na API)
  - Sistema de pontos (ou não pontua)
  - Se conta para campeonato

**Importar Resultados:**
- Por round ou todos de uma vez
- Preview antes de confirmar
- Recalcular pontos se necessário

---

## Integração com API Frosthex

### Estrutura da API (W4FC-response.json)

```json
{
  "name": "W4FC-26-R5-Monaco",
  "date": 1768679097,
  "track_name": "MonacoW4FC",
  "participant_count": 50,
  "rounds": [
    {
      "name": "R1-Qualy",
      "type": "QUALIFICATION",
      "heats": [
        {
          "name": "R1Q1",
          "driver_results": [
            {
              "position": 1,
              "start_position": 2,
              "name": "_RioluTM_",
              "uuid": "2f0217dc-d617-435b-ad5b-329b9fbf9ece",
              "finish_time": 370350,
              "laps": [
                { "time": 93700, "pitstop": false, "fastest": false },
                { "time": 92750, "pitstop": false, "fastest": true }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Fluxo de Importação

1. Admin informa `apiEventId` (ex: "W4FC-26-R5-Monaco")
2. Sistema busca JSON da API
3. Parse rounds: `rounds[].name`, `rounds[].type`
4. Para cada round, criar `EventRound` vinculado à `Race`
5. Admin configura:
   - Qual heat usar (default: último da lista)
   - Sistema de pontos para este round
   - Se pontua para campeonato
6. Importar resultados do heat selecionado
7. Calcular pontos baseado no sistema configurado
8. Atualizar standings da temporada

---

## Regras de Negócio

### Pontuação

1. Cada round pode ter sistema de pontos diferente
2. Pontuação de construtores = soma dos pontos dos pilotos da equipe
3. Piloto sem equipe só pontua no campeonato de pilotos
4. Pilotos que trocam de equipe durante temporada:
   - Pontos anteriores ficam com equipe antiga
   - Pontos futuros vão para nova equipe

### Classificação (Desempate)

1. Mais pontos totais
2. Mais vitórias
3. Mais segundos lugares
4. Mais terceiros lugares
5. (e assim por diante...)
6. Melhor posição na última corrida

### Permissões

- **SUPER_ADMIN**: Acesso total a todas as ligas
- **ADMIN (owner)**: Acesso total às ligas que criou
- **ADMIN (adicionado)**: Acesso às ligas onde foi adicionado como admin
- Uma liga pode ter múltiplos admins

---

## Decision Log

| Decisão | Alternativas | Motivo |
|---------|--------------|--------|
| Temporadas independentes | Flat com flags | Histórico completo, múltiplos campeonatos |
| Pilotos globais + vínculos | Pilotos por temporada | Estatísticas de carreira unificadas |
| EventRounds mapeando API | Sessions genéricas | Aproveita estrutura nativa da API |
| Pontos por round | Apenas por temporada | Suporta Sprint + Main Race |
| Standings como cache | Calcular em tempo real | Performance |
| Race antes da importação | Importar direto | Calendário antecipado |
| Multi-admin por liga | Apenas criador | Facilita gestão com comissários |

---

## Non-Functional Requirements

| Aspecto | Requisito |
|---------|-----------|
| Performance | < 2s para standings de uma temporada |
| Scale | 50 ligas, 20 temporadas/liga, 30 corridas/temporada |
| Concorrência | Último ganha (sem locks otimistas) |
| Data Retention | Indefinido (soft delete/arquivar) |
| API Limit | Assumir gratuito e estável |

## Explicit Non-Goals

- Sistema de inscrição pública de pilotos
- Chat/comunicação interna
- Notificações em tempo real
- Sistema de protestos/penalidades
- Upload de mídia (replays/screenshots)
- Outros jogos além de Minecraft Ice Boat

---

## Changelog

| Data | Versão | Descrição |
|------|--------|-----------|
| 2025-02-25 | 1.0 | Design inicial aprovado |
