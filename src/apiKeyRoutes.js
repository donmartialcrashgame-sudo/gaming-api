import { Router } from 'express';
import crypto from 'node:crypto';
import { generateApiKey, getKeyHash, getKeyPrefix, getKeyLast4 } from './apiKeys.js';

const router = Router();

function requireAdminConfig(_req, res, next) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ success: false, error: 'api_key_service_unavailable' });
  }
  return next();
}

router.post('/generate', requireAdminConfig, async (req, res) => {
  const { customerId, name = 'Default API Key', plan = 'free' } = req.body || {};
  if (!customerId) return res.status(400).json({ success: false, error: 'customer_id_required' });
  if (!['free', 'standard', 'premium'].includes(plan)) {
    return res.status(400).json({ success: false, error: 'invalid_plan' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const key = generateApiKey();

  const { data, error } = await admin.from('api_keys').insert({
    customer_id: customerId,
    name: String(name).trim().slice(0, 80),
    key_hash: getKeyHash(key),
    key_prefix: getKeyPrefix(key),
    key_last4: getKeyLast4(key),
    status: 'active',
    plan
  }).select('id,name,key_prefix,key_last4,status,plan,created_at,expires_at').single();

  if (error) return res.status(500).json({ success: false, error: 'api_key_create_failed', detail: error.message });
  return res.status(201).json({ success: true, data, api_key: key });
});

router.post('/revoke', requireAdminConfig, async (req, res) => {
  const { id, customerId } = req.body || {};
  if (!id || !customerId) return res.status(400).json({ success: false, error: 'id_and_customer_id_required' });
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.from('api_keys').update({ status: 'revoked' }).eq('id', id).eq('customer_id', customerId).select('id,status').maybeSingle();
  if (error) return res.status(500).json({ success: false, error: 'api_key_revoke_failed' });
  if (!data) return res.status(404).json({ success: false, error: 'api_key_not_found' });
  return res.json({ success: true, data });
});

export default router;
