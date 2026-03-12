# Brainstorming: Ice Boat Racing Dashboard

## 🎯 Understanding Summary

- **What is being built:** A unified web dashboard for the Ice Boat Racing community that centralizes race results, track records, and player statistics across multiple leagues and servers.
- **Why it exists:** To replace slow, fragmented, manual spreadsheet tracking. It automates result ingestion and creates a durable, easily accessible career history for players.
- **Who it is for:**
  - **Players/Public:** Access consolidated public profiles (searchable by nick/UUID) to view their stats, podiums, and history across all leagues without needing an account.
  - **League Organizers:** Log in to manage their leagues, configure custom point systems, and trigger the import of race events via an external API.
- **Key constraints:**
  - Low/zero hosting cost for the MVP (Vercel + Serverless Database like Supabase/Neon).
  - Development will start with a local Docker PostgreSQL database.
  - High performance required for public pages (leveraging Next.js aggressive caching/ISR).
- **Explicit non-goals (for MVP):**
  - No automated webhook synchronization (data fetch triggered manually by admins using the event ID).
  - No mandatory login or private dashboards for regular players.
  - No live telemetry or real-time race tracking.

## 🧱 Assumptions

1.  **Source of Truth:** External server APIs (e.g., TimingSystem plugin) provide immutable race results (times, positions, fast laps).
2.  **Identity:** Player career tracking is strictly tied to their Minecraft `uuid` to ensure data persists across nickname changes.
3.  **Security:** Only authenticated league organizers can fetch and save data for the tournaments they manage.
4.  **Points Calculation:** The dashboard calculates championship points locally during the import process, based on customizable rules defined by the league admin.

## 📓 Decision Log

- **Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS + Prisma + Docker (PostgreSQL). Chosen for zero-config deployment on Vercel and excellent static generation/caching for public profiles.
- **Data Ingestion:** Manual trigger by admins using the event ID (e.g., `W4FC-26-R5-Monaco`). This keeps the MVP simple and avoids stressing server APIs with polling or managing webhooks.
- **User Interaction:** Public, searchable profiles for all players based on aggregated race data. Minimal barrier to entry for the community.
- **Championship Points:** Admins configure custom point systems per league. The dashboard calculates points upon importing the race results.
- **API Integrations (MVP Scope):**
  - `/events/results/:eventname`: Core ingestion of race data.
  - `/tracks`: Synchronize official track lists to enable global "Track Statistics" and lap records.
  - `/players/:uuid`: Enhance player profiles with live server data (playtime, coins, etc.) alongside their racing history.

## 📐 High-Level Design

### 1. Architecture

- **Frontend:** Next.js App Router providing Server-Side Rendering (SSR) and Incremental Static Regeneration (ISR) for blisteringly fast public pages.
- **Backend:** Next.js Server Actions / API Routes handling authentication and external API communication.
- **Database:** PostgreSQL (local via Docker for dev, serverless for prod) managed by ORM (Prisma).
- **External Integration:** REST API calls to Minecraft server plugins (e.g., Frosthex TimingSystem).

### 2. Core Entities (Prisma Schema)

- **User:** Dashboard administrators (email/password or OAuth).
- **League:** Represents a racing championship. Has custom point distribution rules. Managed by a User.
- **Track:** Synchronized from the external API. Stores global records.
- **Event:** A specific race weekend (e.g., "Monaco R5"). Belongs to a League. Tracks import status.
- **Driver:** The universal player entity, identified by `uuid`.
- **Result:** The intersection of Event and Driver. Stores finish position, total time, fastest lap, and calculated championship points.

### 3. Key Workflows

- **League Setup:** Admin creates a "Season 26" league and defines that 1st place gets 25 pts, 2nd gets 18 pts, etc., plus 1 pt for fastest lap.
- **Race Import:** Admin enters `W4FC-26-R5-Monaco`. The backend fetches the JSON, creates the Event, calculates points for all 50 drivers based on the league's rules, and saves the Results.
- **Profile Viewing:** A user searches for "_RioluTM_". The system fetches all Results linked to their UUID across all Leagues, calculates their global win rate, and optionally hits the `/players/:uuid` API for real-time server stats.
