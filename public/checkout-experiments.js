/**
 * checkout-experiments.js
 * Módulo passivo de A/B Testing do NexusSaaS.
 * Intercepta a inicialização do checkout, consulta ativamente variantes,
 * delega o visual e registra exposição (tudo sem interromper pagamentos).
 */

(function (window) {
  'use strict';

  // URLs das Edge Functions
  // Em produção, isso viria da env ou hardcoded se já estiver construído com a URL fixa.
  // Como estamos em ambiente SaaS, precisamos do supabase_url do projeto.
  // Supondo que a variável `supabaseUrl` está acessível globalmente (ela está no checkout.html)
  
  const CACHE_KEY = 'nexus_experiment_cache_v1';
  const TIMEOUT_MS = 800;

  const getSupabaseUrl = () => {
    return window.SUPABASE_URL || 'https://seu-projeto.supabase.co'; 
    // Em checkout.html a gente precisa garantir que as variaveis estão disponíveis, ou extrair do config legacy
  };

  const ALLOWED_PROPS = [
    'theme_color', 'background_color', 'button_color', 'button_text',
    'title', 'subtitle', 'timer_enabled', 'timer_minutes',
    'social_proof_enabled', 'social_proof_text', 'guarantee_title',
    'guarantee_text', 'benefits_list', 'logo_url', 'product_image_url',
    'section_visibility'
  ];

  class NexusExperiments {
    
    /**
     * Tenta resolver uma variante de experimento para o usuário atual.
     * @param {string} productSlug 
     * @param {string} sessionId 
     * @param {object} fallbackConfig Configuração original (padrão)
     * @returns {Promise<object>} Configuração resolvida ou fallbackConfig
     */
    static async resolveVariant(productSlug, sessionId, fallbackConfig) {
      if (!productSlug || !sessionId) return fallbackConfig;

      try {
        // Tenta obter do cache
        const cached = this._getCache(productSlug);
        if (cached && cached.config && cached.expiresAt > Date.now()) {
          // Se tiver em cache e ainda ativo, manda expor no background e retorna
          this._registerExposure(cached.experiment_id, cached.variant_id, sessionId, productSlug, cached.config_hash);
          return this._sanitizeConfig(cached.config, fallbackConfig);
        }

        const supabaseUrl = getSupabaseUrl();
        if (!supabaseUrl || supabaseUrl === 'https://seu-projeto.supabase.co') {
            // Tentativa de fallback de onde ler o url
            if (window.supabaseClient && window.supabaseClient.supabaseUrl) {
               // ... internal trick se o dev esqueceu
            }
        }
        
        // Em produção, a url correta da Edge Function:
        const edgeFunctionUrl = `${window.SUPABASE_URL}/functions/v1/checkout-experiment-resolve`;
        
        const fetchPromise = fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_slug: productSlug, session_id: sessionId })
        });

        // Aplicar SLA Timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
        );

        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const data = await response.json();

        if (!data.enabled || !data.config) {
          return fallbackConfig;
        }

        // Snapshot seguro recebido.
        const safeConfig = this._sanitizeConfig(data.config, fallbackConfig);

        // Registrar no Cache
        this._setCache(productSlug, {
          experiment_id: data.experiment_id,
          variant_id: data.variant_id,
          variant_key: data.variant_key,
          config_hash: data.config_hash,
          config: safeConfig,
          expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutos de TTL
        });

        // Registro silencioso em background
        this._registerExposure(data.experiment_id, data.variant_id, sessionId, productSlug, data.config_hash);

        return safeConfig;

      } catch (error) {
        // Qualquer falha: Timeout, rede, json quebrado -> Fallback silencioso
        console.warn('[NexusExperiments] Fallback to control variant due to:', error.message);
        return fallbackConfig;
      }
    }

    static _sanitizeConfig(snapshot, fallback) {
      if (!snapshot || typeof snapshot !== 'object') return fallback;
      
      const sanitized = { ...fallback }; // Base no fallback (para herdar tracking e settings de preço)
      
      // Aplicar APENAS as propriedades da Whitelist Visual que vieram no snapshot
      for (const prop of ALLOWED_PROPS) {
        if (snapshot[prop] !== undefined) {
          sanitized[prop] = snapshot[prop];
        }
      }
      return sanitized;
    }

    static async _registerExposure(experimentId, variantId, sessionId, productSlug, configHash) {
      try {
        const edgeFunctionUrl = `${window.SUPABASE_URL}/functions/v1/checkout-experiment-exposure`;
        
        // Fire and forget
        fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            experiment_id: experimentId,
            variant_id: variantId,
            session_id: sessionId,
            product_slug: productSlug,
            config_hash: configHash
          })
        }).catch(() => {});
      } catch (e) {
        // Ignora erros no frontend
      }
    }

    static _getCache(productSlug) {
      try {
        const raw = localStorage.getItem(`${CACHE_KEY}_${productSlug}`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    static _setCache(productSlug, data) {
      try {
        localStorage.setItem(`${CACHE_KEY}_${productSlug}`, JSON.stringify(data));
      } catch (e) { /* ignore quota exceed */ }
    }
  }

  window.NexusExperiments = NexusExperiments;

})(window);
