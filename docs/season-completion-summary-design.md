# Design: Resumo de Finalizacao de Temporada

## Entendimento Consolidado

- O sistema precisa exibir informacoes finais de temporada sem quebrar o fluxo atual.
- O publico-alvo e duplo: administradores e usuarios publicos.
- A exibicao deve acontecer nas telas existentes, sem criar rota nova.
- O bloco aparece apenas quando `season.status === "COMPLETED"`.
- O conteudo deve ser essencial: campeao de pilotos, campeao de equipes, top 3 de cada, total de corridas concluidas.
- O bloco inclui links uteis para aprofundamento (classificacao e corridas).
- A solucao deve seguir perfil nao-funcional padrao leve.

## Escopo e Nao-Escopo

### Incluido

- Bloco de "Temporada Finalizada" no admin e no publico.
- Reuso de dados ja carregados nas paginas, com ajuste minimo se necessario.
- Componente compartilhado de apresentacao para evitar divergencia visual/funcional.
- Fallback visual para cenarios com dados incompletos.

### Nao incluido

- Nova pagina/rota dedicada para resultados finais.
- Novo pipeline de cache/pre-calculo especifico para este bloco.
- Mudanca no fluxo de navegacao global.

## Abordagem Aprovada

Implementar o resumo final dentro das paginas ja existentes, usando um componente compartilhado.

- Admin: `src/app/admin/leagues/[id]/seasons/[seasonId]/page.tsx`
- Publico: `src/app/(public)/leagues/[id]/page.tsx` (temporada selecionada)
- Gate unico: renderizar apenas para `COMPLETED`.

## Arquitetura Proposta

### Responsabilidades

- Paginas (admin/publico):
  - Determinam contexto, permissao e temporada selecionada.
  - Montam payload do resumo final a partir de dados ja disponiveis.
  - Definem links de navegacao coerentes com cada contexto.

- Componente compartilhado (`SeasonFinalSummary`, nome sugerido):
  - Recebe dados prontos via props.
  - Renderiza campeoes, top 3, corridas concluidas e acoes.
  - Aplica fallback de apresentacao quando faltar informacao.

### Contrato de Dados (conceitual)

- `driverChampion` (opcional)
- `teamChampion` (opcional)
- `topDrivers` (0..3)
- `topTeams` (0..3)
- `completedRacesCount` (numero)
- `links` (classificacao e corridas)

## Regras de Dados

- Campeao de pilotos: primeiro de `standings` tipo `DRIVER` por posicao.
- Campeao de equipes: primeiro de `standings` tipo `TEAM` por posicao.
- Top 3: tres primeiros (ou menos, se nao houver).
- Corridas concluidas: contagem de corridas finalizadas com criterio unico e consistente entre admin/publico.

## Comportamento de Fallback

- Sem campeao de pilotos/equipes: mostrar texto de dados insuficientes.
- Top 3 parcial: renderizar apenas os itens disponiveis.
- Zero corridas concluidas: mostrar estado explicito sem bloquear links.
- Ausencia parcial de dados nunca deve ocultar os links uteis.

## UX e Navegacao

- Sem nova rota, sem novo ponto de entrada.
- Bloco aparece no fluxo natural da pagina de temporada/liga.
- Aprofundamento por links:
  - Admin: classificacao completa e corridas da temporada.
  - Publico: links equivalentes mantendo contexto da temporada selecionada.
- Meta de fluxo: no maximo 1 clique extra para aprofundar.

## Requisitos Nao-Funcionais (Acordados)

- Performance: manter custo equivalente ao da pagina atual (sem query pesada extra).
- Escala: adequada para dezenas de ligas/temporadas sem otimizacao adicional.
- Seguranca/privacidade: expor apenas dados ja permitidos no contexto da tela.
- Confiabilidade: degradacao elegante em dados incompletos.
- Manutencao/ownership: mesmo modulo das paginas de liga/temporada.

## Riscos e Mitigacoes

- Divergencia admin vs publico:
  - Mitigacao: componente compartilhado e contrato unico de props.
- Criterio diferente de "corrida concluida":
  - Mitigacao: padronizar criterio em ambos os contextos.
- Temporadas antigas com dados faltantes:
  - Mitigacao: fallback textual + links sempre disponiveis.

## Validacao de Design (Cenarios)

- `COMPLETED` com dados completos: bloco completo em admin e publico.
- `COMPLETED` com dados parciais: bloco com fallback, sem quebrar layout.
- `ACTIVE`, `DRAFT`, `ARCHIVED`: bloco nao renderiza.
- Links levam para classificacao/corridas corretas sem mudar fluxo principal.

## Decision Log

1. **Onde exibir**
   - Decisao: telas existentes (admin + publico), sem rota nova.
   - Alternativas: pagina dedicada; resumo so em listagem.
   - Motivo: menor risco e menor custo de manutencao.

2. **Escopo de informacao**
   - Decisao: conteudo essencial.
   - Alternativas: essencial + narrativa; completo com recordes.
   - Motivo: foco em clareza (YAGNI).

3. **Gate de exibicao**
   - Decisao: apenas `COMPLETED`.
   - Alternativas: `COMPLETED` + `ARCHIVED`; exibicao em todos os status.
   - Motivo: semantica clara de fechamento final.

4. **Interacao**
   - Decisao: informativo + links uteis.
   - Alternativas: somente informativo; CTA unico.
   - Motivo: preserva fluxo e permite aprofundamento rapido.

5. **Criterio de nao quebrar fluxo**
   - Decisao: sem rota nova e no maximo 1 clique extra.
   - Alternativas: zero clique extra; aceitar rota interna nova.
   - Motivo: equilibrio entre simplicidade e utilidade.

6. **Qualidade nao-funcional**
   - Decisao: perfil padrao leve.
   - Alternativas: robusto com cache dedicado; minimo sem fallback.
   - Motivo: menor complexidade agora, sem comprometer usabilidade.

## Status

Design validado para handoff de implementacao incremental.
