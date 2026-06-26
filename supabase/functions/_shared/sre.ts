// =================================================================================
// NexusSaaS - SRE Core Module
// Idempotency, DLQ, Telemetry (Sentry) and Alerts
// =================================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Helper to safely stringify objects
function safeStringify(obj: any) {
  try { return JSON.stringify(obj); } catch { return String(obj); }
}

export class NexusSRE {
  private supabase: any;
  private endpoint: string;
  private correlationId: string | null;

  constructor(supabaseClient: any, endpointName: string, req: Request, payload?: any) {
    this.supabase = supabaseClient;
    this.endpoint = endpointName;
    
    // Extract correlation_id
    this.correlationId = null;
    if (payload && payload.correlation_id) this.correlationId = payload.correlation_id;
    else if (req.headers.get('x-correlation-id')) this.correlationId = req.headers.get('x-correlation-id');
  }

  getCorrelationId() { return this.correlationId; }

  // 1. Check Idempotency (For Webhooks)
  // Returns true if safe to proceed, false if already processed
  async checkIdempotency(eventId: string, platform: string, webhookType: string, paymentId?: string): Promise<boolean> {
    if (!eventId) return true; // Se não tiver ID, assume que não é rastreável e continua
    
    const { data, error } = await this.supabase.rpc('check_idempotency', {
      p_event_id: eventId,
      p_platform: platform,
      p_webhook_type: webhookType,
      p_payment_id: paymentId,
      p_correlation_id: this.correlationId
    });

    if (error) {
      this.sendAlert('Falha na RPC de Idempotência', error.message);
      return true; // Na dúvida de erro do banco, falha aberto para não travar pagamentos legítimos, mas idealmente alertamos
    }
    
    return data === true; // 'data' is the boolean returned by the RPC
  }

  // 2. Dead Letter Queue
  async sendToDLQ(payload: any, errorMsg: string, errorObj?: any) {
    let stack = '';
    if (errorObj && errorObj.stack) stack = errorObj.stack;

    const { error } = await this.supabase.rpc('insert_dlq', {
      p_endpoint: this.endpoint,
      p_payload: payload,
      p_error_message: errorMsg,
      p_stack_trace: stack,
      p_correlation_id: this.correlationId
    });

    if (error) {
      console.error('[DLQ CRITICAL FAILURE]', error);
      this.sendAlert('FALHA CRÍTICA NA DLQ', `Não foi possível salvar na DLQ. Payload perdido: ${safeStringify(payload)}. Erro: ${error.message}`);
    } else {
      this.sendAlert('Evento retido na DLQ', `Endpoint ${this.endpoint} falhou e evento foi para DLQ. Erro: ${errorMsg}`);
    }
  }

  // 3. Alertas Críticos (Email/Webhook flexível)
  async sendAlert(title: string, message: string) {
    const alertUrl = Deno.env.get('ALERT_WEBHOOK_URL');
    const alertEmail = Deno.env.get('ALERT_EMAIL');
    const sentryDsn = Deno.env.get('SENTRY_DSN');

    const alertBody = `[${this.endpoint}] ${title}\nMsg: ${message}\nCorrelation: ${this.correlationId || 'N/A'}`;
    console.error(alertBody);

    // Enviar para Sentry (Simplificado)
    if (sentryDsn) {
      try {
        const sentryHost = sentryDsn.split('@')[1];
        const sentryKey = sentryDsn.split('//')[1].split('@')[0];
        const projectId = sentryHost.split('/')[1];
        const host = sentryHost.split('/')[0];
        
        await fetch(`https://${host}/api/${projectId}/store/`, {
          method: 'POST',
          headers: { 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${sentryKey}` },
          body: JSON.stringify({
            message: title,
            extra: { details: message, endpoint: this.endpoint, correlation_id: this.correlationId },
            level: 'error',
            platform: 'javascript'
          })
        }).catch(()=>null);
      } catch (e) {
        // fail silently
      }
    }

    // Enviar Webhook genérico (Discord/Slack/n8n)
    if (alertUrl) {
      await fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: alertBody, text: alertBody })
      }).catch(()=>null);
    }
  }
}
