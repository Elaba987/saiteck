// mercadopago.js - Integración con Mercado Pago Point Smart 2
// Todas las llamadas pasan por la Cloud Function "mpPoint" para evitar CORS.

export class MercadoPagoManager {
    constructor() {
        // URL de la Cloud Function desplegada.
        // En desarrollo local con el emulador usa: http://localhost:5001/TU_PROYECTO/us-central1/mpPoint
        // En producción Firebase la asigna automáticamente:
        //   https://us-central1-TU_PROYECTO.cloudfunctions.net/mpPoint
        this._proxyUrl = 'https://us-central1-sistema-inventarios-1609c.cloudfunctions.net/mpPoint';

        this._intentActual   = null;
        this._pollingTimer   = null;
        this._onEstadoCambia = null;
    }

    // ─── CONFIGURACIÓN ────────────────────────────────────────────────────

    setProxyUrl(url)       { this._proxyUrl = url; }
    setOnEstadoCambia(fn)  { this._onEstadoCambia = fn; }

    // ─── TERMINALES ───────────────────────────────────────────────────────

    async obtenerTerminalesMP() {
        try {
            const resp = await this._mp('GET', '/point/integration-api/devices');
            return resp?.devices || [];
        } catch (err) {
            console.error('[MP] Error al obtener terminales:', err);
            return [];
        }
    }

    // ─── PAYMENT INTENT ───────────────────────────────────────────────────

    /**
     * Crea un Payment Intent y lo envía a la terminal.
     *
     * @param {string} deviceId    - Device ID de la terminal
     * @param {number} monto       - Monto en pesos MXN (ej: 150.50)
     * @param {string} descripcion - Descripción visible en la terminal (máx 60 chars)
     */
    async crearPaymentIntent(deviceId, monto, descripcion = 'Venta') {
        if (!deviceId) return { success: false, mensaje: 'Device ID requerido' };
        if (!monto || monto <= 0) return { success: false, mensaje: 'Monto inválido' };

        const deviceIdLimpio  = deviceId.trim();
        const montoEnCentavos = Math.round(monto * 100);

        const body = {
            amount:      montoEnCentavos,
            description: descripcion.substring(0, 60),
            payment: {
                installments: 1
            },
            additional_info: {
                external_reference: `SAITECK_${Date.now()}`
            }
        };

        try {
            const resp = await this._mp(
                'POST',
                `/point/integration-api/devices/${encodeURIComponent(deviceIdLimpio)}/payment-intents`,
                body
            );

            if (resp?.id) {
                this._intentActual = {
                    id:        resp.id,
                    deviceId:  deviceIdLimpio,
                    monto,
                    estado:    resp.state || 'OPEN',
                    createdAt: new Date().toISOString()
                };

                return {
                    success:  true,
                    intentId: resp.id,
                    estado:   resp.state || 'OPEN',
                    mensaje:  '✅ Solicitud enviada a la terminal'
                };
            }

            return { success: false, mensaje: this._parsearErrorMP(resp) };

        } catch (err) {
            console.error('[MP] Error al crear Payment Intent:', err);
            return { success: false, mensaje: this._mensajeAmigable(err) };
        }
    }

