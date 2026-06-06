// mercadopago.js - Integración con Mercado Pago Point Smart 2
// API: Point Payment Intent (sandbox)

export class MercadoPagoManager {
    constructor() {
        // ── Credenciales ──
        // IMPORTANTE: En producción estas deben venir de Firestore o de un backend seguro.
        // Para sandbox usa las credenciales de prueba de tu cuenta de desarrollador.
        this._accessToken = 'APP_USR-1092455173337722-060523-1e9533e9a8dd66757579f5f653dd74f1-3452805753';
        this._publicKey   = 'APP_USR-07ab26ca-bf15-484a-bbdc-8750f579e7d8';

        // Base URL del proxy CORS. La API de MP Point no acepta llamadas directas
        // desde el navegador (CORS bloqueado). Usamos un proxy público para sandbox.
        // En producción esto DEBE ser tu propio backend.
        this._baseUrl = 'https://corsproxy.io/?';
        this._mpUrl   = 'https://api.mercadopago.com';

        // Estado del último intent creado
        this._intentActual = null;
        this._pollingTimer = null;

        // Callback que se llama cuando cambia el estado del intent
        this._onEstadoCambia = null;
    }

    // ─── CONFIGURACIÓN ────────────────────────────────────────────────────

    setAccessToken(token)    { this._accessToken = token; }
    setOnEstadoCambia(fn)    { this._onEstadoCambia = fn; }

    // ─── TERMINALES ───────────────────────────────────────────────────────

    /**
     * Obtiene la lista de terminales Point registradas en la cuenta MP.
     * Útil para verificar que el Device ID es correcto.
     */
    async obtenerTerminalesMP() {
        try {
            const url = `${this._mpUrl}/point/integration-api/devices`;
            const resp = await this._fetch(url);
            return resp?.devices || [];
        } catch (err) {
            console.error('[MP] Error al obtener terminales:', err);
            return [];
        }
    }

    // ─── PAYMENT INTENT ───────────────────────────────────────────────────

    /**
     * Crea un Payment Intent y lo envía a la terminal.
     * La terminal mostrará automáticamente la pantalla de cobro.
     *
     * @param {string} deviceId   - Device ID de la terminal (ej: "PAX_A920__SMARTPOS123456")
     * @param {number} monto      - Monto en pesos MXN (ej: 150.50)
     * @param {string} descripcion- Descripción visible en la terminal
     * @returns {object} { success, intentId, estado, mensaje }
     */
    async crearPaymentIntent(deviceId, monto, descripcion = 'Venta') {
        if (!deviceId) return { success: false, mensaje: 'Device ID requerido' };
        if (!monto || monto <= 0) return { success: false, mensaje: 'Monto inválido' };

        // MP Point requiere el monto en CENTAVOS (entero)
        const montoEnCentavos = Math.round(monto * 100);

        const body = {
            amount:      montoEnCentavos,
            description: descripcion.substring(0, 60), // máx 60 chars
            payment: {
                installments:      1,
                type:              'credit_card',  // acepta crédito y débito
                installments_cost: 'seller'
            },
            additional_info: {
                external_reference: `SAITECK_${Date.now()}`
            }
        };

        try {
            const url  = `${this._mpUrl}/point/integration-api/devices/${deviceId}/payment-intents`;
            const resp = await this._fetch(url, 'POST', body);

            if (resp?.id) {
                this._intentActual = {
                    id:       resp.id,
                    deviceId,
                    monto,
                    estado:   resp.state || 'OPEN',
                    createdAt: new Date().toISOString()
                };

                return {
                    success:  true,
                    intentId: resp.id,
                    estado:   resp.state || 'OPEN',
                    mensaje:  '✅ Solicitud enviada a la terminal'
                };
            }

            // Error de la API de MP
            const mensajeError = this._parsearErrorMP(resp);
            return { success: false, mensaje: mensajeError };

        } catch (err) {
            console.error('[MP] Error al crear Payment Intent:', err);

            // Manejo específico de errores CORS (en desarrollo sin backend)
            if (err.message?.includes('CORS') || err.message?.includes('Failed to fetch')) {
                return {
                    success: false,
                    mensaje: 'Error de conexión con Mercado Pago. Verifica tu conexión a internet.',
                    esCORS: true
                };
            }

            return {
                success: false,
                mensaje: `Error de conexión: ${err.message}`
            };
        }
    }

    /**
     * Consulta el estado actual de un Payment Intent.
     * Estados posibles: OPEN, ON_TERMINAL, PROCESSING, PROCESSED, CANCELED, ERROR
     */
    async consultarEstadoIntent(deviceId, intentId) {
        if (!intentId || !deviceId) return null;

        try {
            const url  = `${this._mpUrl}/point/integration-api/devices/${deviceId}/payment-intents/${intentId}`;
            const resp = await this._fetch(url);
            return resp;
        } catch (err) {
            console.error('[MP] Error al consultar intent:', err);
            return null;
        }
    }

