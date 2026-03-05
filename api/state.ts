import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

/**
 * GET  /api/state      -> public read (view-only)
 * POST /api/state      -> admin write (requires x-admin-key header)
 */

const KEY = "blind-draw:state";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ✅ Public read (anyone can view)
    if (req.method === "GET") {
      const data = await kv.get(KEY);
      return res.status(200).json({ ok: true, data: data ?? null });
    }

    // ✅ Admin write (only you)
    if (req.method === "POST") {
      const sent = String(req.headers["x-admin-key"] || "");
      const adminKey = String(process.env.ADMIN_KEY || "");

      if (!adminKey) {
        return res.status(500).json({ ok: false, error: "Missing ADMIN_KEY env var" });
      }
      if (!sent || sent !== adminKey) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const body = req.body; // Vercel parses JSON automatically when sent as application/json
      await kv.set(KEY, body);

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
