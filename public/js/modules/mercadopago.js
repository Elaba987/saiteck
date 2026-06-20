// mercadopago.js - Integración con Mercado Pago Point (Orders API v1)
// Documentación: https://www.mercadopago.com.mx/developers/es/docs/mp-point
//
// Flujo:
//  1. GET  /terminals/v1/list         → obtener terminals disponibles
//  2. POST /v1/orders                 → crear order y enviarla a la terminal
//  3. GET  /v1/orders/:id             → polling para consultar estado
//  4. POST /v1/orders/:id/cancel      → cancelar order (si status=created)
//
// Estados posibles de la order:
//   created         → Order creada, esperando que la terminal la reciba
//   at_terminal     → Terminal la recibió, esperando pago del cliente
//   processed       → Pago exitoso
//   canceled        → Cancelada (por API o desde la terminal)
//   expired         → Expiró sin ser procesada
//   failed          → Error en el pago

export class MercadoPagoManager {
    constructor() {
        // URL de la Cloud Function proxy
        this._proxyUrl = 'https://us-central1-sistema-inventarios-1609c.cloudfunctions.net/mpPoint';

        this._orderActual    = null;   // { id, terminalId, monto, status, externalRef }
        this._pollingTimer   = null;
        this._onEstadoCambia = null;
    }

    // ─── CONFIGURACIÓN ────────────────────────────────────────────────────────

    setProxyUrl(url)       { this._proxyUrl = url; }
    setOnEstadoCambia(fn)  { this._onEstadoCambia = fn; }

    // ─── TERMINALES ───────────────────────────────────────────────────────────

    /**
     * Lista las terminals disponibles vinculadas a la cuenta MP.
     * @returns {Array} Lista de objetos terminal { id, pos_id, store_id, operating_mode }
     */
    async obtenerTerminalesMP() {
        try {
            const resp = await this._mp('GET', '/terminals/v1/list?limit=50&offset=0');
            return resp?.data?.terminals || [];
        } catch (err) {
            console.error('[MP] Error al obtener terminales:', err);
            return [];
        }
    }

    /**
     * Activa el modo PDV en una terminal.
     * @param {string} terminalId - ID de la terminal (ej: NEWLAND_N950__N950NCB801293324)
     */
    async activarModoPDV(terminalId) {
        try {
            const resp = await this._mp('PATCH', '/terminals/v1/setup', {
                terminals: [{ id: terminalId, operating_mode: 'PDV' }]
            });
            const terminal = resp?.terminals?.[0];
            return {
                success: terminal?.operating_mode === 'PDV',
                data: resp
            };
        } catch (err) {
            console.error('[MP] Error al activar modo PDV:', err);
            return { success: false, error: err.message };
        }
    }

    // ─── ORDERS ───────────────────────────────────────────────────────────────

