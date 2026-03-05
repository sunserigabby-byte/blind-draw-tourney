import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

export const config = {
  runtime: "nodejs",
};

const KEY = "blind-draw:state";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-key");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method === "GET") {
      const data = await kv.get(KEY);
      return res.status(200).json({ ok: true, data: data ?? null });
    }

    if (req.method === "POST") {
      const expected = process.env.ADMIN_KEY;
      const sent = (req.headers["x-admin-key"] as string) || "";

      if (!expected) {
        return res.status(500).json({ ok: false, error: "Missing ADMIN_KEY env var" });
      }

      if (sent !== expected) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      await kv.set(KEY, req.body ?? null);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });

  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
