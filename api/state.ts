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
