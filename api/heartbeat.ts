import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

export const config = { runtime: "nodejs" };

const KEY = "blind-draw:heartbeats";
const EXPIRE_MS = 30_000; // 30 seconds — sessions older than this are considered inactive

type HeartbeatEntry = { sessionId: string; ts: number };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const now = Date.now();

    if (req.method === "POST") {
      const { sessionId } = req.body ?? {};
      if (!sessionId) return res.status(400).json({ ok: false, error: "Missing sessionId" });

      const entries: HeartbeatEntry[] = (await kv.get(KEY)) ?? [];
      // Update or add this session, prune stale ones
      const fresh = entries.filter(e => e.sessionId !== sessionId && now - e.ts < EXPIRE_MS);
      fresh.push({ sessionId, ts: now });
      await kv.set(KEY, fresh);

      const otherActive = fresh.filter(e => e.sessionId !== sessionId).length;
      return res.status(200).json({ ok: true, otherActive });
    }

    if (req.method === "GET") {
      const entries: HeartbeatEntry[] = (await kv.get(KEY)) ?? [];
      const fresh = entries.filter(e => now - e.ts < EXPIRE_MS);
      return res.status(200).json({ ok: true, active: fresh.length });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
