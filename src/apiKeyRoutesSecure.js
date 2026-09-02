import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateApiKey, getKeyHash, getKeyPrefix, getKeyLast4, LIMITS } from './apiKeys.js';

const router = Router();

function getAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function requireUser(req, res, next) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'authentication_required' });

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  const admin = getAdminClient();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !admin) return res.status(503).json({ success: false, error: 'authentication_service_unavailable' });

  const token = auth.slice(7).trim();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return res.status(401).json({ success: false, error: 'invalid_session' });

  req.user = user;
  req.admin = admin;
  return next();
}

async function ensureCustomer(admin, user) {
  const displayName = String(
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'Gaming API User'
  ).trim().slice(0, 120);

  const { error } = await admin
    .from('customers')
    .upsert({ id: user.id, display_name: displayName, status: 'active' }, { onConflict: 'id' });

  if (error) throw new Error(`customer_upsert_failed:${error.message}`);
}

function validatePlan(plan) {
  return Object.prototype.hasOwnProperty.call(LIMITS, plan);
}

router.get('/plans', (_req, res) => {
  return res.json({
    success: true,
    data: Object.entries(LIMITS).map(([id, limits]) => ({
      id,
      name: id[0].toUpperCase() + id.slice(1),
      limits
    }))
  });
});

router.get('/', requireUser, async (req, res) => {
  const { data, error } = await req.admin
    .from('api_keys')
    .select('id,name,key_prefix,key_last4,status,plan,created_at,last_used_at,expires_at')
    .eq('customer_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('API key list failed:', error.message);
    return res.status(500).json({ success: false, error: 'api_key_list_failed' });
  }

  return res.json({ success: true, data: data || [] });
});

router.post('/generate', requireUser, async (req, res) => {
  const { name = 'Default API Key', plan = 'free' } = req.body || {};
  const cleanPlan = String(plan).trim().toLowerCase();

  if (!validatePlan(cleanPlan)) return res.status(400).json({ success: false, error: 'invalid_plan', allowed_plans: Object.keys(LIMITS) });

  const cleanName = String(name || 'Default API Key').trim().slice(0, 80) || 'Default API Key';
  const key = generateApiKey();

  try {
    await ensureCustomer(req.admin, req.user);

    const { data, error } = await req.admin
      .from('api_keys')
      .insert({
        customer_id: req.user.id,
        name: cleanName,
        key_hash: getKeyHash(key),
        key_prefix: getKeyPrefix(key),
        key_last4: getKeyLast4(key),
        status: 'active',
        plan: cleanPlan
      })
      .select('id,name,key_prefix,key_last4,status,plan,created_at,expires_at')
      .single();

    if (error) {
      console.error('API key create failed:', error.message);
      return res.status(500).json({ success: false, error: 'api_key_create_failed' });
    }

    return res.status(201).json({
      success: true,
      message: 'API key created. Copy it now because the full key is only returned once.',
      api_key: key,
      data,
      limits: LIMITS[cleanPlan]
    });
  } catch (error) {
    console.error('API key customer setup failed:', error.message);
    return res.status(500).json({ success: false, error: 'api_key_customer_setup_failed' });
  }
});

router.post('/revoke', requireUser, async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ success: false, error: 'id_required' });

  const { data, error } = await req.admin
    .from('api_keys')
    .update({ status: 'revoked' })
    .eq('id', req.body.id)
    .eq('customer_id', req.user.id)
    .select('id,status')
    .maybeSingle();

  if (error) {
    console.error('API key revoke failed:', error.message);
    return res.status(500).json({ success: false, error: 'api_key_revoke_failed' });
  }
  if (!data) return res.status(404).json({ success: false, error: 'api_key_not_found' });

  return res.json({ success: true, data });
});

export default router;
