CREATE TABLE "airports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" varchar(2) NOT NULL,
	"terminal_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "airports_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wait_time_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_id" varchar NOT NULL,
	"wait_minutes" integer NOT NULL,
	"checkpoint" text,
	"terminal" text,
	"line_type" varchar(30) DEFAULT 'standard' NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wait_time_reports" ADD CONSTRAINT "wait_time_reports_airport_id_airports_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airports"("id") ON DELETE no action ON UPDATE no action;