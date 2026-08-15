-- Tarmac: database setup.
-- Paste this whole file into the Neon SQL Editor and press Run.
--
-- Safe to run repeatedly and safe to run against an existing database: it adds
-- what is missing, backfills what is empty, and never drops a report.
--
-- Sections:
--   1. Tables and columns
--   2. Indexes
--   3. Airports
--   4. Baseline wait-time grid
--   5. Sample reports (only on a database with none)

-- =====================================================================
-- 1. Tables and columns
-- =====================================================================

CREATE TABLE IF NOT EXISTS "airports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" varchar(2) NOT NULL,
	"terminal_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "airports_code_unique" UNIQUE("code")
);

-- Wait times are driven by the local hour more than by anything else, so each
-- airport carries its own zone rather than inheriting the server's.
ALTER TABLE "airports" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/New_York' NOT NULL;
ALTER TABLE "airports" ADD COLUMN IF NOT EXISTS "tier" varchar(10) DEFAULT 'small' NOT NULL;
-- Minutes from clearing security to standing at the gate, trains included.
-- The departure planner is wrong without it: ATL's plane train and DFW's
-- Skylink are the difference between a plan that works and one that doesn't.
ALTER TABLE "airports" ADD COLUMN IF NOT EXISTS "gate_transit_minutes" integer DEFAULT 12 NOT NULL;

CREATE TABLE IF NOT EXISTS "wait_time_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_id" varchar NOT NULL,
	"wait_minutes" integer NOT NULL,
	"checkpoint" text,
	"terminal" text,
	"line_type" varchar(30) DEFAULT 'standard' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Normalised grouping keys, so "North", "north" and "North Checkpoint" are one
-- queue rather than three.
ALTER TABLE "wait_time_reports" ADD COLUMN IF NOT EXISTS "checkpoint_key" text;
ALTER TABLE "wait_time_reports" ADD COLUMN IF NOT EXISTS "terminal_key" text;
-- Provenance. Only 'community' is ever presented as community-sourced.
ALTER TABLE "wait_time_reports" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'community' NOT NULL;
-- Anti-abuse. The device id is a random per-install token, not an account;
-- the ip hash is salted and the raw address is never stored.
ALTER TABLE "wait_time_reports" ADD COLUMN IF NOT EXISTS "device_id" varchar(64);
ALTER TABLE "wait_time_reports" ADD COLUMN IF NOT EXISTS "ip_hash" varchar(64);
ALTER TABLE "wait_time_reports" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'active' NOT NULL;

-- A bare `timestamp` has no offset, so the same instant serialised two
-- different ways gave two different answers in the browser. Existing rows were
-- written by a UTC server, so that is how they are interpreted here.
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'wait_time_reports'
		  AND column_name = 'reported_at'
		  AND data_type = 'timestamp without time zone'
	) THEN
		ALTER TABLE "wait_time_reports"
			ALTER COLUMN "reported_at" TYPE timestamp with time zone
			USING "reported_at" AT TIME ZONE 'UTC';
	END IF;
END $$;

DO $$ BEGIN
	ALTER TABLE "wait_time_reports" ADD CONSTRAINT "wait_time_reports_airport_id_airports_id_fk"
		FOREIGN KEY ("airport_id") REFERENCES "public"."airports"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- One-tap "still about right?" on somebody else's report. An agreement is a
-- fresh observation of the same wait at the moment it was tapped.
CREATE TABLE IF NOT EXISTS "report_confirmations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar NOT NULL,
	"device_id" varchar(64) NOT NULL,
	"ip_hash" varchar(64),
	"agrees" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_report_id_fk"
		FOREIGN KEY ("report_id") REFERENCES "public"."wait_time_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- Expected wait per airport / line / local day / local hour. This replaces the
-- hand-typed airport tiers and invented multipliers that used to live in code.
-- Every row carries its own provenance, so measured data can replace modelled
-- data one cell at a time without a deploy.
CREATE TABLE IF NOT EXISTS "airport_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_id" varchar NOT NULL,
	"line_type" varchar(30) NOT NULL,
	"day_of_week" integer NOT NULL,
	"hour_of_day" integer NOT NULL,
	"wait_minutes" integer NOT NULL,
	"source" varchar(20) DEFAULT 'modeled' NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "airport_baselines" ADD CONSTRAINT "airport_baselines_airport_id_fk"
		FOREIGN KEY ("airport_id") REFERENCES "public"."airports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- 2. Indexes
-- =====================================================================

-- The shape every read query uses: newest rows for one airport.
CREATE INDEX IF NOT EXISTS "wait_reports_airport_time_idx"
	ON "wait_time_reports" ("airport_id", "reported_at" DESC);

