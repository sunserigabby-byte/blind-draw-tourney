import { Redis } from "@upstash/redis";

// Vercel's Marketplace integration prefixes env var names with the store's
// name (e.g. "blinddrawrevco234_KV_REST_API_URL") instead of using the plain
// "KV_REST_API_URL" name. Prefer the prefixed name — a leftover, unprefixed
// KV_REST_API_URL/TOKEN pair can still exist from a previous, now-deleted
// database, and picking that one up first points at a dead host.
function findEnvKey(suffix: string): string | undefined {
  return Object.keys(process.env).find(k => k.endsWith(suffix));
}

const urlKey =
  findEnvKey("_KV_REST_API_URL") || findEnvKey("_UPSTASH_REDIS_REST_URL") ||
  (process.env.KV_REST_API_URL ? "KV_REST_API_URL" : undefined);
const tokenKey =
  findEnvKey("_KV_REST_API_TOKEN") || findEnvKey("_UPSTASH_REDIS_REST_TOKEN") ||
  (process.env.KV_REST_API_TOKEN ? "KV_REST_API_TOKEN" : undefined);

// Not secret — env var *names* only, used to confirm the right variables
// were found when debugging a connection failure.
export const redisEnvDebug = { urlKey, tokenKey };

const url = (urlKey && process.env[urlKey]) || "";
const token = (tokenKey && process.env[tokenKey]) || "";

export const redis = new Redis({ url, token });
