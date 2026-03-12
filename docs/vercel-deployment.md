# Vercel Deployment - BoatStats

Este guia configura o deploy do BoatStats na Vercel com banco de producao no Railway.

## 1) Criar projeto na Vercel

1. Importar o repositorio GitHub na Vercel.
2. Nome do projeto: `BoatStats`.
3. Framework preset: `Next.js`.
4. Root directory: `.`.
5. Deploy branch de producao: `main` (ou a branch que voce usa para release).

## 2) Configuracoes de Build

- Package manager: Bun (detectado por `bun.lock`).
- Install command: padrao (ou `bun install --frozen-lockfile`).
- Build command: padrao (ou `bun run build`).
- Output directory: padrao do Next.js.

## 3) Variaveis de ambiente (separadas por ambiente)

Defina no painel da Vercel em **Project Settings -> Environment Variables**.

### Production

- `DATABASE_URL` -> URL do PostgreSQL no Railway (producao).
- `AUTH_SECRET` -> segredo forte (32+ bytes).
- `AUTH_URL` -> `https://boatstats.vercel.app` (ou dominio final).
- `AUTH_TRUST_HOST` -> `true`.
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`.
- `FROSTHEX_API_KEY`.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
- `R2_ENDPOINT` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL`.

### Preview

- `DATABASE_URL` -> banco de preview/teste (nao usar producao).
  - Pode continuar usando o banco de teste atual (Aiden) enquanto necessario.
- Demais segredos podem ser separados de producao quando possivel.

### Development (opcional no painel)

- Normalmente fica local em `.env`.
- Se usar Vercel Dev, definir variaveis equivalentes de desenvolvimento.

## 4) Banco de dados e migracoes

Para producao, rode migracoes no pipeline/deploy:

```bash
bun prisma migrate deploy
```

Boa pratica: executar esse comando como etapa de release antes do trafego entrar no novo deploy.

## 5) OAuth Discord (obrigatorio)

No app do Discord, cadastre callback de producao:

- `https://boatstats.vercel.app/api/auth/callback/discord`

Se quiser login em preview, adicione callbacks de preview dedicados e avalie risco.

## 6) Runtime (Edge vs Serverless)

- Este projeto usa Prisma + APIs Node, entao mantenha runtime padrao (Node/Serverless).
- Evite Edge Runtime nas rotas que dependem de APIs Node.

## 7) Caching e consistencia

- O projeto usa `revalidatePath` em mutacoes administrativas.
- Mantenha esse padrao para evitar dados stale apos deploy/mutacoes.

## 8) Checklist pre-go-live

1. `DATABASE_URL` de producao aponta para Railway (nao Aiden).
2. Preview usa banco separado de producao.
3. `AUTH_URL` igual ao dominio final da Vercel.
4. Callback do Discord configurado para producao.
5. Migracoes aplicadas com `bun prisma migrate deploy`.
6. Upload (R2) validado em producao.
7. Backup diario do banco configurado fora da Vercel/Railway.

## 9) Seguranca

- Nunca use segredos com prefixo `NEXT_PUBLIC_`.
- Segredos devem ficar apenas em Environment Variables da Vercel.
- Se algum segredo for exposto acidentalmente, rotacione imediatamente.
