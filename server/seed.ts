import { storage } from "./storage";

const US_AIRPORTS = [
  { code: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", state: "GA", terminal_count: 2 },
  { code: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", state: "CA", terminal_count: 9 },
  { code: "ORD", name: "O'Hare International Airport", city: "Chicago", state: "IL", terminal_count: 4 },
  { code: "DFW", name: "Dallas/Fort Worth International Airport", city: "Dallas", state: "TX", terminal_count: 5 },
  { code: "DEN", name: "Denver International Airport", city: "Denver", state: "CO", terminal_count: 3 },
  { code: "JFK", name: "John F. Kennedy International Airport", city: "New York", state: "NY", terminal_count: 6 },
  { code: "SFO", name: "San Francisco International Airport", city: "San Francisco", state: "CA", terminal_count: 4 },
  { code: "SEA", name: "Seattle-Tacoma International Airport", city: "Seattle", state: "WA", terminal_count: 2 },
  { code: "LAS", name: "Harry Reid International Airport", city: "Las Vegas", state: "NV", terminal_count: 3 },
  { code: "MCO", name: "Orlando International Airport", city: "Orlando", state: "FL", terminal_count: 4 },
  { code: "EWR", name: "Newark Liberty International Airport", city: "Newark", state: "NJ", terminal_count: 3 },
  { code: "MIA", name: "Miami International Airport", city: "Miami", state: "FL", terminal_count: 3 },
  { code: "PHX", name: "Phoenix Sky Harbor International Airport", city: "Phoenix", state: "AZ", terminal_count: 3 },
  { code: "IAH", name: "George Bush Intercontinental Airport", city: "Houston", state: "TX", terminal_count: 5 },
  { code: "BOS", name: "Boston Logan International Airport", city: "Boston", state: "MA", terminal_count: 4 },
  { code: "MSP", name: "Minneapolis-Saint Paul International Airport", city: "Minneapolis", state: "MN", terminal_count: 2 },
  { code: "DTW", name: "Detroit Metropolitan Wayne County Airport", city: "Detroit", state: "MI", terminal_count: 2 },
  { code: "FLL", name: "Fort Lauderdale-Hollywood International Airport", city: "Fort Lauderdale", state: "FL", terminal_count: 4 },
  { code: "PHL", name: "Philadelphia International Airport", city: "Philadelphia", state: "PA", terminal_count: 7 },
  { code: "CLT", name: "Charlotte Douglas International Airport", city: "Charlotte", state: "NC", terminal_count: 1 },
  { code: "LGA", name: "LaGuardia Airport", city: "New York", state: "NY", terminal_count: 2 },
  { code: "BWI", name: "Baltimore/Washington International Airport", city: "Baltimore", state: "MD", terminal_count: 1 },
  { code: "SLC", name: "Salt Lake City International Airport", city: "Salt Lake City", state: "UT", terminal_count: 2 },
  { code: "DCA", name: "Ronald Reagan Washington National Airport", city: "Washington", state: "DC", terminal_count: 3 },
  { code: "IAD", name: "Washington Dulles International Airport", city: "Washington", state: "DC", terminal_count: 2 },
  { code: "SAN", name: "San Diego International Airport", city: "San Diego", state: "CA", terminal_count: 2 },
  { code: "TPA", name: "Tampa International Airport", city: "Tampa", state: "FL", terminal_count: 1 },
  { code: "PDX", name: "Portland International Airport", city: "Portland", state: "OR", terminal_count: 1 },
  { code: "HNL", name: "Daniel K. Inouye International Airport", city: "Honolulu", state: "HI", terminal_count: 2 },
  { code: "AUS", name: "Austin-Bergstrom International Airport", city: "Austin", state: "TX", terminal_count: 1 },
];

const SEED_REPORTS = [
  { code: "LAX", waitMinutes: 25, lineType: "standard", terminal: "Terminal 4", checkpoint: null },
  { code: "LAX", waitMinutes: 8, lineType: "tsa_precheck", terminal: "Terminal 4", checkpoint: null },
  { code: "LAX", waitMinutes: 35, lineType: "standard", terminal: "Terminal 7", checkpoint: null },
  { code: "LAX", waitMinutes: 12, lineType: "tsa_precheck", terminal: "Terminal 7", checkpoint: null },
  { code: "JFK", waitMinutes: 30, lineType: "standard", terminal: "Terminal 1", checkpoint: null },
  { code: "JFK", waitMinutes: 10, lineType: "tsa_precheck", terminal: "Terminal 4", checkpoint: null },
  { code: "JFK", waitMinutes: 5, lineType: "clear", terminal: "Terminal 4", checkpoint: null },
  { code: "ORD", waitMinutes: 20, lineType: "standard", terminal: "Terminal 1", checkpoint: null },
  { code: "ORD", waitMinutes: 7, lineType: "tsa_precheck", terminal: "Terminal 2", checkpoint: null },
  { code: "ORD", waitMinutes: 40, lineType: "standard", terminal: "Terminal 3", checkpoint: null },
  { code: "ATL", waitMinutes: 15, lineType: "standard", terminal: "North", checkpoint: "Main" },
  { code: "ATL", waitMinutes: 5, lineType: "tsa_precheck", terminal: "South", checkpoint: null },
  { code: "SFO", waitMinutes: 18, lineType: "standard", terminal: "Terminal 1", checkpoint: null },
  { code: "SFO", waitMinutes: 6, lineType: "clear", terminal: "Terminal 1", checkpoint: null },
  { code: "DEN", waitMinutes: 22, lineType: "standard", terminal: "Bridge", checkpoint: "South" },
  { code: "DEN", waitMinutes: 10, lineType: "tsa_precheck", terminal: "Bridge", checkpoint: "North" },
  { code: "SEA", waitMinutes: 15, lineType: "standard", terminal: "Central", checkpoint: "C" },
  { code: "SEA", waitMinutes: 8, lineType: "tsa_precheck", terminal: "Central", checkpoint: "C" },
  { code: "MIA", waitMinutes: 45, lineType: "standard", terminal: "North", checkpoint: null },
  { code: "MIA", waitMinutes: 15, lineType: "tsa_precheck", terminal: "South", checkpoint: null },
  { code: "BOS", waitMinutes: 12, lineType: "standard", terminal: "Terminal B", checkpoint: null },
  { code: "BOS", waitMinutes: 3, lineType: "clear", terminal: "Terminal B", checkpoint: null },
  { code: "DFW", waitMinutes: 28, lineType: "standard", terminal: "Terminal D", checkpoint: null },
  { code: "DFW", waitMinutes: 9, lineType: "tsa_precheck", terminal: "Terminal A", checkpoint: null },
];

export async function seedDatabase() {
  try {
    const count = await storage.getAirportCount();
    if (count > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Seeding database with airports...");
    const airportMap: Record<string, string> = {};

    for (const airport of US_AIRPORTS) {
      const created = await storage.createAirport(airport);
      airportMap[airport.code] = created.id;
    }

    console.log(`Seeded ${US_AIRPORTS.length} airports`);

    console.log("Seeding database with sample reports...");
    const now = Date.now();
    for (let i = 0; i < SEED_REPORTS.length; i++) {
      const report = SEED_REPORTS[i];
      const airportId = airportMap[report.code];
      if (!airportId) continue;

      const offsetMs = (SEED_REPORTS.length - i) * 15 * 60 * 1000;
      await storage.createReport({
        airportId,
        waitMinutes: report.waitMinutes,
        lineType: report.lineType as "standard" | "tsa_precheck" | "clear",
        terminal: report.terminal,
        checkpoint: report.checkpoint,
      });
    }

    console.log(`Seeded ${SEED_REPORTS.length} reports`);
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