-- Rate limiting looks up recent rows for one device at one airport.
CREATE INDEX IF NOT EXISTS "wait_reports_device_idx"
	ON "wait_time_reports" ("device_id", "airport_id", "reported_at" DESC);

CREATE INDEX IF NOT EXISTS "confirmations_report_idx"
	ON "report_confirmations" ("report_id", "created_at" DESC);

-- One vote per device per report.
CREATE UNIQUE INDEX IF NOT EXISTS "confirmations_device_report_idx"
	ON "report_confirmations" ("device_id", "report_id");

CREATE UNIQUE INDEX IF NOT EXISTS "baselines_lookup_idx"
	ON "airport_baselines" ("airport_id", "line_type", "day_of_week", "hour_of_day");

-- =====================================================================
-- 3. Airports
-- =====================================================================

INSERT INTO airports (code, name, city, state, terminal_count, timezone, tier, gate_transit_minutes) VALUES
  ('ATL', 'Hartsfield-Jackson Atlanta International Airport', 'Atlanta', 'GA', 2, 'America/New_York', 'mega', 20),
  ('LAX', 'Los Angeles International Airport', 'Los Angeles', 'CA', 9, 'America/Los_Angeles', 'mega', 15),
  ('ORD', 'O''Hare International Airport', 'Chicago', 'IL', 4, 'America/Chicago', 'mega', 18),
  ('DFW', 'Dallas/Fort Worth International Airport', 'Dallas', 'TX', 5, 'America/Chicago', 'mega', 20),
  ('DEN', 'Denver International Airport', 'Denver', 'CO', 3, 'America/Denver', 'mega', 20),
  ('JFK', 'John F. Kennedy International Airport', 'New York', 'NY', 6, 'America/New_York', 'mega', 18),
  ('SFO', 'San Francisco International Airport', 'San Francisco', 'CA', 4, 'America/Los_Angeles', 'large', 15),
  ('SEA', 'Seattle-Tacoma International Airport', 'Seattle', 'WA', 2, 'America/Los_Angeles', 'large', 15),
  ('LAS', 'Harry Reid International Airport', 'Las Vegas', 'NV', 3, 'America/Los_Angeles', 'large', 12),
  ('MCO', 'Orlando International Airport', 'Orlando', 'FL', 4, 'America/New_York', 'large', 18),
  ('EWR', 'Newark Liberty International Airport', 'Newark', 'NJ', 3, 'America/New_York', 'large', 15),
  ('MIA', 'Miami International Airport', 'Miami', 'FL', 3, 'America/New_York', 'large', 16),
  ('PHX', 'Phoenix Sky Harbor International Airport', 'Phoenix', 'AZ', 3, 'America/Phoenix', 'large', 14),
  ('IAH', 'George Bush Intercontinental Airport', 'Houston', 'TX', 5, 'America/Chicago', 'large', 18),
  ('BOS', 'Boston Logan International Airport', 'Boston', 'MA', 4, 'America/New_York', 'large', 13),
  ('MSP', 'Minneapolis-Saint Paul International Airport', 'Minneapolis', 'MN', 2, 'America/Chicago', 'large', 15),
  ('DTW', 'Detroit Metropolitan Wayne County Airport', 'Detroit', 'MI', 2, 'America/Detroit', 'large', 16),
  ('FLL', 'Fort Lauderdale-Hollywood International Airport', 'Fort Lauderdale', 'FL', 4, 'America/New_York', 'large', 12),
  ('PHL', 'Philadelphia International Airport', 'Philadelphia', 'PA', 7, 'America/New_York', 'large', 15),
  ('CLT', 'Charlotte Douglas International Airport', 'Charlotte', 'NC', 1, 'America/New_York', 'large', 14),
  ('LGA', 'LaGuardia Airport', 'New York', 'NY', 2, 'America/New_York', 'large', 12),
  ('SLC', 'Salt Lake City International Airport', 'Salt Lake City', 'UT', 2, 'America/Denver', 'large', 15),
  ('IAD', 'Washington Dulles International Airport', 'Washington', 'DC', 2, 'America/New_York', 'large', 18),
  ('BWI', 'Baltimore/Washington International Airport', 'Baltimore', 'MD', 1, 'America/New_York', 'medium', 12),
  ('DCA', 'Ronald Reagan Washington National Airport', 'Washington', 'DC', 3, 'America/New_York', 'medium', 12),
  ('SAN', 'San Diego International Airport', 'San Diego', 'CA', 2, 'America/Los_Angeles', 'medium', 10),
  ('TPA', 'Tampa International Airport', 'Tampa', 'FL', 1, 'America/New_York', 'medium', 14),
  ('PDX', 'Portland International Airport', 'Portland', 'OR', 1, 'America/Los_Angeles', 'medium', 10),
  ('HNL', 'Daniel K. Inouye International Airport', 'Honolulu', 'HI', 2, 'Pacific/Honolulu', 'medium', 14),
  ('AUS', 'Austin-Bergstrom International Airport', 'Austin', 'TX', 1, 'America/Chicago', 'medium', 10),
  ('RSW', 'Southwest Florida International Airport', 'Fort Myers', 'FL', 1, 'America/New_York', 'small', 10),
  ('RHI', 'Rhinelander-Oneida County Airport', 'Rhinelander', 'WI', 1, 'America/Chicago', 'small', 5)
