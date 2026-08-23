import { Redis } from "@upstash/redis";

// Vercel's Marketplace Upstash integration has provisioned env vars under
// both naming schemes over time (legacy KV_REST_API_* and current
// UPSTASH_REDIS_REST_*) — check both so this keeps working regardless of
// which one this project ends up with.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const redis = new Redis({ url, token });
