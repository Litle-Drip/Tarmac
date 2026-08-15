import { seedDatabase } from "./seed";

// Seeding used to run on every server boot, which is wasteful on a
// serverless host. Run it once by hand instead: `npm run db:seed`.
seedDatabase()
  .then(() => {
    console.log("Seed complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
