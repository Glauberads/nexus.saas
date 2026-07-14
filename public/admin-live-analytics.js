/**
 * NexusSaaS - Operations Center (V3)
 * 
 * 100% Isolado, Read-Only, Try/Catch Global e Local.
 */

(function() {
    if (window.NexusLiveAnalytics) return;

    window.NexusLiveAnalytics = {
        config: {
            refreshRateMs: 60000, 
            maxFeedItems: 50, // limite estrito
            maxTimelineItems: 30,
            maxPixItems: 15,
            maxPurchases: 15,
            reconnectIntervals: [3000, 5000, 10000, 20000, 30000],
            channels: ['events', 'leads', 'purchases', 'webhook_logs', 'sessions']
        },

        state: {
            realtimeChannel: null,
            syncTimer: null,
            isConnected: false,
            latency: 0,
            eventsReceived: 0,
            lastSyncAt: null,
            reconnectAttempts: 0,
            
            // V1/V2 Base
            dashboard: { visitors: 0, leads: 0, purchases: 0, revenue: 0 },
            funnel: { views: 0, checkout: 0, pix: 0 },
            
            // V3 State Operations
            v3: {
                online_now: 0,
                desktop: 0,
                mobile: 0,
                tablet: 0,
                new_visitors: 0,
                returning: 0,
                traffic: [],
                pix_pending: [],
                purchases: [],
                timeline: [],
                health: { dlq_pending: 0, db_time: null, last_webhook: null },
                avg_funnel_time: 0,
                site_temp: 'CALCULANDO',
                mission_status: 'NORMAL', // NORMAL | ACTION_REQUIRED
                mission_desc: 'Todos os subsistemas operando em condições ideais.'
            },
            
            isDestroyed: true
        },

        // ==========================================
        // 1. LIFECYCLE
        // ==========================================
        init: async function() {
            console.log('[NOC V3] Inicializando Operations Center...');
            this.state.isDestroyed = false;
            
            this.clearFeeds();
            this.updateHealthUI('connecting');
            
            await this.sync(true);
            
            if (this.state.isDestroyed) return;
            
            this.connect();
            
            this.state.syncTimer = setInterval(() => {
                if (!this.state.isDestroyed) this.sync(false);
            }, this.config.refreshRateMs);
        },

        destroy: function() {
            if (this.state.isDestroyed) return;
            console.log('[NOC V3] GC: Limpando arrays e abortando WS...');
            this.state.isDestroyed = true;
            
            this.disconnect();
            
            if (this.state.syncTimer) {
                clearInterval(this.state.syncTimer);
                this.state.syncTimer = null;
            }
            
            this.state.reconnectAttempts = 0;
            
            // GC Estrito
            this.state.v3.traffic = [];
            this.state.v3.pix_pending = [];
            this.state.v3.purchases = [];
            this.state.v3.timeline = [];
            
            this.clearFeeds();
        },

        // ==========================================
        // 2. SYNCHRONIZATION (RPCs)
        // ==========================================
        sync: async function(isInitial = false) {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
            
            try {
                const startTime = performance.now();
                
                // Dispara tudo assíncrono sem estourar o bloco (trata internamente o erro SQL)
                const promises = [
                    supabaseClient.rpc('rpc_live_dashboard'),
                    supabaseClient.rpc('rpc_live_funnel'),
                    supabaseClient.rpc('rpc_live_visitors_v3'), // v3
                    supabaseClient.rpc('rpc_live_traffic_v2'), // reutilizando do v2
                    supabaseClient.rpc('rpc_live_pix_v3'), // v3
                    supabaseClient.rpc('rpc_live_funnel_time_v2'), // reutilizando v2
                    supabaseClient.rpc('rpc_live_health_v2') // reutilizando v2
                ];
                
                const [dashRes, funnelRes, visRes, trafRes, pixRes, timeRes, healthRes] = await Promise.all(promises);
                
                const endTime = performance.now();
                this.state.latency = Math.round(endTime - startTime);
                
                // Mapeia V1
                if (dashRes && dashRes.data) this.state.dashboard = dashRes.data;
                if (funnelRes && funnelRes.data) this.state.funnel = funnelRes.data;
                
                // Mapeia V3 Visitors
                if (visRes && visRes.data) {
                    this.state.v3.online_now = visRes.data.online_now || 0;
                    this.state.v3.desktop = visRes.data.desktop || 0;
                    this.state.v3.mobile = visRes.data.mobile || 0;
                    this.state.v3.tablet = visRes.data.tablet || 0;
                    this.state.v3.new_visitors = visRes.data.new_visitors || 0;
                    this.state.v3.returning = visRes.data.returning_visitors || 0;
                }
                
                // Mapeia Traffic
                if (trafRes && trafRes.data) this.state.v3.traffic = trafRes.data;
                
                // Mapeia PIX
                if (pixRes && pixRes.data) {
                    if (pixRes.data.pending_list) {
                        this.state.v3.pix_pending = pixRes.data.pending_list;
                    }
                }
                
                if (timeRes && timeRes.data) this.state.v3.avg_funnel_time = timeRes.data.avg_funnel_seconds || 0;
                if (healthRes && healthRes.data) this.state.v3.health = healthRes.data;
                
                this.state.lastSyncAt = new Date();
                
                this.analyzeState(); 
                this.render();
                
                if (isInitial) this.pushToRawFeed('NOC V3 Inicializado.', 'system');
                
            } catch (err) {
                console.error('[NOC V3] Falha grave no Sync Global:', err);
                if (isInitial) this.pushToRawFeed('Erro ao buscar dados.', 'error');
            }
        },

        // ==========================================
        // 3. REALTIME (V3)
        // ==========================================
        connect: function() {
            if (typeof supabaseClient === 'undefined' || !supabaseClient || this.state.isDestroyed) return;
            if (this.state.realtimeChannel) this.disconnect();
            
            this.state.realtimeChannel = supabaseClient
                .channel('live-analytics-v3')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (p) => this.handleRealtimeEvent('events', p))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p) => this.handleRealtimeEvent('leads', p))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, (p) => this.handleRealtimeEvent('purchases', p))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'webhook_logs' }, (p) => this.handleRealtimeEvent('webhook_logs', p))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (p) => this.handleRealtimeEvent('sessions', p))
                .subscribe((status) => {
                    if (this.state.isDestroyed) {
                        this.disconnect();
                        return;
                    }
                    if (status === 'SUBSCRIBED') {
                        this.state.isConnected = true;
                        this.state.reconnectAttempts = 0;
                        this.updateHealthUI('connected');
                        this.pushToRawFeed('WS Conectado (NOC V3).', 'system');
                    }
                    if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                        this.state.isConnected = false;
                        this.updateHealthUI(status === 'CLOSED' ? 'disconnected' : 'error');
                        if (status === 'CHANNEL_ERROR') this.reconnect();
                    }
                });
        },

        disconnect: function() {
            if (this.state.realtimeChannel && typeof supabaseClient !== 'undefined' && supabaseClient) {
                supabaseClient.removeChannel(this.state.realtimeChannel);
                this.state.realtimeChannel = null;
            }
            this.state.isConnected = false;
            this.updateHealthUI('disconnected');
        },

        reconnect: function() {
            if (this.state.isDestroyed) return;
            let delay = this.config.reconnectIntervals[this.state.reconnectAttempts] || 30000;
            this.pushToRawFeed(`Reconectando WS em ${delay/1000}s...`, 'system');
            setTimeout(() => {
                if (!this.state.isDestroyed) {
                    this.state.reconnectAttempts++;
                    this.connect();
                }
            }, delay);
        },

        // ==========================================
        // 4. EVENT ROUTING (ISOLATED)
        // ==========================================
        handleRealtimeEvent: function(table, payload) {
            if (this.state.isDestroyed) return;
            this.state.eventsReceived++;
            
            let msg = `Update ${table}`;
            let type = 'info';
            
            try {
                if (table === 'events' && payload.eventType === 'INSERT') {
                    const evt = payload.new.event_name;
                    msg = `Evento: ${evt}`;
                    
                    if (evt === 'PageView') {
                        this.state.dashboard.visitors++;
                        this.state.funnel.views++;
                        this.pushToTimeline('visit', 'Acesso');
                    }
                    if (evt === 'InitiateCheckout') {
                        this.state.funnel.checkout++;
                        this.pushToTimeline('checkout', 'Initiate Checkout');
                    }
                    if (evt === 'PixGenerated') {
                        this.state.funnel.pix++;
                        this.pushToTimeline('pix', 'PIX Gerado');
                    }
                } 
                else if (table === 'leads' && payload.eventType === 'INSERT') {
                    msg = `Lead Capturado`;
                    type = 'success';
                    this.state.dashboard.leads++;
                    this.pushToTimeline('lead', 'Lead Capturado');
                } 
                else if (table === 'purchases' && payload.eventType === 'INSERT') {
                    msg = `Compra [${payload.new.status}]: R$ ${payload.new.value}`;
                    type = 'success';
                    
                    if (payload.new.status === 'CONFIRMED') {
                        this.state.dashboard.purchases++;
                        this.state.dashboard.revenue += parseFloat(payload.new.value || 0);
                        this.pushToTimeline('purchase', 'Compra Confirmada!');
                        this.state.v3.purchases.unshift(payload.new);
                        if (this.state.v3.purchases.length > this.config.maxPurchases) this.state.v3.purchases.pop();
                    } else if (payload.new.status === 'PENDING' && payload.new.payment_method === 'PIX') {
                        this.state.v3.pix_pending.unshift(payload.new);
                        if (this.state.v3.pix_pending.length > this.config.maxPixItems) this.state.v3.pix_pending.pop();
                    }
                }
            } catch (err) {}

            this.pushToRawFeed(msg, type);
            this.render();
        },

        // ==========================================
        // 5. LOCAL INTELLIGENCE (NOC AI & ALERTS)
        // ==========================================
        analyzeState: function() {
            try {
                let insights = [];
                const convTotal = this.state.funnel.views > 0 ? (this.state.dashboard.purchases / this.state.funnel.views) * 100 : 0;
                
                let isCritical = false;
                let criticalReasons = [];

                if (this.state.funnel.views > 100 && convTotal < 0.5) {
                    criticalReasons.push("Conversão abaixo de 0.5% com tráfego alto");
                    isCritical = true;
                }
                
                if (this.state.v3.health && this.state.v3.health.dlq_pending > 0) {
                    criticalReasons.push(`DLQ com ${this.state.v3.health.dlq_pending} falhas.`);
                    isCritical = true;
                }
                
                if (this.state.latency > 1500) {
                    criticalReasons.push(`Banco de Dados Lento (${this.state.latency}ms)`);
                    isCritical = true;
                }

                if (!this.state.isConnected && this.state.reconnectAttempts > 1) {
                    criticalReasons.push("Websocket Desconectado");
                    isCritical = true;
                }

                if (isCritical) {
                    this.state.v3.mission_status = 'ACTION_REQUIRED';
                    this.state.v3.mission_desc = criticalReasons.join(' | ');
                } else {
                    this.state.v3.mission_status = 'NORMAL';
                    this.state.v3.mission_desc = 'Todos os subsistemas operando em condições ideais.';
                }
                
                // Temp
                if (this.state.v3.online_now > 50 && convTotal > 3) this.state.v3.site_temp = '🔥 MUITO QUENTE';
                else if (this.state.v3.online_now > 20 && convTotal > 1) this.state.v3.site_temp = '🌶️ QUENTE';
                else if (this.state.v3.online_now > 5) this.state.v3.site_temp = '☀️ MORNO';
                else this.state.v3.site_temp = '❄️ FRIO';

            } catch (err) {}
        },

        // ==========================================
        // 6. RENDER ENGINE (ISOLATED BLOCKS)
        // ==========================================
        render: function() {
            if (this.state.isDestroyed) return;
            
            const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
            const fMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

            // Mission Card
            try {
                const elIcon = document.getElementById('live-mission-icon');
                const elTitle = document.getElementById('live-mission-title');
                const elDesc = document.getElementById('live-mission-desc');
                const elCard = document.getElementById('live-critical-mission');
                const elTime = document.getElementById('live-mission-time');
                
                if (elCard && elTitle) {
                    if (this.state.v3.mission_status === 'NORMAL') {
                        elCard.style.background = 'rgba(16, 185, 129, 0.1)';
                        elCard.style.borderColor = 'var(--success)';
                        elTitle.style.color = 'var(--success)';
                        elTitle.innerText = '🟢 OPERAÇÃO NORMAL';
                        elIcon.innerText = '🟢';
                    } else {
                        elCard.style.background = 'rgba(239, 68, 68, 0.1)';
                        elCard.style.borderColor = 'var(--danger)';
                        elTitle.style.color = 'var(--danger)';
                        elTitle.innerText = '🔴 AÇÃO NECESSÁRIA';
                        elIcon.innerText = '🔴';
                    }
                    elDesc.innerText = this.state.v3.mission_desc;
                    if(elTime) elTime.innerText = new Date().toLocaleTimeString();
                }
            } catch(e) {}

            // KPIs
            try {
                setHtml('live-kpi-online', this.state.v3.online_now);
                setHtml('live-kpi-desktop', this.state.v3.desktop);
                setHtml('live-kpi-mobile', this.state.v3.mobile);
                setHtml('live-kpi-leads', this.state.dashboard.leads);
                setHtml('live-kpi-purchases', this.state.dashboard.purchases);
                setHtml('live-kpi-revenue', fMoney(this.state.dashboard.revenue));
                setHtml('live-site-temp', this.state.v3.site_temp);
            } catch(e) {}

            // Funnel
            try {
                setHtml('live-funnel-views', this.state.funnel.views);
                setHtml('live-funnel-checkout', this.state.funnel.checkout);
                setHtml('live-funnel-pix', this.state.funnel.pix);
                setHtml('live-funnel-purchases', this.state.dashboard.purchases);
                
                const secs = this.state.v3.avg_funnel_time;
                let timeStr = secs > 60 ? `${Math.floor(secs/60)}m ${Math.floor(secs%60)}s` : `${Math.floor(secs)}s`;
                setHtml('live-funnel-time', timeStr);
            } catch(e) {}

            // Traffic
            try {
                const tbTraf = document.getElementById('live-traffic-body');
                if (tbTraf) {
                    const sorted = [...this.state.v3.traffic].sort((a,b) => b.count - a.count);
                    if (sorted.length === 0) tbTraf.innerHTML = `<tr><td style="color:var(--text-muted);">Sem tráfego mapeado</td></tr>`;
                    else {
                        tbTraf.innerHTML = sorted.map(t => {
                            let max = sorted[0].count;
                            let pct = Math.round((t.count / max) * 100);
                            return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 8px;">
                                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                            <span>${t.source}</span>
                                            <strong>${t.count}</strong>
                                        </div>
                                        <div style="width:100%; height:4px; background:var(--bg-main); border-radius:2px;">
                                            <div style="width:${pct}%; height:4px; background:var(--accent); border-radius:2px;"></div>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            } catch(e) {}

            // PIX
            try {
                const tbPix = document.getElementById('live-pix-body');
                if (tbPix) {
                    if (this.state.v3.pix_pending.length === 0) tbPix.innerHTML = `<tr><td style="color:var(--text-muted);">Nenhum PIX pendente localmente</td></tr>`;
                    else {
                        tbPix.innerHTML = this.state.v3.pix_pending.map(p => {
                            const timeAgo = Math.floor((new Date() - new Date(p.created_at)) / 60000);
                            return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 8px;">${p.buyer_name || 'Anônimo'}</td>
                                    <td style="padding: 8px; color: var(--accent);">${fMoney(p.amount)}</td>
                                    <td style="padding: 8px; font-size: 10px; color: var(--text-muted);">${timeAgo}m atrás</td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            } catch(e) {}

            // Purchases Shopify Style
            try {
                const dPur = document.getElementById('live-purchases-body');
                if (dPur) {
                    if (this.state.v3.purchases.length === 0) dPur.innerHTML = `<div style="color: var(--text-muted); font-size: 12px;">Aguardando nova compra...</div>`;
                    else {
                        dPur.innerHTML = this.state.v3.purchases.map(p => `
                            <div style="background: white; border: 1px solid var(--success); padding: 12px; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.1);">
                                <div style="display:flex; justify-content:space-between; font-weight: bold; color: var(--success); font-size: 14px;">
                                    <span>🛍️ Nova Venda!</span>
                                    <span>${fMoney(p.amount || p.value)}</span>
                                </div>
                                <div style="font-size: 12px; margin-top: 4px; color: #111827;"><strong>${p.buyer_name || 'Cliente'}</strong> (${p.city || 'BR'})</div>
                            </div>
                        `).join('');
                    }
                }
            } catch(e) {}
            
            this.updateHealthUI(this.state.isConnected ? 'connected' : 'disconnected');
        },

        // ==========================================
        // 7. TIMELINE & FEED HELPERS
        // ==========================================
        pushToTimeline: function(type, text) {
            try {
                this.state.v3.timeline.unshift({ type, text, time: new Date() });
                if (this.state.v3.timeline.length > this.config.maxTimelineItems) this.state.v3.timeline.pop();
                
                const tBody = document.getElementById('live-timeline-body');
                if (!tBody) return;
                
                tBody.innerHTML = this.state.v3.timeline.map(item => {
                    let icon = '⚫';
                    let c = 'var(--text-muted)';
                    if (item.type === 'visit') { icon = '👁️'; c = 'var(--text-primary)'; }
                    if (item.type === 'lead') { icon = '👥'; c = '#3b82f6'; }
                    if (item.type === 'checkout') { icon = '🛒'; c = 'var(--text-primary)'; }
                    if (item.type === 'pix') { icon = '⚡'; c = 'var(--accent)'; }
                    if (item.type === 'purchase') { icon = '💰'; c = 'var(--success)'; }
                    
                    return `
                        <div style="display: flex; gap: 12px; padding-bottom: 12px; position: relative;">
                            <div style="border-left: 2px solid var(--border); position: absolute; left: 11px; top: 20px; bottom: 0;"></div>
                            <div style="font-size: 16px; background: var(--bg-card); z-index: 2;">${icon}</div>
                            <div>
                                <div style="font-size: 12px; font-weight: bold; color: ${c};">${item.text}</div>
                                <div style="font-size: 10px; color: var(--text-muted);">${item.time.toLocaleTimeString()}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } catch(e) {}
        },

        pushToRawFeed: function(msg, type = 'info') {
            try {
                const feedBody = document.getElementById('live-feed-body');
                if (!feedBody) return;

                const tr = document.createElement('tr');
                let color = 'var(--text-primary)';
                if (type === 'success') color = 'var(--success)';
                if (type === 'error') color = 'var(--danger)';
                if (type === 'system') color = 'var(--accent)';

                tr.innerHTML = `
                    <td style="font-family: monospace; font-size: 11px; color: var(--text-muted); padding: 4px;">${new Date().toLocaleTimeString()}</td>
                    <td style="color: ${color}; font-size: 12px; padding: 4px;">${msg}</td>
                `;

                feedBody.prepend(tr);
                while (feedBody.children.length > this.config.maxFeedItems) feedBody.removeChild(feedBody.lastChild);
            } catch(e) {}
        },

        clearFeeds: function() {
            ['live-feed-body', 'live-timeline-body', 'live-purchases-body', 'live-pix-body'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
        },

        updateHealthUI: function(wsStatus) {
            try {
                const cWs = document.getElementById('health-led-ws');
                const cDb = document.getElementById('health-led-db');
                const cWh = document.getElementById('health-led-wh');
                const cDlq = document.getElementById('health-led-dlq');
                const cEdge = document.getElementById('health-led-edge');
                
                if (cWs) cWs.style.background = wsStatus === 'connected' ? 'var(--success)' : (wsStatus === 'error' ? 'var(--danger)' : '#f59e0b');
                
                const sLat = document.getElementById('live-health-status');
                if (sLat) sLat.innerHTML = wsStatus;

                if (this.state.v3.health) {
                    if (cDb) cDb.style.background = this.state.latency < 500 ? 'var(--success)' : 'var(--danger)';
                    const elDb = document.getElementById('live-health-db-status');
                    if (elDb) elDb.innerHTML = `${this.state.latency}ms`;

                    let whLat = 0;
                    if (this.state.v3.health.last_webhook) {
                        whLat = Math.floor((new Date() - new Date(this.state.v3.health.last_webhook)) / 60000); 
                    }
                    if (cWh) cWh.style.background = whLat < 60 ? 'var(--success)' : '#f59e0b';
                    const elWh = document.getElementById('live-health-wh-latency');
                    if (elWh) elWh.innerHTML = whLat > 0 ? `${whLat}m atrás` : 'Ativo';

                    if (cDlq) cDlq.style.background = this.state.v3.health.dlq_pending > 0 ? 'var(--danger)' : 'var(--success)';
                    const elDlq = document.getElementById('live-health-dlq');
                    if (elDlq) elDlq.innerHTML = this.state.v3.health.dlq_pending;
                }
            } catch(e) {}
        }
    };

})();
