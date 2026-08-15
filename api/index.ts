import { createApp, registerErrorHandler } from "../server/app";

// Vercel serverless entry point. Express apps are valid Node request
// handlers, so exporting the app is all Vercel needs. Static assets are
// served straight from the CDN (see vercel.json), so this function only
// ever handles /api/* requests.
const app = createApp();
registerErrorHandler(app);

export default app;
