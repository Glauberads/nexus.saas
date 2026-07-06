// ============================================================
// NexusSaaS — tracking.js v2.0
// Motor Central de Tracking: Meta Pixel + CAPI + GA4 + GTM +
// Microsoft Clarity + UTM Persistence + Lead Scoring + A/B
// ============================================================

(function () {
  'use strict';

  // ── CONFIGURAÇÃO ─────────────────────────────────────────
  // Substitua os placeholders pelas suas credenciais reais
  const CONFIG = {
    DEBUG_TRACKING:      true,                      // Ativar log no console
    META_PIXEL_ID:       '729982690062335',           // Ex: 1234567890
    GA4_ID:              'G-Q0WXJZP1PX',            // Ex: G-ABC123DEF4
    GTM_ID:              'GTM-XXXXXXX',             // Ex: GTM-ABC1234
    CLARITY_ID:          'SEU_CLARITY_ID',          // Ex: abcde12345
    GADS_CONVERSION_ID:  'AW-XXXXXXXXX',            // Ex: AW-123456789
    GADS_LEAD_LABEL:     'XXXXXXXXXXX',             // Label evento Lead
    GADS_CHECKOUT_LABEL: 'XXXXXXXXXXX',             // Label InitiateCheckout
    SUPABASE_URL:        'https://wkomsnqucatqepabepje.supabase.co',        // Ex: https://xxx.supabase.co
    SUPABASE_ANON_KEY:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indrb21zbnF1Y2F0cWVwYWJlcGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTQ3NzAsImV4cCI6MjA5NzEzMDc3MH0.97SsmA1J5TvQjaJTL_-9rhuHtsRyOzbuQ_R_IGaravc',  // chave pública anon
    CHECKOUT_URL:        'https://membros.glauberads.com.br/c/jy773ql',
  };

  // ── SESSION ID & CORRELATION ID ──────────────────────────
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getCorrelationId() {
    let cid = sessionStorage.getItem('nexus_correlation_id');
    if (!cid) {
      cid = generateUUID();
      sessionStorage.setItem('nexus_correlation_id', cid);
    }
    return cid;
  }

  // ── SHA-256 HASH (para CAPI PII) ─────────────────────────
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str.toLowerCase().trim()));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── LEAD SCORING ENGINE ──────────────────────────────────
  const LeadScore = {
    score: 0,
    actions: [],
    rules: {
      ViewContent:      2,
      Scroll25:         3,
      Scroll50:         5,
      Scroll75:        10,
      Scroll90:        15,
      Time30s:          5,
      Time60s:         10,
      Time120s:        20,
      ViewSystems:      8,
      ViewVault:        8,
      ViewPricing:     20,
      ViewGuarantee:   15,
      FAQInteraction:   5,
      VideoPlay:       10,
      Video25:         10,
      Video50:         15,
      Video75:         20,
      VideoComplete:   30,
      LeadMagnet:      40,
      QuizComplete:    35,
      InitiateCheckout:50,
    },

    add(action) {
      const pts = this.rules[action] || 0;
      if (pts === 0) return;
      this.score += pts;
      this.actions.push({ action, pts, ts: Date.now() });
      this.persist();
      this.checkHighIntent();
      return this.score;
    },

    persist() {
      try {
        localStorage.setItem('nexus_score', this.score);
        localStorage.setItem('nexus_actions', JSON.stringify(this.actions));
      } catch (_) {}
    },

    load() {
      try {
        this.score = parseInt(localStorage.getItem('nexus_score') || '0');
        this.actions = JSON.parse(localStorage.getItem('nexus_actions') || '[]');
      } catch (_) {}
    },

    getTier() {
      if (this.score >= 76) return 'Muito Quente';
      if (this.score >= 51) return 'Quente';
      if (this.score >= 26) return 'Morno';
      return 'Frio';
    },

    checkHighIntent() {
      // Quente (QualifiedLead)
      if (this.score >= 51 && !this._qualifiedFired) {
        this._qualifiedFired = true;
        window.NexusTracker && window.NexusTracker.track('QualifiedLead', {
          score: this.score,
          tier: this.getTier(),
        });
      }
      // Muito Quente (ReadyToBuy)
      if (this.score >= 76 && !this._readyToBuyFired) {
        this._readyToBuyFired = true;
        window.NexusTracker && window.NexusTracker.track('ReadyToBuy', {
          score: this.score,
          tier: this.getTier(),
        });
      }
    },
  };

  // ── UTM ENGINE ───────────────────────────────────────────
  const UTM = {
    keys: ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ttclid','msclkid'],

    capture() {
      const params = new URLSearchParams(window.location.search);
      const data = {};
      this.keys.forEach(k => { if (params.get(k)) data[k] = params.get(k); });

      // Persist fbclid → _fbc cookie (Meta attribution)
      if (data.fbclid) {
        const fbc = `fb.1.${Date.now()}.${data.fbclid}`;
        document.cookie = `_fbc=${fbc}; max-age=${86400 * 90}; path=/; SameSite=Lax`;
      }

      // Merge: URL params win, then localStorage
      const stored = this.load();
      const merged = { ...stored, ...data };
      this.save(merged);
      return merged;
    },

    save(data) {
      try {
        localStorage.setItem('nexus_utms', JSON.stringify(data));
        // Also set cookies (30 days)
        Object.entries(data).forEach(([k, v]) => {
          document.cookie = `nexus_${k}=${encodeURIComponent(v)}; max-age=${86400 * 30}; path=/; SameSite=Lax`;
        });
      } catch (_) {}
    },

    load() {
      try {
        return JSON.parse(localStorage.getItem('nexus_utms') || '{}');
      } catch (_) { return {}; }
    },

    get() { return this.load(); },

    getFbp() {
      const match = document.cookie.match(/_fbp=([^;]+)/);
      return match ? match[1] : null;
    },

    getFbc() {
      const match = document.cookie.match(/_fbc=([^;]+)/);
      if (match) return match[1];
      const utms = this.load();
      if (utms.fbclid) return `fb.1.${Date.now()}.${utms.fbclid}`;
      return null;
    },
  };

  // ── A/B TEST ENGINE ──────────────────────────────────────
  const ABTest = {
    tests: {},

    define(name, variants, weights) {
      if (this.tests[name]) return this.tests[name].variant;
      const stored = localStorage.getItem(`nexus_ab_${name}`);
      if (stored) { this.tests[name] = { variant: stored }; return stored; }

      weights = weights || variants.map(() => 1);
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let chosen = variants[0];
      for (let i = 0; i < variants.length; i++) {
        r -= weights[i];
        if (r <= 0) { chosen = variants[i]; break; }
      }
      this.tests[name] = { variant: chosen };
      localStorage.setItem(`nexus_ab_${name}`, chosen);

      // Track variant assignment
      window.NexusTracker && window.NexusTracker.track('ABTestAssign', { test: name, variant: chosen });
      return chosen;
    },

    get(name) {
      return this.tests[name]?.variant || localStorage.getItem(`nexus_ab_${name}`) || null;
    },
  };

  // ── DEVICE DETECT ────────────────────────────────────────
  function getDevice() {
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  // ── MAIN TRACKER ─────────────────────────────────────────
  const NexusTracker = {
    config: CONFIG,
    sessionId: null,
    utms: {},
    device: getDevice(),
    _initialized: false,
    _scrollFired: {},
    _timeFired: {},
    _sectionFired: {},

    async init() {
      if (this._initialized) return;
      this._initialized = true;

      // Session
      this.sessionId = localStorage.getItem('nexus_sid') || generateUUID();
      localStorage.setItem('nexus_sid', this.sessionId);

      // UTMs
      this.utms = UTM.capture();

      // Lead Score
      LeadScore.load();

      // Clarity custom tags
      if (window.clarity) {
        clarity('set', 'session_id', this.sessionId);
        clarity('set', 'device', this.device);
        if (this.utms.utm_source) clarity('set', 'utm_source', this.utms.utm_source);
        if (this.utms.utm_campaign) clarity('set', 'utm_campaign', this.utms.utm_campaign);
      }

      // Tracking listeners
      this._initScrollTracking();
      this._initTimeTracking();
      this._initSectionTracking();
      this._initCTATracking();
      this._initFAQTracking();

      // Save session to Supabase (Legacy - Desativado)
      // this._saveSession();

      // Core page tracking
      this.track('PageView', { title: document.title });
      this.track('ViewContent', { 
        content_name: 'NexusSaaS Landing', 
        items: [{
          item_id: 'nexussaas-pro',
          item_name: 'NexusSaaS Pro',
          item_category: 'SaaS',
          quantity: 1
        }]
      });

      console.log('%c NexusTracker v2 ✓ ', 'background:#FF6B00;color:#fff;padding:4px 10px;border-radius:4px;font-weight:bold;');
    },

    // ── CORE TRACK ─────────────────────────────────────────
    async track(eventName, params = {}) {
      const eventId = params._eventId || generateUUID();
      delete params._eventId;
      const utms = this.utms;
      const allParams = {
        ...params,
        ...utms,
        session_id: this.sessionId,
        device: this.device,
        lead_score: LeadScore.score,
        lead_tier: LeadScore.getTier(),
        timestamp: new Date().toISOString(),
      };

      // Update lead score
      LeadScore.add(eventName);

      // Clarity
      try { window.clarity && clarity('event', eventName); } catch (_) {}

      // Meta Pixel
      this._trackMeta(eventName, params, eventId);

      // GA4 / GTM
      this._trackGA4(eventName, allParams);

      if (CONFIG.DEBUG_TRACKING) {
        console.log(`[NexusTracker] Event: ${eventName}`, { payload: allParams, eventId, timestamp: allParams.timestamp });
      }

      // Google Ads (specific events)
      this._trackGAds(eventName, params);

      // Supabase event log (async, non-blocking)
      this._logEvent(eventName, allParams, eventId);

      // CAPI (for key events)
      const capiEvents = ['ViewContent','Lead','InitiateCheckout','Purchase','QualifiedLead','ReadyToBuy','VideoComplete','Hero_CTA_Click','Hero_Secondary_Click','Offer_Click','Offer_Checkout','Offer_Conversion'];
      if (capiEvents.includes(eventName)) {
        this._sendCAPI(eventName, params, eventId);
      }

      return eventId;
    },

    // ── META PIXEL ─────────────────────────────────────────
    _trackMeta(eventName, params, eventId) {
      if (!window.fbq) return;
      const val = params?.value || 0;
      const currency = params?.currency || 'BRL';
      const metaStandard = {
        ViewContent: () => fbq('track', 'ViewContent', { content_name: 'NexusSaaS', currency, value: val }, { eventID: eventId }),
        Lead: () => fbq('track', 'Lead', { currency, value: val }, { eventID: eventId }),
        InitiateCheckout: () => fbq('track', 'InitiateCheckout', { currency, value: val, content_ids: [params?.product_slug || 'nexussaas'] }, { eventID: eventId }),
        Purchase: () => fbq('track', 'Purchase', { currency, value: val, order_id: params?.order_id }, { eventID: eventId }),
      };
      if (metaStandard[eventName]) {
        metaStandard[eventName]();
      } else {
        fbq('trackCustom', eventName, { ...params, session_id: this.sessionId }, { eventID: eventId });
      }
    },

    // ── GA4 / GTM ──────────────────────────────────────────
    _trackGA4(eventName, params) {
      const ga4Map = {
        PageView: 'page_view',
        ViewContent: 'view_item',
        Lead: 'generate_lead',
        InitiateCheckout: 'begin_checkout',
        Purchase: 'purchase',
        VideoPlay: 'video_start',
        Video25: 'video_progress',
        Video50: 'video_progress',
        Video75: 'video_progress',
        VideoComplete: 'video_complete',
        Scroll25: 'scroll_depth',
        Scroll50: 'scroll_depth',
        Scroll75: 'scroll_depth',
        Scroll90: 'scroll_depth',
        QualifiedLead: 'qualified_lead',
        ReadyToBuy: 'ready_to_buy',
        QuizComplete: 'quiz_complete',
        Hero_View: 'hero_view',
        Hero_CTA_Click: 'hero_cta_click',
        Hero_Secondary_Click: 'hero_secondary_click',
        Hero_Scroll: 'hero_scroll',
        TrustBar_View: 'trustbar_view',
        ValueProof_View: 'valueproof_view',
        Offer_View: 'offer_view',
        Offer_Click: 'offer_click',
        Offer_Checkout: 'offer_checkout',
        Offer_Conversion: 'offer_conversion',
      };

      const ga4EventName = ga4Map[eventName] || eventName.toLowerCase().replace(/([A-Z])/g, '_$1').slice(1);

      // via dataLayer (GTM)
      window.dataLayer = window.dataLayer || [];
      
      const dlPayload = { event: ga4EventName };
      
      if (['purchase', 'begin_checkout', 'view_item'].includes(ga4EventName)) {
        dlPayload.ecommerce = {
          transaction_id: params.order_id || params.transaction_id || undefined,
          value: parseFloat(params.value || 0),
          currency: params.currency || 'BRL',
          items: params.items || []
        };
        // Para não duplicar chaves no root, podemos enviar o resto tbm ou deixar apenas no ecommerce
        if (ga4EventName === 'generate_lead') {
          dlPayload.lead_id = params.lead_id;
          dlPayload.page_location = window.location.href;
          dlPayload.utm_source = params.utm_source;
          dlPayload.utm_medium = params.utm_medium;
          dlPayload.utm_campaign = params.utm_campaign;
        }
      } else if (ga4EventName === 'generate_lead') {
        Object.assign(dlPayload, params);
        dlPayload.page_location = window.location.href;
      } else {
        Object.assign(dlPayload, params);
      }
      
      window.dataLayer.push({ ecommerce: null }); // Clear ecommerce object before pushing new one (GA4 best practice)
      window.dataLayer.push(dlPayload);

      // via gtag direct removido para usar apenas GTM
    },

    // ── GOOGLE ADS ─────────────────────────────────────────
    _trackGAds(eventName, params) {
      // Removido: Conversões do Google Ads devem ser configuradas exclusivamente dentro do Google Tag Manager
      // lendo os eventos do dataLayer (ex: generate_lead, begin_checkout, purchase)
    },

    // ── META CAPI RELAY ────────────────────────────────────
    async _sendCAPI(eventName, params, eventId) {
      if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('SEU_')) return;
      try {
        const utms = this.utms;
        const userData = window._nexusLeadData || {};
        const payload = {
          event_name: eventName,
          event_id: eventId,
          session_id: this.sessionId,
          fbp: UTM.getFbp(),
          fbc: UTM.getFbc(),
          fbclid: utms.fbclid,
          pixel_id: CONFIG.META_PIXEL_ID,
          event_source_url: window.location.href,
          user_agent: navigator.userAgent,
          ...params,
        };

        // Hash PII if present
        if (userData.email) payload.em = await sha256(userData.email);
        if (userData.phone) payload.ph = await sha256(userData.phone.replace(/\D/g, ''));
        if (userData.email) payload.external_id = await sha256(userData.email);

        await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/capi-relay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.warn('[NexusCAPI]', e.message);
      }
    },

    // ── SUPABASE EVENT LOG ─────────────────────────────────
    async _logEvent(eventName, params, eventId) {
      if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('SEU_')) return;
      try {
        await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/capture-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'log_event',
            eventData: {
              event_id: eventId,
              event_name: eventName,
              session_id: this.sessionId,
              lead_score: LeadScore.score,
              params: params,
              device: this.device,
              url: window.location.href,
              referrer: document.referrer
            }
          })
        });
      } catch (_) {}
    },

    // ── SESSION SAVE ───────────────────────────────────────
    async _saveSession() {
      // Desativado: o acesso direto à tabela sessions foi revogado no hardening.
      return;
    },

    // ── SCROLL TRACKING ────────────────────────────────────
    _initScrollTracking() {
      const milestones = [25, 50, 75, 90];
      const getScrollPct = () => {
        const el = document.documentElement;
        return Math.round((window.scrollY / (el.scrollHeight - el.clientHeight)) * 100);
      };
      const handler = () => {
        const pct = getScrollPct();
        milestones.forEach(m => {
          if (pct >= m && !this._scrollFired[m]) {
            this._scrollFired[m] = true;
            this.track(`Scroll${m}`, { percent: m });
          }
        });
      };
      window.addEventListener('scroll', handler, { passive: true });
    },

    // ── TIME ON PAGE TRACKING ──────────────────────────────
    _initTimeTracking() {
      const times = [30, 60, 120];
      times.forEach(t => {
        setTimeout(() => {
          if (!this._timeFired[t]) {
            this._timeFired[t] = true;
            this.track(`Time${t}s`, { seconds: t });
          }
        }, t * 1000);
      });
    },

    // ── SECTION VISIBILITY TRACKING ───────────────────────
    _initSectionTracking() {
      const sectionMap = {
        'systems': 'ViewSystems',
        'bonus': 'ViewVault',
        'pricing': 'ViewPricing',
        'guarantee': 'ViewGuarantee',
        'vsl-section': 'ViewVSL',
      };
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id || entry.target.className.split(' ')[0];
            const evt = sectionMap[id];
            if (evt && !this._sectionFired[evt]) {
              this._sectionFired[evt] = true;
              this.track(evt, { section: id });
              observer.unobserve(entry.target);
            }
          }
        });
      }, { threshold: 0.3 });

      Object.keys(sectionMap).forEach(id => {
        const el = document.getElementById(id) || document.querySelector(`.${id}`);
        if (el) observer.observe(el);
      });
    },

    // ── CTA CLICK TRACKING ─────────────────────────────────
    _initCTATracking() {
      document.querySelectorAll('[id$="-cta-btn"], [id$="-cta-primary"], [id^="btn-system"], [id^="main-cta"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.id || 'unknown';
          const location = id.includes('hero') ? 'hero' : id.includes('pricing') || id.includes('main') ? 'pricing' : id.includes('final') ? 'final' : 'other';
          if (location === 'hero') this.track('CTAHeroClick', { cta_id: id });
          if (location === 'pricing') this.track('CTAPricingClick', { cta_id: id });
          if (location === 'final') this.track('CTAFinalClick', { cta_id: id });
        });
      });
    },

    // ── FAQ TRACKING ───────────────────────────────────────
    _initFAQTracking() {
      document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.querySelector('span')?.textContent?.slice(0, 60);
          this.track('FAQInteraction', { question: q });
        });
      });
    },

    // ── VIDEO TRACKING ─────────────────────────────────────
    initVideoTracking(playerId) {
      // YouTube IFrame API
      if (window.YT && window.YT.Player) {
        const player = new YT.Player(playerId, {
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING && !this._ytStarted) {
                this._ytStarted = true;
                this.track('VideoPlay', { video: 'NexusSaaS VSL' });
              }
            },
          },
        });
        // Poll for milestones
        const milestones = { 25: false, 50: false, 75: false, 100: false };
        setInterval(() => {
          try {
            const dur = player.getDuration();
            const cur = player.getCurrentTime();
            if (!dur) return;
            const pct = Math.round((cur / dur) * 100);
            if (pct >= 25 && !milestones[25]) { milestones[25] = true; this.track('Video25', { pct: 25 }); }
            if (pct >= 50 && !milestones[50]) { milestones[50] = true; this.track('Video50', { pct: 50 }); }
            if (pct >= 75 && !milestones[75]) { milestones[75] = true; this.track('Video75', { pct: 75 }); }
            if (pct >= 95 && !milestones[100]) { milestones[100] = true; this.track('VideoComplete', { pct: 100 }); }
          } catch (_) {}
        }, 3000);
      }
    },

    // ── LOOKALIKE DATA ENRICHMENT ──────────────────────────
    async enrichForLookalike(leadData) {
      window._nexusLeadData = leadData;
      if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('SEU_')) return;
      try {
        const em = leadData.email ? await sha256(leadData.email) : null;
        const ph = leadData.phone ? await sha256(leadData.phone.replace(/\D/g, '')) : null;
        
        await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/capture-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'upsert_lead',
            leadData: {
              session_id: this.sessionId,
              name: leadData.name,
              email: leadData.email,
              whatsapp: leadData.phone,
              external_id: em,
              em_hash: em,
              ph_hash: ph,
              lead_score: LeadScore.score,
              lead_tier: LeadScore.getTier(),
              lead_status: 'new',
              quiz_answers: leadData.quizAnswers || null,
              device: this.device,
              correlation_id: getCorrelationId(),
              ...this.utms
            }
          })
        });
      } catch (e) {
        console.warn('[NexusLead]', e.message);
      }
    },
  };

  // ── EXPOSE GLOBALS ────────────────────────────────────────
  window.NexusTracker = NexusTracker;
  window.NexusABTest  = ABTest;
  window.NexusScore   = LeadScore;
  window.NexusUTM     = UTM;

  // ── AUTO INIT ─────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NexusTracker.init());
  } else {
    NexusTracker.init();
  }

})();
