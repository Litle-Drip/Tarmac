import { createHash } from "crypto";
import type { Request } from "express";

/**
 * Who submitted a report — enough to rate-limit and to clean up afterwards,
 * and no more than that.
 *
 * There are no accounts. A device token is a random identifier the browser
 * generates and keeps; it is not tied to a person and carries nothing about
 * them. IPs are salted-hashed and never stored raw, so we can group abuse
 * without holding an address we'd have to protect.
 */

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const DEVICE_HEADER = "x-tarmac-device";

export function readDeviceId(req: Request): string | null {
  const raw = req.header(DEVICE_HEADER);
  if (!raw) return null;
  const trimmed = raw.trim();
  return DEVICE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

let saltWarningIssued = false;

function salt(): string {
  const configured = process.env.REPORT_HASH_SALT;
  if (configured && configured.length >= 16) return configured;

  if (!saltWarningIssued) {
    saltWarningIssued = true;
    console.warn(
      "REPORT_HASH_SALT is unset or too short. IP hashes are using a default salt — " +
        "set a random 32+ character value in the deployment environment.",
    );
  }

  return "tarmac-default-salt-please-override";
}

/**
 * Client IP as seen through the platform proxy.
 *
 * Vercel sets x-forwarded-for and the left-most entry is the client. We do not
 * trust this for anything security-critical — it is a rate-limiting heuristic,
 * and the device token does the heavier lifting.
 */
export function readClientIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? null;
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt()}:${ip}`).digest("hex").slice(0, 64);
}

export function identify(req: Request): {
  deviceId: string | null;
  ipHash: string | null;
} {
  return {
    deviceId: readDeviceId(req),
    ipHash: hashIp(readClientIp(req)),
  };
}

/**
 * How often one device may report the same airport.
 *
 * Long enough that it cannot be used to move a number, short enough that a
 * traveller who reports on the way in and again at the gate is not blocked.
 */
export const REPORT_COOLDOWN_MINUTES = 20;

/** Ceiling across all airports, to stop one device sweeping the map. */
export const REPORTS_PER_DEVICE_PER_HOUR = 8;
