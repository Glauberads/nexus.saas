/**
 * NexusSaaS - Live Analytics (Production Grade)
 * 
 * Este módulo opera de forma 100% isolada e Read-Only.
 * É destruído integralmente ao sair da aba (Lazy Loaded).
 */

(function() {
    // Evita dupla inicialização
    if (window.NexusLiveAnalytics) return;

    window.NexusLiveAnalytics = {
        config: {
            refreshRateMs: 60000, // Sincronização silenciosa a cada 60s
            maxFeedItems: 100, // Limite de itens na tela para poupar memória
            reconnectIntervals: [3000, 5000, 10000, 20000, 30000], // Backoff
            channels: ['events', 'leads', 'purchases', 'financial_logs']
        },

        state: {
            realtimeChannel: null,
            syncTimer: null,
            isConnected: false,
            latency: 0,
            eventsReceived: 0,
            lastSyncAt: null,
            reconnectAttempts: 0,
            
            // Dados em memória
            dashboard: { visitors: 0, leads: 0, purchases: 0, revenue: 0 },
            funnel: { views: 0, checkout: 0, pix: 0 },
            health: { dlq_pending: 0, webhooks_today: 0, db_time: null },
            
            // Controle
            isDestroyed: true
        },

        // ==========================================
        // 1. CICLO DE VIDA (LIFECYCLE)
        // ==========================================
        init: async function() {
            console.log('[LiveAnalytics] Inicializando módulo...');
            this.state.isDestroyed = false;
            
            // Limpa Feed antigo
            this.clearFeed();
            
            // Mostra UI "Conectando..."
            this.updateHealthUI('connecting');
            
            // Busca estado inicial via RPC
            await this.sync(true); // isInitial = true
            
            // Se o usuário já mudou de aba enquanto fazia a request:
            if (this.state.isDestroyed) return;
            
            // Conecta ao WS
            this.connect();
            
            // Inicia Sincronização Silenciosa Periódica
            this.state.syncTimer = setInterval(() => {
                if (!this.state.isDestroyed) this.sync(false);
            }, this.config.refreshRateMs);
        },

        destroy: function() {
            if (this.state.isDestroyed) return;
            console.log('[LiveAnalytics] Destruindo módulo (Garbage Collection)...');
            this.state.isDestroyed = true;
            
            this.disconnect();
            
            if (this.state.syncTimer) {
                clearInterval(this.state.syncTimer);
                this.state.syncTimer = null;
            }
            
            this.state.reconnectAttempts = 0;
            this.clearFeed();
        },

        // ==========================================
        // 2. SINCRONIZAÇÃO E RPCS (READ-ONLY)
        // ==========================================
        sync: async function(isInitial = false) {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
            
            try {
                const startTime = performance.now();
                
                // Dispara RPCs em paralelo (Modular Architecture)
                const [dashRes, funnelRes, healthRes] = await Promise.all([
                    supabaseClient.rpc('rpc_live_dashboard'),
                    supabaseClient.rpc('rpc_live_funnel'),
                    supabaseClient.rpc('rpc_live_health')
                ]);
                
                const endTime = performance.now();
                this.state.latency = Math.round(endTime - startTime);
                
                if (dashRes.data) this.state.dashboard = dashRes.data;
                if (funnelRes.data) this.state.funnel = funnelRes.data;
                if (healthRes.data) this.state.health = healthRes.data;
                
                this.state.lastSyncAt = new Date();
                
                this.render();
                
                if (isInitial) {
                    this.pushToFeed('Sistema inicializado. RPCs sincronizados.', 'system');
                }
            } catch (err) {
                console.error('[LiveAnalytics] Erro na sincronização:', err);
                if (isInitial) this.pushToFeed('Erro ao buscar dados iniciais.', 'error');
            }
        },

        // ==========================================
        // 3. REALTIME (SUPABASE)
        // ==========================================
        connect: function() {
            if (typeof supabaseClient === 'undefined' || !supabaseClient || this.state.isDestroyed) return;
            if (this.state.realtimeChannel) this.disconnect();
            
            console.log('[LiveAnalytics] Conectando Realtime...');
            
            this.state.realtimeChannel = supabaseClient
                .channel('live-analytics')
                // Listeners dinâmicos baseados na config
                .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) => this.handleRealtimeEvent('events', payload))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => this.handleRealtimeEvent('leads', payload))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, (payload) => this.handleRealtimeEvent('purchases', payload))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'webhook_logs' }, (payload) => this.handleRealtimeEvent('webhook_logs', payload))
                .subscribe((status, err) => {
                    if (this.state.isDestroyed) {
                        this.disconnect();
                        return;
                    }
                    
                    if (status === 'SUBSCRIBED') {
                        console.log('[LiveAnalytics] Conectado com sucesso.');
                        this.state.isConnected = true;
                        this.state.reconnectAttempts = 0;
                        this.updateHealthUI('connected');
                        this.pushToFeed('Canal Realtime conectado.', 'system');
                    }
                    
                    if (status === 'CLOSED') {
                        this.state.isConnected = false;
                        this.updateHealthUI('disconnected');
                    }
                    
                    if (status === 'CHANNEL_ERROR') {
                        this.state.isConnected = false;
                        this.updateHealthUI('error');
                        this.reconnect();
                    }
                });
        },

        disconnect: function() {
            if (this.state.realtimeChannel && typeof supabaseClient !== 'undefined' && supabaseClient) {
                console.log('[LiveAnalytics] Desconectando canal Realtime...');
                supabaseClient.removeChannel(this.state.realtimeChannel);
                this.state.realtimeChannel = null;
            }
            this.state.isConnected = false;
            this.updateHealthUI('disconnected');
        },

        reconnect: function() {
            if (this.state.isDestroyed) return;
            
            let delay = this.config.reconnectIntervals[this.state.reconnectAttempts] || 30000;
            
            console.log(`[LiveAnalytics] Tentando reconectar em ${delay}ms... (Tentativa ${this.state.reconnectAttempts + 1})`);
            this.pushToFeed(`Conexão perdida. Reconectando em ${delay/1000}s...`, 'system');
            
            setTimeout(() => {
                if (!this.state.isDestroyed) {
                    this.state.reconnectAttempts++;
                    this.connect();
                }
            }, delay);
        },

        // ==========================================
        // 4. EVENT HANDLERS
        // ==========================================
        handleRealtimeEvent: function(table, payload) {
            if (this.state.isDestroyed) return;
            this.state.eventsReceived++;
            
            let msg = '';
            let type = 'info';
            
            if (table === 'events' && payload.eventType === 'INSERT') {
                const eventName = payload.new.event_name;
                msg = `Novo Evento: ${eventName}`;
                
                // Cache updates
                if (eventName === 'PageView') {
                    this.state.dashboard.visitors++;
                    this.state.funnel.views++;
                }
                if (eventName === 'InitiateCheckout') this.state.funnel.checkout++;
                if (eventName === 'PixGenerated') this.state.funnel.pix++;
                
            } else if (table === 'leads' && payload.eventType === 'INSERT') {
                msg = `Novo Lead Capturado: ${payload.new.email}`;
                type = 'success';
                this.state.dashboard.leads++;
                this.updateLeadRadar(payload.new);
                
            } else if (table === 'purchases' && payload.eventType === 'INSERT') {
                msg = `Nova Compra (${payload.new.status}): R$ ${payload.new.value}`;
                type = 'success';
                if (payload.new.status === 'CONFIRMED') {
                    this.state.dashboard.purchases++;
                    this.state.dashboard.revenue += parseFloat(payload.new.value || 0);
                }
            } else if (table === 'webhook_logs') {
                msg = `Webhook Recebido: ${payload.new.platform} - ${payload.new.event_type}`;
                this.state.health.webhooks_today++;
            } else {
                // Outros updates
                msg = `Update em ${table} [${payload.eventType}]`;
            }

            if (msg) this.pushToFeed(msg, type);
            this.render(); // Atualiza a UI reativamente
        },

        // ==========================================
        // 5. UI RENDER E DOM MANIPULATION
        // ==========================================
        render: function() {
            if (this.state.isDestroyed) return;
            
            // Função auxiliar segura
            const setHtml = (id, html) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = html;
            };

            // Formata Moeda
            const fMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

            // Dashboard
            setHtml('live-kpi-visitors', this.state.dashboard.visitors);
            setHtml('live-kpi-leads', this.state.dashboard.leads);
            setHtml('live-kpi-purchases', this.state.dashboard.purchases);
            setHtml('live-kpi-revenue', fMoney(this.state.dashboard.revenue));
            
            const ticket = this.state.dashboard.purchases > 0 ? (this.state.dashboard.revenue / this.state.dashboard.purchases) : 0;
            setHtml('live-kpi-ticket', fMoney(ticket));

            // Funil
            setHtml('live-funnel-views', this.state.funnel.views);
            setHtml('live-funnel-checkout', this.state.funnel.checkout);
            setHtml('live-funnel-pix', this.state.funnel.pix);
            setHtml('live-funnel-purchases', this.state.dashboard.purchases);

            // Conversão Funil (View -> Compra)
            const conv = this.state.funnel.views > 0 ? ((this.state.dashboard.purchases / this.state.funnel.views) * 100).toFixed(2) : 0;
            setHtml('live-funnel-conv', `${conv}%`);

            this.updateHealthUI(this.state.isConnected ? 'connected' : 'disconnected');
        },

        updateHealthUI: function(status) {
            const statusEl = document.getElementById('live-health-status');
            const latencyEl = document.getElementById('live-health-latency');
            const eventsEl = document.getElementById('live-health-events');
            const syncEl = document.getElementById('live-health-sync');
            
            if (!statusEl) return;

            if (status === 'connecting') {
                statusEl.innerHTML = `🟡 Conectando...`;
            } else if (status === 'connected') {
                statusEl.innerHTML = `🟢 Conectado`;
            } else if (status === 'disconnected') {
                statusEl.innerHTML = `⚪ Desconectado`;
            } else if (status === 'error') {
                statusEl.innerHTML = `🔴 Erro de Conexão`;
            }

            if (latencyEl) latencyEl.innerHTML = `${this.state.latency} ms`;
            if (eventsEl) eventsEl.innerHTML = this.state.eventsReceived;
            
            if (syncEl && this.state.lastSyncAt) {
                const diffSec = Math.floor((new Date() - this.state.lastSyncAt) / 1000);
                syncEl.innerHTML = `${diffSec}s atrás`;
            }
        },

        pushToFeed: function(msg, type = 'info') {
            const feedBody = document.getElementById('live-feed-body');
            if (!feedBody) return;

            const timeStr = new Date().toLocaleTimeString('pt-BR');
            const tr = document.createElement('tr');
            
            let color = 'var(--text-primary)';
            if (type === 'success') color = 'var(--success)';
            if (type === 'error') color = 'var(--danger)';
            if (type === 'system') color = 'var(--accent)';

            tr.innerHTML = `
                <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${timeStr}</td>
                <td style="color: ${color}; font-size: 13px;">${msg}</td>
            `;

            feedBody.prepend(tr);

            // Limita o número de eventos para evitar memory leak
            while (feedBody.children.length > this.config.maxFeedItems) {
                feedBody.removeChild(feedBody.lastChild);
            }
        },

        clearFeed: function() {
            const feedBody = document.getElementById('live-feed-body');
            if (feedBody) feedBody.innerHTML = '';
        },

        updateLeadRadar: function(lead) {
            const radarBody = document.getElementById('live-radar-body');
            if (!radarBody) return;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${lead.name || 'Desconhecido'}</td>
                <td>${lead.email}</td>
                <td><span class="badge" style="background: rgba(255,255,255,0.1)">${lead.utm_source || 'Direto'}</span></td>
                <td><span style="color: #ef4444; font-weight: bold;">${lead.lead_score || 0}</span></td>
            `;
            
            radarBody.prepend(tr);
            
            // Limita radar a 10 leads recentes
            while (radarBody.children.length > 10) {
                radarBody.removeChild(radarBody.lastChild);
            }
        }
    };

})();
