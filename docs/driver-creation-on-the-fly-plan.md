# Plano de Implementação: Criação On-the-Fly de Pilotos

## Contexto

O sistema atual permite adicionar pilotos a equipes, mas requer que os pilotos já existam no banco de dados. Como os pilotos só são criados ao importar eventos da API, o sistema fica em estado vazio quando não há eventos importados.

## Solução

Implementar criação on-the-fly de pilotos: quando o admin busca um jogador que não existe no banco, o sistema busca automaticamente nas APIs externas (Frosthex → Mojang) e cria o piloto com os dados encontrados.

---

## Decisões Técnicas

| Decisão | Opção Escolhida | Motivo |
|---------|-----------------|--------|
| Fonte primária | API Frosthex | Dados enriquecidos (cor, tipo de barco) |
| Fallback | API Mojang | Cobre jogadores que ainda não participaram de corridas |
| Autenticação API | Query param `api_key` | Conforme especificação Frosthex |
| Cache | 1 hora (Next.js revalidate) | Balanceia fresh data com rate limits |
| Debounce input | 500ms | Evita spam de API enquanto usuário digita |
| Mínimo caracteres | 3 | Padrão Minecraft (3-16 chars) |

---

## Arquitetura

```
Frontend (React)
    │
    ├── Input de busca com debounce (500ms)
    │
    ├── 1. searchDrivers(query) → Busca local no banco
    │       ├── Encontrado → Mostra resultados
    │       └── Vazio → Trigger criação
    │
    └── 2. createDriverFromAPI(username) → Server Action
            │
            ├── fetchFrosthexPlayer(username, api_key)
            │       ├── Sucesso → Cria driver completo
            │       └── 404 → Fallback Mojang
            │
            ├── fetchMojangProfile(username)
            │       ├── Sucesso → Cria driver básico
            │       └── 404 → Retorna erro
            │
            └── prisma.driver.create()
```

---

## API Endpoints

### Frosthex API
```
GET http://fc1.api.frosthex.com/api/v1/readonly/players/:username?api_key={API_KEY}

Headers:
  - (nenhum)

Query Params:
  - api_key: bf5aa51e-37fd-4bdc-bd26-78655f1a8541

Response 200:
{
  "uuid": "7802412c-046e-4039-8f71-e5f7a28afd4a",
  "name": "Vitor0502",
  "display_name": "Vitor0502",
  "color_code": "#80C71F",
  "hex_color": "#80C71F",
  "boat_type": "DARK_OAK",
  "boat_material": "DARK_OAK_BOAT",
  "bukkit_color": "Color:[argb0xFF80C71F]"
}

Response 404: Jogador não encontrado
```

### Mojang API
```
GET https://api.mojang.com/users/profiles/minecraft/:username

Response 200:
{
  "id": "7802412c046e40398f71e5f7a28afd4a",  // UUID sem hífens
  "name": "Vitor0502"
}

Response 404: Jogador não encontrado
```

---

## Schema Atualizado (Prisma)

```prisma
model Driver {
  id          String   @id @default(cuid())
  uuid        String   @unique                    // Minecraft Player UUID
  currentName String?                              // Nome atual do jogador

  // Campos enriquecidos da Frosthex API
  colorCode     String?                            // #80C71F
  boatType      String?                            // DARK_OAK
  boatMaterial  String?                            // DARK_OAK_BOAT

  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations (existentes)
  results       RoundResult[]
  assignments   SeasonTeamAssignment[]
  standings     Standing[]

  @@index([currentName])                           // Para buscas rápidas
}
```

---

## Arquivos a Criar/Modificar

### 1. Novo arquivo: `src/lib/minecraft-api.ts`
```typescript
interface FrosthexPlayerResponse {
  uuid: string;
  name: string;
  display_name: string;
  color_code: string;
  hex_color: string;
  boat_type: string;
  boat_material: string;
  bukkit_color: string;
}

interface MojangProfileResponse {
  id: string;      // UUID sem hífens
  name: string;
}

// Implementar:
// - fetchFrosthexPlayer(username): Promise<FrosthexPlayerResponse | null>
// - fetchMojangProfile(username): Promise<MojangProfileResponse | null>
// - formatUUID(uuid): string (adiciona hífens)
```

### 2. Novo arquivo: `src/lib/leagues/driverActions.ts`
```typescript
// Server Action
export async function createDriverFromAPI(username: string) {
  // 1. Buscar Frosthex
  // 2. Se não encontrar, buscar Mojang
  // 3. Criar no Prisma
  // 4. Retornar driver criado
}
```

### 3. Modificar: `src/lib/leagues/index.ts`
Adicionar export de `createDriverFromAPI`.

### 4. Modificar: `prisma/schema.prisma`
Adicionar campos `colorCode`, `boatType`, `boatMaterial` ao model `Driver`.

