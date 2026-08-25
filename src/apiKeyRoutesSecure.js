import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateApiKey, getKeyHash, getKeyPrefix, getKeyLast4 } from './apiKeys.js';

const router = Router();

async function requireUser(req, res, next) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'authentication_required' });
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ success: false, error: 'authentication_service_unavailable' });
  const token = auth.slice(7);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return res.status(401).json({ success: false, error: 'invalid_session' });
  req.user = user;
  next();
}

router.post('/generate', requireUser, async (req, res) => {
  const { name = 'Default API Key', plan = 'free' } = req.body || {};
  if (!['free', 'standard', 'premium'].includes(plan)) return res.status(400).json({ success: false, error: 'invalid_plan' });
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const key = generateApiKey();
  const { data, error } = await admin.from('api_keys').insert({ customer_id: req.user.id, name: String(name).trim().slice(0, 80), key_hash: getKeyHash(key), key_prefix: getKeyPrefix(key), key_last4: getKeyLast4(key), status: 'active', plan }).select('id,name,key_prefix,key_last4,status,plan,created_at,expires_at').single();
  if (error) return res.status(500).json({ success: false, error: 'api_key_create_failed', detail: error.message });
  res.status(201).json({ success: true, data, api_key: key });
});

router.post('/revoke', requireUser, async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ success: false, error: 'id_required' });
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.from('api_keys').update({ status: 'revoked' }).eq('id', req.body.id).eq('customer_id', req.user.id).select('id,status').maybeSingle();
  if (error) return res.status(500).json({ success: false, error: 'api_key_revoke_failed', detail: error.message });
  if (!data) return res.status(404).json({ success: false, error: 'api_key_not_found' });
  res.json({ success: true, data });
});

export default router;
