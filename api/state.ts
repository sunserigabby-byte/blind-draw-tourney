import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

export const config = { runtime: "nodejs" };

const KEY = "blind-draw:state";

function getRedis() {
  // Support BOTH env styles:
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    "";

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";

  if (!url || !token) {
    throw new Error(
      "Missing Redis env vars. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN)."
    );
  }

  return new Redis({ url, token });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    const redis = getRedis();

    if (req.method === "GET") {
      const data = await redis.get(KEY);
      return res.status(200).json({ ok: true, data: data ?? null });
    }

    if (req.method === "POST") {
      const expected = process.env.ADMIN_KEY;
      const sent = (req.headers["x-admin-key"] as string) || "";

      if (!expected) {
        return res.status(500).json({ ok: false, error: "Missing ADMIN_KEY env var" });
      }
      if (!sent || sent !== expected) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const body = req.body ?? null;
      await redis.set(KEY, body);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