    /**
     * Crea una order de pago y la envía a la terminal especificada.
     *
     * @param {string} terminalId   - ID de la terminal (campo id del listado)
     * @param {number} monto        - Monto en pesos MXN (ej: 150.50)
     * @param {string} descripcion  - Descripción del pago (máx 60 chars)
     * @returns {Object} { success, orderId, paymentId, estado, mensaje }
     */
    async crearOrder(terminalId, monto, descripcion = 'Venta') {
        if (!terminalId) return { success: false, mensaje: 'Terminal ID requerido' };
        if (!monto || monto <= 0) return { success: false, mensaje: 'Monto inválido' };

        const externalRef = `SAITECK_${Date.now()}`;
        const montoStr    = monto.toFixed(2);

        const body = {
            type:               'point',
            external_reference: externalRef,
            expiration_time:    'PT15M',   // 15 minutos
            transactions: {
                payments: [{ amount: montoStr }]
            },
            config: {
                point: {
                    terminal_id:      terminalId,
                    print_on_terminal: 'no_ticket'
                },
                payment_method: {
                    default_type: 'credit_card'
                }
            },
            description: descripcion.substring(0, 60)
        };

        const idempotencyKey = `SAITECK_ORD_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        try {
            const resp = await this._mp('POST', '/v1/orders', body, idempotencyKey);

            if (resp?.id) {
                const paymentId = resp?.transactions?.payments?.[0]?.id || null;

                this._orderActual = {
                    id:          resp.id,
                    paymentId,
                    terminalId,
                    monto,
                    externalRef,
                    status:      resp.status || 'created',
                    createdAt:   new Date().toISOString()
                };

                return {
                    success:   true,
                    orderId:   resp.id,
                    paymentId,
                    estado:    resp.status || 'created',
                    mensaje:   '✅ Order enviada a la terminal'
                };
            }

            return { success: false, mensaje: this._parsearError(resp) || 'Error al crear order' };

        } catch (err) {
            console.error('[MP] Error al crear order:', err);
            return { success: false, mensaje: this._mensajeAmigable(err) };
        }
    }

    /**
     * Obtiene el estado actual de una order.
     * @param {string} orderId - ID de la order
     */
    async obtenerEstadoOrder(orderId) {
        if (!orderId) return null;
        try {
            return await this._mp('GET', `/v1/orders/${orderId}`);
        } catch (err) {
            console.error('[MP] Error al consultar order:', err);
            return null;
        }
    }

    /**
     * Cancela una order (solo si su status es "created").
     * @param {string} orderId - ID de la order a cancelar
     */
    async cancelarOrder(orderId) {
        if (!orderId) return { success: false, mensaje: 'Order ID requerido' };

        const idempotencyKey = `SAITECK_CANCEL_${Date.now()}`;

        try {
            const resp = await this._mp('POST', `/v1/orders/${orderId}/cancel`, null, idempotencyKey);

            if (resp?.status === 'canceled' || resp?.success || resp?.noContent) {
                this._orderActual = null;
                this.detenerPolling();
                return { success: true, mensaje: 'Order cancelada correctamente' };
            }

            // Si la order ya estaba en at_terminal, no se puede cancelar por API
            if (resp?.status === 400 || (resp?.message || '').includes('at_terminal')) {
                return {
                    success: false,
                    mensaje: 'La order ya está en la terminal. Cancélala directamente desde el dispositivo.'
                };
            }

            return { success: false, mensaje: this._parsearError(resp) || 'No se pudo cancelar' };

        } catch (err) {
            console.error('[MP] Error al cancelar order:', err);
            return { success: false, mensaje: this._mensajeAmigable(err) };
        }
    }

    // ─── POLLING AUTOMÁTICO ───────────────────────────────────────────────────

    /**
     * Inicia polling para detectar cambios de estado en la order.
     * @param {string} orderId      - ID de la order a monitorear
     * @param {number} intervaloMs  - Intervalo entre consultas (default 4s)
     */
    iniciarPolling(orderId, intervaloMs = 4000) {
        this.detenerPolling();

        this._pollingTimer = setInterval(async () => {
            const resp = await this.obtenerEstadoOrder(orderId);
            if (!resp) return;

            const estadoAnterior = this._orderActual?.status;
            const estadoNuevo    = resp.status;

            if (estadoNuevo && estadoNuevo !== estadoAnterior) {
                if (this._orderActual) this._orderActual.status = estadoNuevo;
                if (this._onEstadoCambia) this._onEstadoCambia(estadoNuevo, resp);
            }

            // Detener polling en estados terminales
            if (['processed', 'canceled', 'expired', 'failed'].includes(estadoNuevo)) {
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

    obtenerOrderActual()    { return this._orderActual; }

    limpiarOrderActual() {
        this._orderActual = null;
        this.detenerPolling();
    }

    // ─── DESCRIPCIÓN DE ESTADOS ───────────────────────────────────────────────

    /**
     * Retorna texto, ícono y color para cada estado de la order.
     * @param {string} estado
     */
    describirEstado(estado) {
        const estados = {
            'created':         { texto: 'Enviando a terminal...',       icono: '📡', color: '#718096' },
            'at_terminal':     { texto: 'Esperando pago en terminal',   icono: '💳', color: '#ed8936' },
            'processed':       { texto: 'Pago exitoso',                 icono: '✅', color: '#48bb78' },
            'canceled':        { texto: 'Pago cancelado',               icono: '❌', color: '#f56565' },
            'expired':         { texto: 'Order expirada',               icono: '⏱️', color: '#f56565' },
            'failed':          { texto: 'Error en el pago',             icono: '⚠️', color: '#f56565' },
            'action_required': { texto: 'Se requiere acción en terminal',icono:'👆', color: '#ed8936' }
        };
        return estados[estado] || { texto: estado || 'Desconocido', icono: '❓', color: '#718096' };
    }

    // ─── PROXY INTERNO ────────────────────────────────────────────────────────

    /**
     * Envía una petición a la Cloud Function proxy.
     * El Firebase ID Token se verifica en el servidor antes de llamar a MP.
     */
    async _mp(method, path, body = null, idempotencyKey = null) {
        const currentUser = window.auth?.currentUser;
        if (!currentUser) throw new Error('Usuario no autenticado en Firebase');

        const idToken = await currentUser.getIdToken();
        const iKey    = idempotencyKey || `SAITECK_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const resp = await fetch(this._proxyUrl, {
            method:  'POST',
            headers: {
                'Content-Type':      'application/json',
                'Authorization':     `Bearer ${idToken}`,
                'X-Idempotency-Key': iKey
            },
            body: JSON.stringify({ method, path, body, idempotencyKey: iKey })
        });

        if (resp.status === 204) return { success: true, noContent: true };

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            const err  = new Error(data?.message || data?.error || `HTTP ${resp.status}`);
            err.status = resp.status;
            err.data   = data;
            throw err;
        }

        return data;
    }

    // ─── MENSAJES DE ERROR ────────────────────────────────────────────────────

    _mensajeAmigable(err) {
        const status = err.status;
        const msg    = err.message || '';

        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            return 'Sin conexión a internet o la Cloud Function no responde.';
        }

        const tabla = {
            400: this._parsearError(err.data) || `Solicitud inválida: ${msg}`,
            401: 'No autorizado. Vuelve a iniciar sesión.',
            403: 'Sin permisos para usar la API de Point. Verifica tu cuenta de Mercado Pago.',
            404: 'Recurso no encontrado. Verifica el ID de la terminal o la order.',
            409: 'Conflicto: ya existe una order activa para esa terminal.',
            422: `Datos inválidos: ${msg}`,
            500: 'Error interno. Intenta de nuevo en unos momentos.'
        };

        return tabla[status] || `Error ${status || ''}: ${msg}`;
    }

    _parsearError(data) {
        if (!data) return '';
        const msg = data.message || data.error || data.cause?.[0]?.description || '';
        return msg;
    }
}