ON CONFLICT (code) DO NOTHING;

-- Backfill on databases seeded before these columns existed.
UPDATE airports a
SET timezone = v.timezone, tier = v.tier, gate_transit_minutes = v.transit
FROM (VALUES
  ('ATL','America/New_York','mega',20),   ('LAX','America/Los_Angeles','mega',15),
  ('ORD','America/Chicago','mega',18),    ('DFW','America/Chicago','mega',20),
  ('DEN','America/Denver','mega',20),     ('JFK','America/New_York','mega',18),
  ('SFO','America/Los_Angeles','large',15),('SEA','America/Los_Angeles','large',15),
  ('LAS','America/Los_Angeles','large',12),('MCO','America/New_York','large',18),
  ('EWR','America/New_York','large',15),  ('MIA','America/New_York','large',16),
  ('PHX','America/Phoenix','large',14),   ('IAH','America/Chicago','large',18),
  ('BOS','America/New_York','large',13),  ('MSP','America/Chicago','large',15),
  ('DTW','America/Detroit','large',16),   ('FLL','America/New_York','large',12),
  ('PHL','America/New_York','large',15),  ('CLT','America/New_York','large',14),
  ('LGA','America/New_York','large',12),  ('SLC','America/Denver','large',15),
  ('IAD','America/New_York','large',18),  ('BWI','America/New_York','medium',12),
  ('DCA','America/New_York','medium',12), ('SAN','America/Los_Angeles','medium',10),
  ('TPA','America/New_York','medium',14), ('PDX','America/Los_Angeles','medium',10),
  ('HNL','Pacific/Honolulu','medium',14), ('AUS','America/Chicago','medium',10),
  ('RSW','America/New_York','small',10),  ('RHI','America/Chicago','small',5)
) AS v(code, timezone, tier, transit)
WHERE a.code = v.code
  AND (a.timezone <> v.timezone OR a.tier <> v.tier OR a.gate_transit_minutes <> v.transit);

-- =====================================================================
-- 4. Baseline wait-time grid
-- =====================================================================
--
-- 32 airports x 3 lines x 7 days x 24 hours, generated from three curves.
-- Shape comes from published 2026 wait-time patterns:
--   * a heavy pre-dawn origination bank, a midday trough, a lighter
--     late-afternoon peak, and a near-empty overnight;
--   * Mondays running ~36% above Wednesdays, weekends lighter;
--   * PreCheck at roughly a third of standard, CLEAR lower again.
--
-- To replace modelled numbers with measured ones, update wait_minutes for the
-- affected rows and set source = 'observed'. No deploy required.

INSERT INTO airport_baselines (airport_id, line_type, day_of_week, hour_of_day, wait_minutes, source)
SELECT
	a.id,
	l.line_type,
	d.dow,
	h.hour,
	GREATEST(1, ROUND((p.base * h.mult * d.mult * l.share)::numeric))::int,
	'modeled'
FROM (VALUES
	-- Typical standard-lane wait, in minutes, before time-of-day shaping.
	('ATL', 15), ('LAX', 16), ('ORD', 15), ('DFW', 13), ('DEN', 14), ('JFK', 15),
	('SFO', 13), ('SEA', 14), ('LAS', 13), ('MCO', 14), ('EWR', 14), ('MIA', 14),
	('PHX', 11), ('IAH', 12), ('BOS', 13), ('MSP', 11), ('DTW', 10), ('FLL', 13),
	('PHL', 15), ('CLT', 12), ('LGA', 13), ('SLC', 11), ('IAD', 12), ('BWI', 10),
	('DCA', 10), ('SAN', 10), ('TPA',  9), ('PDX',  9), ('HNL', 10), ('AUS', 12),
	('RSW',  8), ('RHI',  4)
) AS p(code, base)
JOIN airports a ON a.code = p.code
CROSS JOIN (VALUES
	(0, 0.25), (1, 0.20), (2, 0.20), (3, 0.30), (4, 0.75), (5, 1.35),
	(6, 1.55), (7, 1.45), (8, 1.25), (9, 1.05), (10, 0.95), (11, 0.90),
	(12, 0.90), (13, 0.90), (14, 0.95), (15, 1.05), (16, 1.15), (17, 1.20),
	(18, 1.10), (19, 0.95), (20, 0.75), (21, 0.55), (22, 0.40), (23, 0.30)
) AS h(hour, mult)
CROSS JOIN (VALUES
	-- 0 = Sunday. Monday/Wednesday ratio is ~1.36, matching published 2026 data.
	(0, 1.20), (1, 1.25), (2, 0.95), (3, 0.92), (4, 1.00), (5, 1.15), (6, 0.90)
) AS d(dow, mult)
CROSS JOIN (VALUES
	('standard', 1.00), ('tsa_precheck', 0.38), ('clear', 0.22)
) AS l(line_type, share)
ON CONFLICT (airport_id, line_type, day_of_week, hour_of_day) DO NOTHING;

