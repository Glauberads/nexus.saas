/**
 * NexusSaaS - Live Analytics Control Center (V2)
 * 
 * Este módulo opera de forma 100% isolada e Read-Only.
 * Todos os sub-módulos são encapsulados em try/catch individuais.
 */

(function() {
    if (window.NexusLiveAnalytics) return;

    window.NexusLiveAnalytics = {
        config: {
            refreshRateMs: 60000, 
            maxFeedItems: 100,
            maxTimelineItems: 50,
            maxPixItems: 20,
            maxPurchases: 20,
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
            
            // Dados estruturados
            dashboard: { visitors: 0, leads: 0, purchases: 0, revenue: 0 },
            funnel: { views: 0, checkout: 0, pix: 0 },
            
            // V2 State
            v2: {
                online_now: 0,
                desktop: 0,
                mobile: 0,
                traffic: [],
                pix_pending: [],
                avg_funnel_time: 0,
                health: { dlq_pending: 0, db_time: null, last_webhook: null },
                purchases: [], // live feed
                timeline: [], // event journey
                site_temp: 'CALCULANDO'
            },
            
            isDestroyed: true
        },

        // ==========================================
        // 1. LIFECYCLE
        // ==========================================
        init: async function() {
            console.log('[LiveAnalytics V2] Inicializando Control Center...');
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
            console.log('[LiveAnalytics V2] Garbage Collection: Limpando arrays e listeners...');
            this.state.isDestroyed = true;
            
            this.disconnect();
            
            if (this.state.syncTimer) {
                clearInterval(this.state.syncTimer);
                this.state.syncTimer = null;
            }
            
            this.state.reconnectAttempts = 0;
            
            // Garbage collection
            this.state.v2.traffic = [];
            this.state.v2.pix_pending = [];
            this.state.v2.purchases = [];
            this.state.v2.timeline = [];
            
            this.clearFeeds();
        },

        // ==========================================
        // 2. SYNCHRONIZATION (RPCs)
        // ==========================================
        sync: async function(isInitial = false) {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
            
            try {
                const startTime = performance.now();
                
                // V1 + V2 RPCs
                const promises = [
                    supabaseClient.rpc('rpc_live_dashboard').catch(e => { console.error('Erro dashboard', e); return {}; }),
                    supabaseClient.rpc('rpc_live_funnel').catch(e => { console.error('Erro funnel', e); return {}; }),
                    supabaseClient.rpc('rpc_live_visitors_v2').catch(e => { console.error('Erro visitors', e); return {}; }),
                    supabaseClient.rpc('rpc_live_traffic_v2').catch(e => { console.error('Erro traffic', e); return {}; }),
                    supabaseClient.rpc('rpc_live_pix_v2').catch(e => { console.error('Erro pix', e); return {}; }),
                    supabaseClient.rpc('rpc_live_funnel_time_v2').catch(e => { console.error('Erro funnel_time', e); return {}; }),
                    supabaseClient.rpc('rpc_live_health_v2').catch(e => { console.error('Erro health', e); return {}; })
                ];
                
                const [dashRes, funnelRes, visRes, trafRes, pixRes, timeRes, healthRes] = await Promise.all(promises);
                
                const endTime = performance.now();
                this.state.latency = Math.round(endTime - startTime);
                
                // Mapeia V1
                if (dashRes && dashRes.data) this.state.dashboard = dashRes.data;
                if (funnelRes && funnelRes.data) this.state.funnel = funnelRes.data;
                
                // Mapeia V2
                if (visRes && visRes.data) {
                    this.state.v2.online_now = visRes.data.online_now || 0;
                    this.state.v2.desktop = visRes.data.desktop || 0;
                    this.state.v2.mobile = visRes.data.mobile || 0;
                }
                
                if (trafRes && trafRes.data) this.state.v2.traffic = trafRes.data;
                if (pixRes && pixRes.data) this.state.v2.pix_pending = pixRes.data;
                
                if (timeRes && timeRes.data) this.state.v2.avg_funnel_time = timeRes.data.avg_funnel_seconds || 0;
                
                if (healthRes && healthRes.data) this.state.v2.health = healthRes.data;
                
                this.state.lastSyncAt = new Date();
                
                this.analyzeState(); // Inteligência Local (NEXUS AI)
                this.render();
                
                if (isInitial) {
                    this.pushToRawFeed('Control Center V2 Inicializado.', 'system');
                }
            } catch (err) {
                console.error('[LiveAnalytics V2] Falha grave no Sync Global:', err);
                if (isInitial) this.pushToRawFeed('Erro ao buscar dados iniciais.', 'error');
            }
        },

        // ==========================================
        // 3. REALTIME (V2)
        // ==========================================
        connect: function() {
            if (typeof supabaseClient === 'undefined' || !supabaseClient || this.state.isDestroyed) return;
            if (this.state.realtimeChannel) this.disconnect();
            
            console.log('[LiveAnalytics V2] Conectando Realtime WS...');
            
            this.state.realtimeChannel = supabaseClient
                .channel('live-analytics-v2')
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
                        this.pushToRawFeed('WS Conectado (Control Center V2).', 'system');
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
            
            // Raw Feed (Antigo)
            let msg = `Update ${table} [${payload.eventType}]`;
            let type = 'info';
            
            try {
                if (table === 'events' && payload.eventType === 'INSERT') {
                    const evt = payload.new.event_name;
                    msg = `Evento: ${evt}`;
                    
                    if (evt === 'PageView') {
                        this.state.dashboard.visitors++;
                        this.state.funnel.views++;
                        this.pushToTimeline('visit', 'Novo Visitante');
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
                    msg = `Lead: ${payload.new.email}`;
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
                        this.state.v2.purchases.unshift(payload.new);
                        if (this.state.v2.purchases.length > this.config.maxPurchases) this.state.v2.purchases.pop();
                    } else if (payload.new.status === 'PENDING' && payload.new.payment_method === 'PIX') {
                        // Add to PIX
                        this.state.v2.pix_pending.unshift(payload.new);
                        if (this.state.v2.pix_pending.length > this.config.maxPixItems) this.state.v2.pix_pending.pop();
                    }
                } 
                else if (table === 'sessions' && payload.eventType === 'INSERT') {
                    msg = `Sessão: ${payload.new.utm_source || 'direto'}`;
                    this.state.v2.online_now++;
                    
                    // Atualiza Tráfego Localmente
                    const src = payload.new.utm_source || 'direto/organico';
                    let found = false;
                    for(let t of this.state.v2.traffic) {
                        if (t.source === src) { t.count++; found = true; break; }
                    }
                    if (!found) this.state.v2.traffic.push({ source: src, count: 1 });
                }
            } catch (err) {
                console.error(`[LiveAnalytics V2] Erro isolado processando evento de ${table}:`, err);
            }

            this.pushToRawFeed(msg, type);
            this.render(); // UI Reaction
        },

        // ==========================================
        // 5. LOCAL INTELLIGENCE (RULES ENGINE)
        // ==========================================
        analyzeState: function() {
            try {
                let insights = [];
                const convTotal = this.state.funnel.views > 0 ? (this.state.dashboard.purchases / this.state.funnel.views) * 100 : 0;
                
                // Temperatura do Site
                if (this.state.v2.online_now > 50 && convTotal > 3) this.state.v2.site_temp = '🔥 MUITO QUENTE';
                else if (this.state.v2.online_now > 20 && convTotal > 1) this.state.v2.site_temp = '🌶️ QUENTE';
                else if (this.state.v2.online_now > 5) this.state.v2.site_temp = '☀️ MORNO';
                else this.state.v2.site_temp = '❄️ FRIO';

                // Alertas Operacionais Críticos
                let alertsHtml = '';
                if (this.state.funnel.views > 100 && convTotal < 0.5) {
                    alertsHtml += `<div style="background: var(--danger); color: white; padding: 12px; border-radius: 8px; font-weight: bold;">⚠️ ALERTA: Conversão abaixo de 0.5% com tráfego alto. Verifique o Checkout.</div>`;
                    insights.push("Baixa conversão detectada. Considere inspecionar abandonos.");
                }
                if (this.state.v2.health && this.state.v2.health.dlq_pending > 0) {
                    alertsHtml += `<div style="background: #f59e0b; color: white; padding: 12px; border-radius: 8px; font-weight: bold;">⚠️ SRE: Há mensagens presas no Dead Letter Queue (${this.state.v2.health.dlq_pending}).</div>`;
                    insights.push("O webhook de pagamentos falhou recentemente (DLQ ativo).");
                }
                
                const elAlerts = document.getElementById('live-operational-alerts');
                if (elAlerts) {
                    elAlerts.innerHTML = alertsHtml;
                    elAlerts.style.display = alertsHtml ? 'block' : 'none';
                }

                // AI Insights Container
                insights.push("Tráfego principal: " + (this.state.v2.traffic[0]?.source || 'Nenhum'));
                insights.push(`Latência do banco: ${this.state.latency}ms`);
                
                const aiDiv = document.getElementById('nexus-ai-insights');
                if (aiDiv) {
                    aiDiv.innerHTML = insights.map(i => `<div style="padding-bottom: 8px; border-bottom: 1px solid var(--border);">💡 ${i}</div>`).join('');
                }

            } catch (err) {
                console.error('Erro na AI Analysis', err);
            }
        },

        // ==========================================
        // 6. RENDER ENGINE (ISOLATED BLOCKS)
        // ==========================================
        render: function() {
            if (this.state.isDestroyed) return;
            
            const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
            const fMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

            // Block 1: V1 KPIs
            try {
                setHtml('live-kpi-leads', this.state.dashboard.leads);
                setHtml('live-kpi-purchases', this.state.dashboard.purchases);
                setHtml('live-kpi-revenue', fMoney(this.state.dashboard.revenue));
            } catch(e) {}

            // Block 2: V2 KPIs
            try {
                setHtml('live-kpi-online', this.state.v2.online_now);
                setHtml('live-kpi-desktop', this.state.v2.desktop);
                setHtml('live-kpi-mobile', this.state.v2.mobile);
                setHtml('live-site-temp', this.state.v2.site_temp);
            } catch(e) {}

            // Block 3: Funnel & Time
            try {
                setHtml('live-funnel-views', this.state.funnel.views);
                setHtml('live-funnel-checkout', this.state.funnel.checkout);
                setHtml('live-funnel-pix', this.state.funnel.pix);
                setHtml('live-funnel-purchases', this.state.dashboard.purchases);
                
                const secs = this.state.v2.avg_funnel_time;
                let timeStr = secs > 60 ? `${Math.floor(secs/60)}m ${Math.floor(secs%60)}s` : `${Math.floor(secs)}s`;
                setHtml('live-funnel-time', timeStr);
            } catch(e) {}

            // Block 4: Traffic Table
            try {
                const tbTraf = document.getElementById('live-traffic-body');
                if (tbTraf) {
                    const sorted = [...this.state.v2.traffic].sort((a,b) => b.count - a.count);
                    if (sorted.length === 0) tbTraf.innerHTML = `<tr><td style="color:var(--text-muted);">Sem tráfego mapeado</td></tr>`;
                    else {
                        tbTraf.innerHTML = sorted.map(t => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 8px;">${t.source}</td>
                                <td style="padding: 8px; font-weight: bold; text-align:right;">${t.count}</td>
                            </tr>
                        `).join('');
                    }
                }
            } catch(e) {}

            // Block 5: PIX Pendentes
            try {
                const tbPix = document.getElementById('live-pix-body');
                if (tbPix) {
                    if (this.state.v2.pix_pending.length === 0) tbPix.innerHTML = `<tr><td style="color:var(--text-muted);">Nenhum PIX pendente no momento</td></tr>`;
                    else {
                        tbPix.innerHTML = this.state.v2.pix_pending.map(p => {
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

            // Block 6: Live Purchases (Shopify)
            try {
                const dPur = document.getElementById('live-purchases-body');
                if (dPur) {
                    if (this.state.v2.purchases.length === 0) dPur.innerHTML = `<div style="color: var(--text-muted); font-size: 12px;">Aguardando nova compra...</div>`;
                    else {
                        dPur.innerHTML = this.state.v2.purchases.map(p => `
                            <div style="background: white; border: 1px solid var(--success); padding: 12px; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.1);">
                                <div style="font-weight: bold; color: var(--success); font-size: 14px;">🛍️ Nova Venda!</div>
                                <div style="font-size: 12px; margin-top: 4px;"><strong>${p.buyer_name || 'Cliente'}</strong> comprou.</div>
                                <div style="font-size: 14px; margin-top: 4px; color: var(--text-primary); font-weight: bold;">${fMoney(p.amount || p.value)}</div>
                            </div>
                        `).join('');
                    }
                }
            } catch(e) {}
            
            // Render Health Final
            this.updateHealthUI(this.state.isConnected ? 'connected' : 'disconnected');
        },

        // ==========================================
        // 7. TIMELINE & FEED HELPERS
        // ==========================================
        pushToTimeline: function(type, text) {
            try {
                this.state.v2.timeline.unshift({ type, text, time: new Date() });
                if (this.state.v2.timeline.length > this.config.maxTimelineItems) this.state.v2.timeline.pop();
                
                const tBody = document.getElementById('live-timeline-body');
                if (!tBody) return;
                
                tBody.innerHTML = this.state.v2.timeline.map(item => {
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

                const timeStr = new Date().toLocaleTimeString('pt-BR');
                const tr = document.createElement('tr');
                
                let color = 'var(--text-primary)';
                if (type === 'success') color = 'var(--success)';
                if (type === 'error') color = 'var(--danger)';
                if (type === 'system') color = 'var(--accent)';

                tr.innerHTML = `
                    <td style="font-family: monospace; font-size: 11px; color: var(--text-muted); padding: 4px;">${timeStr}</td>
                    <td style="color: ${color}; font-size: 12px; padding: 4px;">${msg}</td>
                `;

                feedBody.prepend(tr);
                while (feedBody.children.length > this.config.maxFeedItems) feedBody.removeChild(feedBody.lastChild);
            } catch(e) {}
        },

        clearFeeds: function() {
            const f1 = document.getElementById('live-feed-body'); if(f1) f1.innerHTML = '';
            const f2 = document.getElementById('live-timeline-body'); if(f2) f2.innerHTML = '';
            const f3 = document.getElementById('live-purchases-body'); if(f3) f3.innerHTML = '';
            const f4 = document.getElementById('live-pix-body'); if(f4) f4.innerHTML = '';
        },

        // Health UI V2 (LEDs)
        updateHealthUI: function(wsStatus) {
            try {
                const cWs = document.getElementById('health-led-ws');
                const cDb = document.getElementById('health-led-db');
                const cWh = document.getElementById('health-led-wh');
                const cDlq = document.getElementById('health-led-dlq');
                
                if (cWs) cWs.style.background = wsStatus === 'connected' ? 'var(--success)' : (wsStatus === 'error' ? 'var(--danger)' : '#f59e0b');
                
                const sLat = document.getElementById('live-health-status');
                if (sLat) sLat.innerHTML = wsStatus;

                if (this.state.v2.health) {
                    if (cDb) cDb.style.background = this.state.latency < 500 ? 'var(--success)' : 'var(--danger)';
                    const elDb = document.getElementById('live-health-db-status');
                    if (elDb) elDb.innerHTML = `${this.state.latency}ms`;

                    let whLat = 0;
                    if (this.state.v2.health.last_webhook) {
                        whLat = Math.floor((new Date() - new Date(this.state.v2.health.last_webhook)) / 60000); // minutos
                    }
                    if (cWh) cWh.style.background = whLat < 60 ? 'var(--success)' : '#f59e0b';
                    const elWh = document.getElementById('live-health-wh-latency');
                    if (elWh) elWh.innerHTML = whLat > 0 ? `${whLat}m atrás` : 'Ativo';

                    if (cDlq) cDlq.style.background = this.state.v2.health.dlq_pending > 0 ? 'var(--danger)' : 'var(--success)';
                    const elDlq = document.getElementById('live-health-dlq');
                    if (elDlq) elDlq.innerHTML = this.state.v2.health.dlq_pending;
                }
            } catch(e) {}
        }
    };

})();
