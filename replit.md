# Tarmac - Airport Security Wait Times

## Overview
A crowdsourced airport security wait time app (like Waze for TSA lines). Users can browse airports, see current wait times, and submit their own reports to help fellow travelers.

## Architecture
- **Frontend**: React + Vite with Tailwind CSS and shadcn/ui components
- **Backend**: Express.js API
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (client-side)

## Key Files
- `shared/schema.ts` - Data models (airports, waitTimeReports)
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database storage layer with wait time blending logic
- `server/estimator.ts` - Wait time estimation engine (time-of-day, day-of-week, airport size)
- `server/seed.ts` - Seed data (30 US airports + sample reports)
- `client/src/pages/home.tsx` - Home page with airport list and search
- `client/src/pages/airport.tsx` - Airport detail with reports and submission form
- `client/src/lib/utils.ts` - Shared utility functions for wait time formatting and data source display

## API Endpoints
- `GET /api/airports` - List all airports with aggregated wait time stats
- `GET /api/airports/:code` - Get single airport by code
- `GET /api/reports/:code` - Get recent reports for an airport
- `GET /api/checkpoints/:code` - Get per-checkpoint average wait times (last 24h)
- `POST /api/reports` - Submit a new wait time report

## Data Model
- **airports**: code, name, city, state, terminal_count
- **waitTimeReports**: airportId, waitMinutes, checkpoint, terminal, lineType, reportedAt
- Wait time averages calculated from reports in last 24 hours
- Smart estimation engine provides baseline wait times based on airport size, time of day, and day of week
- Blending logic: <3 community reports = blended with estimates, 3+ reports = pure community data, 0 reports = estimated only
- AirportWithStats includes `dataSource` field: "community" | "estimated" | "blended"

## Running
- `npm run dev` starts both backend and frontend on port 5000
- `npm run db:push` syncs database schema
