import { Redis } from "@upstash/redis";

// Vercel's Marketplace integration prefixes env var names with the store's
// name (e.g. "blinddrawrevco234_KV_REST_API_URL") instead of using the plain
// "KV_REST_API_URL" name. Rather than hardcode that prefix — which would
// break again if the store is ever renamed or reconnected — find whichever
// env var *ends with* the name we need.
function findEnvKey(suffix: string): string | undefined {
  return Object.keys(process.env).find(k => k.endsWith(suffix));
}

const urlKey = process.env.KV_REST_API_URL
  ? "KV_REST_API_URL"
  : findEnvKey("_KV_REST_API_URL") || findEnvKey("_UPSTASH_REDIS_REST_URL");
const tokenKey = process.env.KV_REST_API_TOKEN
  ? "KV_REST_API_TOKEN"
  : findEnvKey("_KV_REST_API_TOKEN") || findEnvKey("_UPSTASH_REDIS_REST_TOKEN");

// Not secret — env var *names* only, used to confirm the right variables
// were found when debugging a connection failure.
export const redisEnvDebug = { urlKey, tokenKey };

const url = (urlKey && process.env[urlKey]) || "";
const token = (tokenKey && process.env[tokenKey]) || "";

export const redis = new Redis({ url, token });
