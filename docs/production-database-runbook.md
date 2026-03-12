# Production Database Runbook (Railway)

## 1) Provisionamento inicial

1. Criar Postgres no Railway.
2. Configurar `DATABASE_URL` no ambiente de producao com a URL do Railway.
3. Executar migracoes Prisma no ambiente de deploy.

Nota:

- O `DATABASE_URL` atual de desenvolvimento aponta para banco de testes (Aiden).
- Nao sobrescrever esse valor para testes locais; separar por ambiente.

## 2) Backup diario (`pg_dump`)

Exemplo PowerShell:

```powershell
pg_dump "$env:DATABASE_URL" -Fc -f "backup-$(Get-Date -Format yyyy-MM-dd).dump"
```

Recomendacoes:

- manter 7-14 backups diarios;
- guardar copia fora do Railway;
- executar backup extra em dia de mudancas intensas.

## 3) Restore

Exemplo PowerShell:

```powershell
pg_restore --clean --if-exists --no-owner --no-privileges -d "$env:TARGET_DATABASE_URL" "backup-2026-03-11.dump"
```

## 4) Checklist de incidente

1. Confirmar status da instancia Railway.
2. Verificar credito/limites do trial.
3. Selecionar backup valido mais recente.
4. Restaurar em banco alternativo, se necessario.
5. Atualizar `DATABASE_URL`.
6. Validar login, paineis admin, leitura publica e mutacoes principais.

## 5) Checklist de troca de ambiente (Aiden -> Railway)

1. Confirmar URL do Railway (`postgres://...railway...`).
2. Definir URL apenas no ambiente de producao.
3. Rodar migracoes de producao (`bun prisma migrate deploy`).
4. Validar conectividade com query simples em producao.
5. Confirmar que ambiente local continua apontando para Aiden (teste).

## 6) SLO operacional inicial

- RPO: 24h.
- RTO: 4h para operacao basica.

## 7) Cadencia de verificacao

- Semanal: conferir backups gerados.
- Mensal: teste de restore.
- Trimestral: simulacao de migracao de banco.
