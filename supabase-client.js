// ============================================================
// NexusSaaS — supabase-client.js v2.0
// Integração Supabase: Leads, Sessions, Events, CRM
// ============================================================

(function () {
  'use strict';

  // Usa config do tracking.js (carregado antes)
  const getConfig = () => window.NexusTracker?.config || {};

  const SupabaseClient = {

    // ── HEADERS BASE ────────────────────────────────────────
    _headers() {
      const { SUPABASE_ANON_KEY } = getConfig();
      return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      };
    },

    _url(path) {
      return `${getConfig().SUPABASE_URL}/rest/v1/${path}`;
    },

    _ready() {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      return SUPABASE_URL && !SUPABASE_URL.includes('SEU_') && SUPABASE_ANON_KEY;
    },

    // ── SAVE LEAD ────────────────────────────────────────────
    async saveLead(data) {
      if (!this._ready()) {
        console.warn('[Supabase] Credenciais não configuradas.');
        return null;
      }
      try {
        const res = await fetch(this._url('leads'), {
          method: 'POST',
          headers: { ...this._headers(), 'Prefer': 'return=representation' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        return Array.isArray(json) ? json[0] : json;
      } catch (e) {
        console.warn('[Supabase] saveLead error:', e.message);
        return null;
      }
    },

    // ── UPDATE LEAD STATUS (CRM) ─────────────────────────────
    async updateLeadStatus(sessionId, status, extra = {}) {
      if (!this._ready()) return;
      try {
        await fetch(`${this._url('leads')}?session_id=eq.${sessionId}`, {
          method: 'PATCH',
          headers: { ...this._headers(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ lead_status: status, ...extra }),
        });
      } catch (e) {
        console.warn('[Supabase] updateLeadStatus error:', e.message);
      }
    },

    // ── UPDATE LEAD SCORE ────────────────────────────────────
    async updateLeadScore(sessionId, score, tier) {
      if (!this._ready()) return;
      try {
        await fetch(`${this._url('leads')}?session_id=eq.${sessionId}`, {
          method: 'PATCH',
          headers: { ...this._headers(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ lead_score: score, lead_tier: tier }),
        });
      } catch (e) {
        console.warn('[Supabase] updateLeadScore error:', e.message);
      }
    },

    // ── SAVE QUIZ ANSWERS ────────────────────────────────────
    async saveQuizAnswers(sessionId, answers) {
      if (!this._ready()) return;
      try {
        await fetch(`${this._url('leads')}?session_id=eq.${sessionId}`, {
          method: 'PATCH',
          headers: { ...this._headers(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ quiz_answers: answers, lead_status: 'quiz_completed' }),
        });
      } catch (e) {
        console.warn('[Supabase] saveQuizAnswers error:', e.message);
      }
    },

    // ── LOG JOURNEY (TIMELINE) ───────────────────────────────
    async logJourney(sessionId, email, actionType, actionDetails, score) {
      if (!this._ready()) return;
      try {
        await fetch(this._url('lead_journey'), {
          method: 'POST',
          headers: { ...this._headers(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            session_id: sessionId,
            email: email,
            action_type: actionType,
            action_details: actionDetails,
            lead_score_at_time: score
          }),
        });
      } catch (e) {
        console.warn('[Supabase] logJourney error:', e.message);
      }
    },

    // ── LOG ATTRIBUTION ──────────────────────────────────────
    async logAttribution(data) {
      if (!this._ready()) return;
      try {
        await fetch(this._url('attribution'), {
          method: 'POST',
          headers: { ...this._headers(), 'Prefer': 'return=minimal' },
          body: JSON.stringify(data),
        });
      } catch (e) {
        console.warn('[Supabase] logAttribution error:', e.message);
      }
    },

    // ── ANALYTICS: GET LEADS ───────────────────────────────────────────
    // REMOVIDO DO CLIENT PÚBLICO por segurança (auditoria A-04).
    // Utilizar supabaseClient no admin-app.js (camada autenticada) para queries de leads.
    // getLeads() e getKPIs() não devem estar acessíveis em JS público.
  };

  window.NexusDB = SupabaseClient;

})();
