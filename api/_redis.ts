import { Redis } from "@upstash/redis";

// Vercel's Marketplace integration prefixes env var names with the store's
// name (e.g. "blinddrawrevco234_KV_REST_API_URL") instead of using the plain
// "KV_REST_API_URL" name. Rather than hardcode that prefix — which would
// break again if the store is ever renamed or reconnected — find whichever
// env var *ends with* the name we need.
function findEnv(suffix: string): string {
  const key = Object.keys(process.env).find(k => k.endsWith(suffix));
  return (key && process.env[key]) || "";
}

const url = process.env.KV_REST_API_URL || findEnv("_KV_REST_API_URL") || findEnv("_UPSTASH_REDIS_REST_URL");
const token = process.env.KV_REST_API_TOKEN || findEnv("_KV_REST_API_TOKEN") || findEnv("_UPSTASH_REDIS_REST_TOKEN");

export const redis = new Redis({ url, token });
