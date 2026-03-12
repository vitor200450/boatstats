# Production Database Design (Railway Trial)

## Understanding Summary

- Banco de producao inicial: PostgreSQL no Railway (trial/free).
- Objetivo: reduzir atrito operacional no lancamento, evitando comportamento serverless.
- Cenario inicial: baixo trafego.
- Banco deve permanecer em PostgreSQL puro para facilitar migracao futura.
- Backup diario obrigatorio para reduzir risco de perda de dados.
- Migracao futura provavel: DigitalOcean ou outro PostgreSQL gerenciado.
- O `DATABASE_URL` atual aponta para banco de testes (Aiden), nao para producao.

## Assumptions

- Operacao inicial feita por uma pessoa.
- RPO inicial: 24h.
- RTO inicial: 4h para recuperar operacao basica.
- Aplicacao segue com Prisma em `DATABASE_URL` unica.

## Explicit Non-Goals

- Multi-regiao e alta disponibilidade enterprise no lancamento.
- Replicacao entre provedores no dia 1.
- Otimizacao prematura para alto volume antes de sinais reais de uso.

## Chosen Approach

Abordagem escolhida: Railway PostgreSQL como banco primario.

Motivos:

- Menor carga operacional no contexto atual.
- Menor preocupacao com limites tipicos de serverless.
- Fluxo de deploy e operacao mais direto para lancamento rapido.
- Mantem portabilidade por usar PostgreSQL padrao.

## Operational Design

- Aplicacao conecta no PostgreSQL Railway via `DATABASE_URL`.
- Escritas e leituras operam normalmente, sem camada de degradacao por feature flag.
- Monitoramento de trial focado em:
  - consumo de credito;
  - uso de armazenamento;
  - disponibilidade da instancia.

## Environment Separation

- Local/dev pode continuar usando o banco de testes atual (Aiden).
- Producao deve usar `DATABASE_URL` separado, configurado apenas no ambiente de deploy (Railway/Vercel).
- Nunca reutilizar o `DATABASE_URL` de testes no ambiente de producao.
- Em caso de duvida, validar o host da URL antes de rodar migracao/seed.

## Data Protection and Recovery

- Backup diario com `pg_dump` logico.
- Backup armazenado fora do Railway.
- Retencao inicial recomendada: 7 a 14 dias.
- Fluxo de recuperacao/migracao:
  1. Escolher backup valido mais recente.
  2. Restaurar no banco destino.
  3. Atualizar `DATABASE_URL`.
  4. Validar login, painis admin e leitura publica.

## NFRs

- Performance: adequada para baixo trafego de lancamento.
- Escala: baixa inicialmente, com revisao por metricas reais.
- Seguranca: nivel essencial (credenciais privadas e TLS).
- Confiabilidade: restauracao operacional dentro de RTO inicial.
- Ownership: operacao manual simples.

## Risks and Mitigations

- Encerramento de trial/credito antes do previsto -> monitoramento semanal e plano de upgrade/migracao.
- Falha em backup/restore -> teste mensal de restauracao.
- Mudancas acumuladas entre backups diarios -> backup extra em dia critico.

## Validation Strategy

- Semanal: validar backup gerado e legivel.
- Mensal: restaurar backup em ambiente temporario.
- Trimestral: simular incidente de troca de `DATABASE_URL`.

## Decision Log

1. Troca de provedor: Neon -> Railway trial.
2. Manter PostgreSQL puro para reduzir lock-in.
3. Remover estrategia de modo degradado para o momento atual.
4. Reforcar backups diarios e restore como principal mitigacao de risco.