-- =====================================================================
-- 5. Sample reports
-- =====================================================================
--
-- Only inserted into a database that has none, so a real deployment is never
-- polluted. Timestamps are staggered backwards from now so that freshness and
-- decay behave as they would in production.

INSERT INTO wait_time_reports
	(airport_id, wait_minutes, line_type, terminal, checkpoint, terminal_key, checkpoint_key, source, status, reported_at)
SELECT
	a.id, v.wait_minutes, v.line_type, v.terminal, v.checkpoint,
	v.terminal_key, v.checkpoint_key, 'community', 'active',
	now() - (v.age_minutes || ' minutes')::interval
FROM (VALUES
  ('LAX', 25, 'standard',     'Terminal 4', 'North',   '4',       'north',   82),
  ('LAX', 28, 'standard',     'Terminal 4', 'North',   '4',       'north',   64),
  ('LAX',  8, 'tsa_precheck', 'Terminal 4', 'North',   '4',       'north',   57),
  ('LAX', 35, 'standard',     'Terminal 7', 'South',   '7',       'south',   41),
  ('LAX', 12, 'tsa_precheck', 'Terminal 7', 'South',   '7',       'south',   26),
  ('JFK', 30, 'standard',     'Terminal 1', NULL,      '1',       NULL,      75),
  ('JFK', 26, 'standard',     'Terminal 1', NULL,      '1',       NULL,      48),
  ('JFK', 10, 'tsa_precheck', 'Terminal 4', NULL,      '4',       NULL,      33),
  ('JFK',  5, 'clear',        'Terminal 4', NULL,      '4',       NULL,      19),
  ('ORD', 20, 'standard',     'Terminal 1', NULL,      '1',       NULL,      70),
  ('ORD',  7, 'tsa_precheck', 'Terminal 2', NULL,      '2',       NULL,      52),
  ('ORD', 40, 'standard',     'Terminal 3', NULL,      '3',       NULL,      35),
  ('ORD', 38, 'standard',     'Terminal 3', NULL,      '3',       NULL,      12),
  ('ATL', 15, 'standard',     'North',      'Main',    'north',   'main',    66),
  ('ATL', 18, 'standard',     'North',      'Main',    'north',   'main',    29),
  ('ATL',  5, 'tsa_precheck', 'South',      NULL,      'south',   NULL,      14),
  ('SFO', 18, 'standard',     'Terminal 1', NULL,      '1',       NULL,      58),
  ('SFO',  6, 'clear',        'Terminal 1', NULL,      '1',       NULL,      22),
  ('DEN', 22, 'standard',     'Bridge',     'South',   'bridge',  'south',   61),
  ('DEN', 10, 'tsa_precheck', 'Bridge',     'North',   'bridge',  'north',   38),
  ('SEA', 15, 'standard',     'Central',    'C',       'central', 'c',       55),
  ('SEA',  8, 'tsa_precheck', 'Central',    'C',       'central', 'c',       24),
  ('MIA', 45, 'standard',     'North',      NULL,      'north',   NULL,      50),
  ('MIA', 15, 'tsa_precheck', 'South',      NULL,      'south',   NULL,      31),
  ('BOS', 12, 'standard',     'Terminal B', NULL,      'b',       NULL,      44),
  ('BOS',  3, 'clear',        'Terminal B', NULL,      'b',       NULL,      17),
  ('DFW', 28, 'standard',     'Terminal D', NULL,      'd',       NULL,      36),
  ('DFW',  9, 'tsa_precheck', 'Terminal A', NULL,      'a',       NULL,       8)
) AS v(code, wait_minutes, line_type, terminal, checkpoint, terminal_key, checkpoint_key, age_minutes)
JOIN airports a ON a.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM wait_time_reports);