    /**
     * Cancela un Payment Intent activo en la terminal.
     */
    async cancelarIntent(deviceId, intentId) {
        if (!intentId || !deviceId) return { success: false, mensaje: 'Datos incompletos' };

        try {
            const url  = `${this._mpUrl}/point/integration-api/devices/${deviceId}/payment-intents/${intentId}`;
            const resp = await this._fetch(url, 'DELETE');

            if (resp?.id || resp?.message === 'The payment intent has been cancelled') {
                this._intentActual = null;
                this.detenerPolling();
                return { success: true, mensaje: 'Cobro cancelado en la terminal' };
            }

            return { success: false, mensaje: 'No se pudo cancelar el cobro' };
        } catch (err) {
            console.error('[MP] Error al cancelar intent:', err);
            return { success: false, mensaje: `Error: ${err.message}` };
        }
    }

    // ─── POLLING AUTOMÁTICO ───────────────────────────────────────────────

    /**
     * Inicia polling para detectar cuando la terminal procesa el pago.
     * Llama a this._onEstadoCambia(estado, resp) cuando cambia el estado.
     * @param {number} intervaloMs - Intervalo entre consultas (default: 4s)
     */
    iniciarPolling(deviceId, intentId, intervaloMs = 4000) {
        this.detenerPolling();

        this._pollingTimer = setInterval(async () => {
            const resp = await this.consultarEstadoIntent(deviceId, intentId);
            if (!resp) return;

            const estadoAnterior = this._intentActual?.estado;
            const estadoNuevo    = resp.state;

            if (estadoNuevo !== estadoAnterior) {
                if (this._intentActual) this._intentActual.estado = estadoNuevo;
                if (this._onEstadoCambia) this._onEstadoCambia(estadoNuevo, resp);
            }

            // Detener polling en estados terminales
            if (['PROCESSED', 'CANCELED', 'ERROR'].includes(estadoNuevo)) {
                this.detenerPolling();
            }

        }, intervaloMs);
    }

    detenerPolling() {
        if (this._pollingTimer) {
            clearInterval(this._pollingTimer);
            this._pollingTimer = null;
        }
    }

    obtenerIntentActual() { return this._intentActual; }

    limpiarIntentActual() {
        this._intentActual = null;
        this.detenerPolling();
    }

    // ─── DESCRIPCIÓN DE ESTADOS ───────────────────────────────────────────

    describirEstado(estado) {
        const estados = {
            'OPEN':        { texto: 'Enviando a terminal...',       icono: '📡', color: '#718096' },
            'ON_TERMINAL': { texto: 'Esperando pago en terminal',   icono: '💳', color: '#ed8936' },
            'PROCESSING':  { texto: 'Procesando pago...',           icono: '⏳', color: '#667eea' },
            'PROCESSED':   { texto: 'Pago exitoso',                 icono: '✅', color: '#48bb78' },
            'CANCELED':    { texto: 'Cobro cancelado',              icono: '❌', color: '#f56565' },
            'ERROR':       { texto: 'Error en el cobro',            icono: '⚠️', color: '#f56565' }
        };
        return estados[estado] || { texto: estado, icono: '❓', color: '#718096' };
    }

    // ─── UTILIDADES INTERNAS ──────────────────────────────────────────────

    async _fetch(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this._accessToken}`,
                'Content-Type':  'application/json',
                'X-Idempotency-Key': `SAITECK_${Date.now()}_${Math.random().toString(36).slice(2)}`
            }
        };

        if (body) options.body = JSON.stringify(body);

        // Intentar llamada directa primero (funciona en algunos entornos)
        let resp;
        try {
            resp = await fetch(url, options);
        } catch (_) {
            // Fallback: usar proxy CORS
            const proxiedUrl = `${this._baseUrl}${encodeURIComponent(url)}`;
            resp = await fetch(proxiedUrl, options);
        }

        // 204 No Content (DELETE exitoso)
        if (resp.status === 204) return { deleted: true };

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            const err = new Error(data?.message || data?.error || `HTTP ${resp.status}`);
            err.status = resp.status;
            err.data   = data;
            throw err;
        }

        return data;
    }

    _parsearErrorMP(resp) {
        if (!resp) return 'Error desconocido de Mercado Pago';

        const cod = resp?.error || resp?.cause?.[0]?.code || '';
        const msg = resp?.message || '';

        const mensajes = {
            '4002':                      'El Device ID no existe o no está activo en tu cuenta de MP.',
            '4003':                      'Ya hay un cobro activo en la terminal. Cancélalo primero.',
            '4004':                      'La terminal no está disponible en este momento.',
            'device_id_not_found':       'Terminal no encontrada. Verifica el Device ID.',
            'payment_intent_in_process': 'Ya hay un cobro en proceso en la terminal.',
            '400':                       `Solicitud inválida: ${msg}`,
            '401':                       'Access Token inválido. Verifica tus credenciales de MP.',
            '403':                       'Sin permisos. Verifica que el Access Token tenga permisos de Point.',
            '404':                       'Recurso no encontrado en Mercado Pago.',
            '500':                       'Error interno de Mercado Pago. Intenta de nuevo.'
        };

        return mensajes[cod] || mensajes[String(resp.status)] || msg || 'Error de Mercado Pago';
    }
}