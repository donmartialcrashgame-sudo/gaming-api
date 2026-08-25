import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('API key service disabled: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
}

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const LIMITS = {
  free: { requestsPerMinute: 60, requestsPerDay: 5000 },
  standard: { requestsPerMinute: 300, requestsPerDay: 50000 },
  premium: { requestsPerMinute: 1200, requestsPerDay: 250000 }
};

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey() {
  return `gapi_live_${crypto.randomBytes(32).toString('base64url')}`;
}

export function getKeyHash(key) {
  return hashKey(key);
}

export function getKeyPrefix(key) {
  return key.slice(0, 14);
}

export function getKeyLast4(key) {
  return key.slice(-4);
}

export function getPlanLimits(plan = 'free') {
  return LIMITS[plan] || LIMITS.free;
}

export async function authenticateApiKey(req, res, next) {
  const key = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');

  if (!key) {
    return res.status(401).json({ success: false, error: 'api_key_required' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ success: false, error: 'api_key_service_unavailable' });
  }

  const keyHash = hashKey(key);
  const { data: apiKey, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, customer_id, name, plan, status, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error) {
    console.error('API key lookup failed:', error.message);
    return res.status(500).json({ success: false, error: 'api_key_lookup_failed' });
  }

  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'invalid_api_key' });
  }

  if (apiKey.status !== 'active') {
    return res.status(403).json({ success: false, error: 'api_key_inactive' });
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) <= new Date()) {
    return res.status(403).json({ success: false, error: 'api_key_expired' });
  }

  req.apiKey = apiKey;
  return next();
}

export { LIMITS };