### 5. Modificar: Página de adicionar piloto à equipe
```typescript
// src/app/admin/leagues/[id]/teams/[teamId]/page.tsx (seção do modal)

// Estados necessários:
- query: string
- localResults: Driver[]
- isSearching: boolean
- isCreating: boolean
- createStatus: { type, message, driver? }

// Fluxo:
1. Usuário digita nome (debounce 500ms)
2. Busca local com searchDrivers()
3. Se vazio e >= 3 chars → chama createDriverFromAPI()
4. Mostra preview com dados encontrados
5. Botão "Criar e Selecionar" chama onSelect(driver)
```

### 6. Modificar: `.env`
```bash
FROSTHEX_API_KEY=bf5aa51e-37fd-4bdc-bd26-78655f1a8541
```

---

## Fluxo de UI/UX

```
┌─────────────────────────────────────────────────────────────┐
│  MODAL: Adicionar Piloto à Equipe                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Buscar piloto... _________________]  [🔍]                │
│                                                             │
│  ESTADO 1: Digitando (debounce 500ms)                      │
│  → Mostra spinner "Buscando..."                           │
│                                                             │
│  ESTADO 2: Encontrado no banco                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🎮 _RioluTM_        [Selecionar]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ESTADO 3: Não encontrado → Buscando APIs                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔍 Buscando "RioluTM"...                           │   │
│  │  ├── API Frosthex...                                │   │
│  │  └── API Mojang (fallback)...                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ESTADO 4: Encontrado na API                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✅ Encontrado!                                     │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  🎨 [Avatar]  RioluTM                         │  │   │
│  │  │     UUID: 7802-412c-046e...                   │  │   │
│  │  │     Cor: #80C71F  |  Barco: Dark Oak          │  │   │
│  │  │                                               │  │   │
│  │  │     [Criar e Selecionar]                      │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ESTADO 5: Erro (não encontrado)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ❌ Jogador não encontrado                          │   │
│  │     • Verifique o nome digitado                   │   │
│  │     • O jogador precisa ter Minecraft Original    │   │
│  │     • Ou já ter participado de corridas           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Cases e Tratamento

| Cenário | Tratamento |
|---------|------------|
| API Frosthex offline | Fallback imediato para Mojang |
| Ambas APIs offline | Erro amigável com botão "Tentar novamente" |
| Nome com caracteres especiais | Usar `encodeURIComponent()` |
| UUID já existe no banco | Retornar driver existente (idempotente) |
| Nome mudou desde última busca | Atualizar `currentName` (upsert) |
| Jogador pirata (sem UUID válido) | Não permitir - só Minecraft Original |
| Rate limit atingido | Cache agressivo + debounce no input |

---

## Cache Strategy

```
Camada 1: Next.js fetch revalidate (1 hora)
  → Evita requisições repetidas às APIs

Camada 2: Prisma unique constraint (uuid)
  → Evita duplicatas no banco

Camada 3: Debounce no input (500ms)
  → Evita spam enquanto usuário digita

Camada 4: Query só executa com >= 3 chars
  → Evita buscas com termos muito curtos
```

---

## Validações de Segurança

```typescript
// Validação de username Minecraft
const MINECRAFT_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;

// Validação de UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sanitização
- encodeURIComponent() no username
- Verificar campos obrigatórios antes de salvar
- Validar formato UUID retornado
```

---

## Dados Salvos por Fonte

| Campo | Frosthex | Mojang |
|-------|----------|--------|
| uuid | ✅ | ✅ |
| currentName | ✅ | ✅ |
| colorCode | ✅ | ❌ |
| boatType | ✅ | ❌ |
| boatMaterial | ✅ | ❌ |

---

## Checklist de Implementação

### Backend
- [ ] Criar `src/lib/minecraft-api.ts` com fetchers
- [ ] Criar `src/lib/leagues/driverActions.ts` com `createDriverFromAPI`
- [ ] Atualizar `src/lib/leagues/index.ts` com novo export
- [ ] Atualizar `prisma/schema.prisma` com novos campos
- [ ] Rodar `npx prisma migrate dev`
- [ ] Adicionar `FROSTHEX_API_KEY` ao `.env`

### Frontend
- [ ] Criar hook `useDebounce()`
- [ ] Atualizar modal de adicionar piloto
- [ ] Implementar estados: searching, creating, found, error
- [ ] Adicionar preview do jogador encontrado
- [ ] Tratar erros de API

### Testes
- [ ] Jogador existe no banco → seleciona direto
- [ ] Jogador na Frosthex → cria com dados completos
- [ ] Jogador só na Mojang → cria com dados básicos
- [ ] Jogador inexistente → erro amigável
- [ ] API offline → fallback ou retry
- [ ] Debounce funcionando corretamente

### Documentação
- [ ] Atualizar README com nova feature
- [ ] Documentar APIs utilizadas
- [ ] Explicar fluxo de fallback

---

## Considerações Futuras

1. **Sincronização periódica**: Atualizar dados dos jogadores (nomes podem mudar)
2. **Bulk import**: Permitir importar múltiplos jogadores de uma vez
3. **Cache distribuído**: Se escalar, considerar Redis para cache de API
4. **Rate limit próprio**: Implementar rate limit no nível da aplicação

---

## Changelog

| Data | Versão | Descrição |
|------|--------|-----------|
| 2025-02-27 | 1.0 | Plano inicial criado |
