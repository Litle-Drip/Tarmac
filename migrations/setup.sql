-- Tarmac: one-time database setup.
-- Paste this whole file into the Neon SQL Editor and press Run.
-- It creates the tables and fills them with starter data.
-- Safe to run twice: it will not duplicate anything.

-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS "airports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" varchar(2) NOT NULL,
	"terminal_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "airports_code_unique" UNIQUE("code")
);

CREATE TABLE IF NOT EXISTS "wait_time_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_id" varchar NOT NULL,
	"wait_minutes" integer NOT NULL,
	"checkpoint" text,
	"terminal" text,
	"line_type" varchar(30) DEFAULT 'standard' NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "wait_time_reports" ADD CONSTRAINT "wait_time_reports_airport_id_airports_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airports"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
-- ---------- Starter data ----------

-- Tarmac seed data: US airports plus sample wait-time reports.
-- Safe to re-run: existing airports and reports are left untouched.

INSERT INTO airports (code, name, city, state, terminal_count) VALUES
  ('ATL', 'Hartsfield-Jackson Atlanta International Airport', 'Atlanta', 'GA', 2),
  ('LAX', 'Los Angeles International Airport', 'Los Angeles', 'CA', 9),
  ('ORD', 'O''Hare International Airport', 'Chicago', 'IL', 4),
  ('DFW', 'Dallas/Fort Worth International Airport', 'Dallas', 'TX', 5),
  ('DEN', 'Denver International Airport', 'Denver', 'CO', 3),
  ('JFK', 'John F. Kennedy International Airport', 'New York', 'NY', 6),
  ('SFO', 'San Francisco International Airport', 'San Francisco', 'CA', 4),
  ('SEA', 'Seattle-Tacoma International Airport', 'Seattle', 'WA', 2),
  ('LAS', 'Harry Reid International Airport', 'Las Vegas', 'NV', 3),
  ('MCO', 'Orlando International Airport', 'Orlando', 'FL', 4),
  ('EWR', 'Newark Liberty International Airport', 'Newark', 'NJ', 3),
  ('MIA', 'Miami International Airport', 'Miami', 'FL', 3),
  ('PHX', 'Phoenix Sky Harbor International Airport', 'Phoenix', 'AZ', 3),
  ('IAH', 'George Bush Intercontinental Airport', 'Houston', 'TX', 5),
  ('BOS', 'Boston Logan International Airport', 'Boston', 'MA', 4),
  ('MSP', 'Minneapolis-Saint Paul International Airport', 'Minneapolis', 'MN', 2),
  ('DTW', 'Detroit Metropolitan Wayne County Airport', 'Detroit', 'MI', 2),
  ('FLL', 'Fort Lauderdale-Hollywood International Airport', 'Fort Lauderdale', 'FL', 4),
  ('PHL', 'Philadelphia International Airport', 'Philadelphia', 'PA', 7),
  ('CLT', 'Charlotte Douglas International Airport', 'Charlotte', 'NC', 1),
  ('LGA', 'LaGuardia Airport', 'New York', 'NY', 2),
  ('BWI', 'Baltimore/Washington International Airport', 'Baltimore', 'MD', 1),
  ('SLC', 'Salt Lake City International Airport', 'Salt Lake City', 'UT', 2),
  ('DCA', 'Ronald Reagan Washington National Airport', 'Washington', 'DC', 3),
  ('IAD', 'Washington Dulles International Airport', 'Washington', 'DC', 2),
  ('SAN', 'San Diego International Airport', 'San Diego', 'CA', 2),
  ('TPA', 'Tampa International Airport', 'Tampa', 'FL', 1),
  ('PDX', 'Portland International Airport', 'Portland', 'OR', 1),
  ('HNL', 'Daniel K. Inouye International Airport', 'Honolulu', 'HI', 2),
  ('AUS', 'Austin-Bergstrom International Airport', 'Austin', 'TX', 1),
  ('RSW', 'Southwest Florida International Airport', 'Fort Myers', 'FL', 1),
  ('RHI', 'Rhinelander-Oneida County Airport', 'Rhinelander', 'WI', 1)
ON CONFLICT (code) DO NOTHING;

-- Sample reports, spaced 15 minutes apart working backwards from now.
INSERT INTO wait_time_reports (airport_id, wait_minutes, line_type, terminal, checkpoint, reported_at)
SELECT a.id, v.wait_minutes, v.line_type, v.terminal, v.checkpoint, now() - (v.age_minutes || ' minutes')::interval
FROM (VALUES
  ('LAX', 25, 'standard', 'Terminal 4', NULL, 360),
  ('LAX', 8, 'tsa_precheck', 'Terminal 4', NULL, 345),
  ('LAX', 35, 'standard', 'Terminal 7', NULL, 330),
  ('LAX', 12, 'tsa_precheck', 'Terminal 7', NULL, 315),
  ('JFK', 30, 'standard', 'Terminal 1', NULL, 300),
  ('JFK', 10, 'tsa_precheck', 'Terminal 4', NULL, 285),
  ('JFK', 5, 'clear', 'Terminal 4', NULL, 270),
  ('ORD', 20, 'standard', 'Terminal 1', NULL, 255),
  ('ORD', 7, 'tsa_precheck', 'Terminal 2', NULL, 240),
  ('ORD', 40, 'standard', 'Terminal 3', NULL, 225),
  ('ATL', 15, 'standard', 'North', 'Main', 210),
  ('ATL', 5, 'tsa_precheck', 'South', NULL, 195),
  ('SFO', 18, 'standard', 'Terminal 1', NULL, 180),
  ('SFO', 6, 'clear', 'Terminal 1', NULL, 165),
  ('DEN', 22, 'standard', 'Bridge', 'South', 150),
  ('DEN', 10, 'tsa_precheck', 'Bridge', 'North', 135),
  ('SEA', 15, 'standard', 'Central', 'C', 120),
  ('SEA', 8, 'tsa_precheck', 'Central', 'C', 105),
  ('MIA', 45, 'standard', 'North', NULL, 90),
  ('MIA', 15, 'tsa_precheck', 'South', NULL, 75),
  ('BOS', 12, 'standard', 'Terminal B', NULL, 60),
  ('BOS', 3, 'clear', 'Terminal B', NULL, 45),
  ('DFW', 28, 'standard', 'Terminal D', NULL, 30),
  ('DFW', 9, 'tsa_precheck', 'Terminal A', NULL, 15)
) AS v(code, wait_minutes, line_type, terminal, checkpoint, age_minutes)
JOIN airports a ON a.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM wait_time_reports);