    /**
     * Consulta el estado de un Payment Intent.
     * Estados posibles: OPEN, ON_TERMINAL, PROCESSING, PROCESSED, CANCELED, ERROR
     */
    async consultarEstadoIntent(deviceId, intentId) {
        if (!intentId || !deviceId) return null;
        try {
            return await this._mp(
                'GET',
                `/point/integration-api/devices/${encodeURIComponent(deviceId.trim())}/payment-intents/${intentId}`
            );
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
            const resp = await this._mp(
                'DELETE',
                `/point/integration-api/devices/${encodeURIComponent(deviceId.trim())}/payment-intents/${intentId}`
            );

            if (resp?.deleted || resp?.id || resp?.message?.includes('cancelled')) {
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

    iniciarPolling(deviceId, intentId, intervaloMs = 4000) {
        this.detenerPolling();

        this._pollingTimer = setInterval(async () => {
            const resp = await this.consultarEstadoIntent(deviceId, intentId);
            if (!resp) return;

            const estadoAnterior = this._intentActual?.estado;
            const estadoNuevo    = resp.state;

            if (estadoNuevo && estadoNuevo !== estadoAnterior) {
                if (this._intentActual) this._intentActual.estado = estadoNuevo;
                if (this._onEstadoCambia) this._onEstadoCambia(estadoNuevo, resp);
            }

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
            'OPEN':        { texto: 'Enviando a terminal...',     icono: '📡', color: '#718096' },
            'ON_TERMINAL': { texto: 'Esperando pago en terminal', icono: '💳', color: '#ed8936' },
            'PROCESSING':  { texto: 'Procesando pago...',         icono: '⏳', color: '#667eea' },
            'PROCESSED':   { texto: 'Pago exitoso',               icono: '✅', color: '#48bb78' },
            'CANCELED':    { texto: 'Cobro cancelado',            icono: '❌', color: '#f56565' },
            'ERROR':       { texto: 'Error en el cobro',          icono: '⚠️', color: '#f56565' }
        };
        return estados[estado] || { texto: estado, icono: '❓', color: '#718096' };
    }

    // ─── PROXY INTERNO ────────────────────────────────────────────────────

    /**
     * Envía una petición a la Cloud Function proxy.
     * La función verifica el Firebase ID Token antes de llamar a MP,
     * por lo que el Access Token de MP nunca sale del servidor.
     *
     * @param {string} method  - GET | POST | DELETE
     * @param {string} path    - Path de la API de MP (ej: /point/integration-api/devices/...)
     * @param {object} [body]  - Body para POST
     */
    async _mp(method, path, body = null) {
        // Obtener el Firebase ID Token del usuario autenticado
        const currentUser = window.auth?.currentUser;
        if (!currentUser) throw new Error('Usuario no autenticado en Firebase');

        const idToken = await currentUser.getIdToken();

        const idempotencyKey = `SAITECK_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const resp = await fetch(this._proxyUrl, {
            method:  'POST',
            headers: {
                'Content-Type':      'application/json',
                'Authorization':     `Bearer ${idToken}`,
                'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({ method, path, body, idempotencyKey })
        });

        // 204 sin body
        if (resp.status === 204) return { deleted: true };

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            const err  = new Error(data?.message || data?.error || `HTTP ${resp.status}`);
            err.status = resp.status;
            err.data   = data;
            throw err;
        }

        return data;
    }

    // ─── MENSAJES DE ERROR ────────────────────────────────────────────────

    _mensajeAmigable(err) {
        const status = err.status;
        const data   = err.data || {};
        const msg    = err.message || '';

        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            return 'Sin conexión a internet o la Cloud Function no responde. Verifica tu red.';
        }

        const tabla = {
            400: this._parsearErrorMP(data) || `Solicitud inválida: ${msg}`,
            401: 'No autorizado. Vuelve a iniciar sesión.',
            403: 'Sin permisos para usar la API de Point. Verifica tu cuenta de Mercado Pago.',
            404: 'Terminal no encontrada. Verifica que el Device ID esté bien escrito y que la terminal esté activa en tu cuenta de MP.',
            409: 'Ya hay un cobro activo en esa terminal. Cancélalo desde la terminal o espera a que finalice.',
            422: `Datos inválidos: ${msg}`,
            500: 'Error interno. Intenta de nuevo en unos momentos.'
        };

        return tabla[status] || `Error ${status || ''}: ${msg}`;
    }

    _parsearErrorMP(data) {
        if (!data) return '';
        const cod = data.error || data.cause?.[0]?.code || '';
        const msg = data.message || '';
        const tabla = {
            '4002':                      'El Device ID no existe o no está activo en tu cuenta de MP.',
            '4003':                      'Ya hay un cobro activo en esa terminal. Cancélalo primero.',
            '4004':                      'La terminal no está disponible ahora. Verifica que esté encendida y conectada.',
            'device_id_not_found':       'Terminal no encontrada. Verifica el Device ID.',
            'payment_intent_in_process': 'Ya hay un cobro en proceso en esa terminal.'
        };
        return tabla[String(cod)] || msg || '';
    }
}