import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

export const LIMITS = Object.freeze({
  free: { requestsPerMinute: 60, requestsPerDay: 5000 },
  standard: { requestsPerMinute: 300, requestsPerDay: 50000 },
  premium: { requestsPerMinute: 1200, requestsPerDay: 250000 }
});

const buckets = new Map();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey() {
  return `gapi_live_${crypto.randomBytes(32).toString('base64url')}`;
}

export function getKeyHash(key) { return hashKey(key); }
export function getKeyPrefix(key) { return key.slice(0, 14); }
export function getKeyLast4(key) { return key.slice(-4); }
export function getPlanLimits(plan = 'free') { return LIMITS[plan] || LIMITS.free; }

function getBucket(id) {
  const now = Date.now();
  let bucket = buckets.get(id);
  if (!bucket || now - bucket.minuteStarted >= MINUTE) {
    bucket = {
      minuteStarted: now,
      dayStarted: bucket?.dayStarted ?? now,
      minuteCount: 0,
      dayCount: bucket?.dayCount ?? 0
    };
  }
  if (now - bucket.dayStarted >= DAY) {
    bucket.dayStarted = now;
    bucket.dayCount = 0;
  }
  buckets.set(id, bucket);
  return bucket;
}

export function rateLimitApiKey(req, res, next) {
  const apiKey = req.apiKey;
  if (!apiKey) return res.status(401).json({ success: false, error: 'api_key_required' });

  const limits = getPlanLimits(apiKey.plan);
  const bucket = getBucket(apiKey.id);

  if (bucket.minuteCount >= limits.requestsPerMinute) {
    const retry = Math.max(1, Math.ceil((bucket.minuteStarted + MINUTE - Date.now()) / 1000));
    res.set('Retry-After', String(retry));
    return res.status(429).json({ success: false, error: 'rate_limit_exceeded', limit: limits.requestsPerMinute, window: 'minute', retry_after_seconds: retry });
  }
  if (bucket.dayCount >= limits.requestsPerDay) {
    const retry = Math.max(1, Math.ceil((bucket.dayStarted + DAY - Date.now()) / 1000));
    res.set('Retry-After', String(retry));
    return res.status(429).json({ success: false, error: 'daily_limit_exceeded', limit: limits.requestsPerDay, window: 'day', retry_after_seconds: retry });
  }

  bucket.minuteCount += 1;
  bucket.dayCount += 1;
  req.apiRateLimit = {
    plan: apiKey.plan,
    minuteLimit: limits.requestsPerMinute,
    dayLimit: limits.requestsPerDay,
    minuteRemaining: limits.requestsPerMinute - bucket.minuteCount,
    dayRemaining: limits.requestsPerDay - bucket.dayCount
  };
  res.set('X-RateLimit-Limit', String(limits.requestsPerMinute));
  res.set('X-RateLimit-Remaining', String(req.apiRateLimit.minuteRemaining));
  return next();
}

export async function authenticateApiKey(req, res, next) {
  const key = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) return res.status(401).json({ success: false, error: 'api_key_required' });
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'api_key_service_unavailable' });

  const { data: apiKey, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, customer_id, name, plan, status, expires_at')
    .eq('key_hash', hashKey(key))
    .maybeSingle();

  if (error) {
    console.error('API key lookup failed:', error.message);
    return res.status(500).json({ success: false, error: 'api_key_lookup_failed' });
  }
  if (!apiKey) return res.status(401).json({ success: false, error: 'invalid_api_key' });
  if (apiKey.status !== 'active') return res.status(403).json({ success: false, error: 'api_key_inactive' });
  if (apiKey.expires_at && new Date(apiKey.expires_at) <= new Date()) return res.status(403).json({ success: false, error: 'api_key_expired' });

  req.apiKey = apiKey;
  return next();
}

setInterval(() => {
  const cutoff = Date.now() - DAY;
  for (const [id, bucket] of buckets) if (bucket.dayStarted < cutoff) buckets.delete(id);
}, 60 * 60 * 1000).unref();
