import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nexus-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const expectedSecret = Deno.env.get('N8N_WEBHOOK_SECRET') ?? '';

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const secret = req.headers.get('x-nexus-secret');
    if (!secret || secret !== expectedSecret) {
      await logWebhook(supabase, 'ads-sync', 'failed', 'Unauthorized: Invalid x-nexus-secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    if (!payload) throw new Error('Empty payload');

    const metricsArray = Array.isArray(payload) ? payload : [payload];
    const recordsToUpsert = [];

    for (const metric of metricsArray) {
      if (!metric.date || !metric.platform || typeof metric.spend !== 'number') {
        throw new Error('Invalid metric format: must contain date, platform, and spend.');
      }

      recordsToUpsert.push({
        date: metric.date,
        platform: metric.platform,
        campaign_id: metric.campaign_id || 'unknown',
        campaign_name: metric.campaign_name || 'Global',
        adset_name: metric.adset_name || null,
        ad_name: metric.ad_name || null,
        spend: metric.spend,
        impressions: metric.impressions || 0,
        clicks: metric.clicks || 0,
        ctr: metric.ctr || 0,
        cpc: metric.cpc || 0,
        cpm: metric.cpm || 0,
        currency: metric.currency || 'BRL'
      });
    }

    const { data, error } = await supabase
      .from('ad_metrics')
      .upsert(recordsToUpsert, { onConflict: 'date,platform,campaign_id' })
      .select();

    if (error) throw error;

    await logWebhook(supabase, 'ads-sync', 'success', `Synced ${recordsToUpsert.length} ad metrics`);

    return new Response(JSON.stringify({ success: true, count: recordsToUpsert.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error:', error.message);
    await logWebhook(supabase, 'ads-sync', 'failed', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

async function logWebhook(supabase: any, origin: string, status: string, details: string) {
  try {
    await supabase.from('webhook_logs').insert([{
      origin, status, details, payload: {}
    }]);
  } catch (err) {
    console.error("Failed to log webhook", err);
  }
}
