import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Builds the Express app with API routes only. No listener and no static
// serving, so it works both for the long-lived Node server (server/index.ts)
// and for the Vercel serverless function (api/index.ts).
export function createApp() {
  const app = express();

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  // Method, path, status and duration — deliberately not the response body.
  // Logging bodies put every airport's data in the log on every poll, and
  // would have written travellers' flight times there once the planner shipped.
  // The privacy page says we don't record those; this is part of why that's
  // true.
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      const duration = Date.now() - start;
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    });

    next();
  });

  registerRoutes(app);

  return app;
}

export function registerErrorHandler(app: express.Express) {
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}
