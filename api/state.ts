import type { VercelRequest, VercelResponse } from "@vercel/node";

const KEY = "tourney_state";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;

  if (!url || !token) {
    return res.status(500).json({ error: "Missing KV environment variables" });
  }

  try {
    if (req.method === "GET") {
      const r = await fetch(`${url}/get/${KEY}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await r.json();
      const value = data?.result ? JSON.parse(data.result) : null;

      return res.status(200).json({ state: value });
    }

    if (req.method === "POST") {
      const body = req.body;

      await fetch(`${url}/set/${KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(body)),
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
import { Redis } from "@upstash/redis";

export const config = {
  runtime: "nodejs",
};

const redisReadOnly = Redis.fromEnv(); // will use KV_REST_API_URL + KV_REST_API_TOKEN by default if present

function json(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  try {
    const key = "blind-draw:state";

    if (req.method === "GET") {
      // Public read
      const data = await redisReadOnly.get(key);
      return json(res, 200, { ok: true, data: data ?? null });
    }

    if (req.method === "POST") {
      // Admin write
      const adminKey = process.env.ADMIN_KEY;
      const sent = req.headers["x-admin-key"];

      if (!adminKey || sent !== adminKey) {
        return json(res, 401, { ok: false, error: "Unauthorized" });
      }

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => resolve());
      });

      const raw = Buffer.concat(chunks).toString("utf8");
      const parsed = raw ? JSON.parse(raw) : null;

      await redisReadOnly.set(key, parsed);
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: e?.message ?? "Server error" });
  }
}
