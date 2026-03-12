# AGENTS.md - Boat Racing Dashboard

This file contains guidelines for AI agents working on this codebase.

## Build/Lint/Test Commands

```bash
# Development
bun dev              # Start Next.js dev server

# Build
bun run build        # Production build
bun start            # Start production server

# Linting
bun run lint         # Run ESLint (eslint-config-next)

# Database
bun prisma migrate dev    # Run migrations
bun prisma db seed        # Seed database
bun prisma generate       # Generate Prisma client
```

**Note:** No test framework is currently configured. Tests should be added using Vitest or Jest if needed.

## Code Style Guidelines

### TypeScript
- **Target:** ES2017, strict mode enabled
- **Module:** ESNext with bundler resolution
- Use explicit return types on exported functions
- Prefer `type` over `interface` for object shapes
- Use `@/*` path alias for imports from `src/`

### Imports
```typescript
// 1. External libraries (React, Next.js)
import { revalidatePath } from "next/cache";
import { z } from "zod";

// 2. Internal absolute imports (@/*)
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// 3. Relative imports (same directory)
import { F1_STANDARD_POINTS } from "./pointsSystem";
```

### Naming Conventions
- **Components:** PascalCase (e.g., `StandingsClient.tsx`)
- **Functions:** camelCase (e.g., `createLeague`, `getMyLeagues`)
- **Files:** camelCase for utilities, PascalCase for components
- **Database models:** PascalCase (Prisma convention)
- **Environment variables:** UPPER_SNAKE_CASE

### Error Handling
- Use try/catch blocks in server actions
- Return standardized response objects:
```typescript
return { success: true, data: result };
return { success: false, error: "Error message" };
```
- Log errors with `console.error()` for debugging
- Use Zod for input validation with descriptive messages

### Validation (Zod v4)
- Define schemas in `src/lib/validations/`
- Export both schema and inferred type:
```typescript
export const createLeagueSchema = z.object({...});
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
```
- Use `.safeParse()` for validation in server actions
- Provide Portuguese error messages for user-facing validation

### Server Actions
- Mark with `"use server"` at top of file
- Always check authentication first
- Use `revalidatePath()` after mutations
- Return consistent response format

### Styling (Tailwind CSS v4)
- Use Tailwind utility classes
- Dark theme is primary (zinc/cyan color palette)
- Use `font-mono` for headings and data
- Common patterns:
  - Cards: `bg-zinc-900 border border-zinc-800 rounded-xl`
  - Accent: `text-cyan-400`
  - Hover: `hover:border-cyan-500/50 transition-colors`

### Database (Prisma)
- Use singleton Prisma client pattern (`src/lib/prisma.ts`)
- Use transactions for multi-step operations
- Include related data with `select` for type safety
- Soft delete preferred over hard delete

### Authentication (NextAuth v5)
- Use `auth()` from `@/auth` in server actions
- Check `session.user.role` for authorization
- Roles: `SUPER_ADMIN`, `ADMIN`, `USER`

### File Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (public)/          # Public route group
│   ├── admin/             # Admin routes
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout
├── components/            # React components
├── lib/                   # Utilities
│   ├── validations/       # Zod schemas
│   ├── leagues/           # League actions
│   └── prisma.ts          # Database client
├── services/              # External API clients
└── types/                 # TypeScript types
```

### Environment Variables
Required variables (in `.env`):
- `DATABASE_URL` - PostgreSQL connection
- `NEXTAUTH_SECRET` - Auth secret
- `NEXTAUTH_URL` - App URL
- `AWS_*` - S3 credentials for uploads

## Important Notes

- **Language:** UI is in Portuguese (Brazil)
- **No tests:** Add Vitest/Jest if testing is needed
- **Bun:** Use `bun` instead of `npm`/`yarn`
- **Next.js 16:** Uses React 19 with new features

## Agent Workflow Guidelines

### Do NOT run build or dev commands after changes
- **Never run** `bun run build` or `bun run dev` after completing code changes
- These commands only delay the development process unnecessarily
- The user can run these commands themselves when needed
- **Exception:** Only run `bun run lint` if explicitly requested or if there's a clear syntax error that needs verification
