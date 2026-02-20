# GateCheck - Airport Security Wait Times

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
- `server/storage.ts` - Database storage layer
- `server/seed.ts` - Seed data (30 US airports + sample reports)
- `client/src/pages/home.tsx` - Home page with airport list and search
- `client/src/pages/airport.tsx` - Airport detail with reports and submission form
- `client/src/lib/utils.ts` - Shared utility functions for wait time formatting

## API Endpoints
- `GET /api/airports` - List all airports with aggregated wait time stats
- `GET /api/airports/:code` - Get single airport by code
- `GET /api/reports/:code` - Get recent reports for an airport
- `POST /api/reports` - Submit a new wait time report

## Data Model
- **airports**: code, name, city, state, terminal_count
- **waitTimeReports**: airportId, waitMinutes, checkpoint, terminal, lineType, reportedAt
- Wait time averages calculated from reports in last 24 hours

## Running
- `npm run dev` starts both backend and frontend on port 5000
- `npm run db:push` syncs database schema
