import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

// Lets a non-admin scorer (PIN-authorized, or public scoring enabled) save a
// single Doubles match score. Unlike /api/state, this does NOT require the
// real admin key — instead it checks the submitted scorerPin against the
// division's own scorerPin/publicScoring settings, which are already stored
// server-side. Only that one match's score is changed; everything else in
// the shared state is left untouched.

export const config = { runtime: "nodejs" };

const KEY = "blind-draw:state";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { division, matchId, scoreText, scorerPin } = req.body ?? {};
    if (division !== "UPPER" && division !== "LOWER") {
      return res.status(400).json({ ok: false, error: "Invalid division" });
    }
    if (!matchId) {
      return res.status(400).json({ ok: false, error: "Missing matchId" });
    }

    const state: any = (await redis.get(KEY)) ?? {};
    const div = state?.doubles?.[division];
    if (!div) return res.status(404).json({ ok: false, error: "Division not found" });

    const authorized = !!div.publicScoring || (!!div.scorerPin && scorerPin === div.scorerPin);
    if (!authorized) return res.status(401).json({ ok: false, error: "Scoring is locked for this division" });

    const match = (div.matches ?? []).find((m: any) => m.id === matchId);
    if (!match) return res.status(404).json({ ok: false, error: "Match not found" });
    match.scoreText = scoreText ?? "";

    await redis.set(KEY, state);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("api/doubles-score error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
