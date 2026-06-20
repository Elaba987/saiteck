// functions/index.js
// Proxy seguro para la API de Mercado Pago Point (Orders API v1)
// Despliega con: firebase deploy --only functions

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const https = require('https');

admin.initializeApp();

// Región donde se desplegará la función
setGlobalOptions({ region: 'us-central1' });

// Access Token de Mercado Pago (modo prueba)
// Para producción usa: firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN
const MP_TOKEN = () =>
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    'APP_USR-1092455173337722-060523-1e9533e9a8dd66757579f5f653dd74f1-3452805753';

// ─── Helper: llamada HTTPS a MP ───────────────────────────────────────────────
function mpRequest(method, path, body, idempotencyKey) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'api.mercadopago.com',
            port:     443,
            path,
            method,
            headers: {
                'Authorization':     `Bearer ${MP_TOKEN()}`,
                'Content-Type':      'application/json',
                'X-Idempotency-Key': idempotencyKey || `CF_${Date.now()}`
            }
        };

        if (bodyStr) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
                } catch (_) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN: mpPoint
// Proxy para la API de Mercado Pago Point (Orders API).
// El frontend envía: { method, path, body, idempotencyKey }
// La función verifica el Firebase ID Token antes de llamar a MP.
//
// Paths permitidos:
//   GET  /terminals/v1/list                    → Listar terminals
//   PATCH /terminals/v1/setup                  → Activar modo PDV
//   POST /v1/orders                            → Crear order de pago
//   GET  /v1/orders/:id                        → Obtener estado de order
//   POST /v1/orders/:id/cancel                 → Cancelar order
//   POST /v1/orders/:id/events                 → Simular evento (modo prueba)
// ═══════════════════════════════════════════════════════════════════════════════
exports.mpPoint = onRequest(
    {
        cors: true,
        region: 'us-central1'
    },
    async (req, res) => {

        // Preflight
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }

        // Verificar Firebase ID Token
        const authHeader = req.headers.authorization || '';
        const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!idToken) {
            res.status(401).json({ error: 'No autorizado' });
            return;
        }

        try {
            await admin.auth().verifyIdToken(idToken);
        } catch (_) {
            res.status(401).json({ error: 'Token de Firebase inválido' });
            return;
        }

        // Parámetros de la llamada a MP
        const { method = 'GET', path, body, idempotencyKey } = req.body;

        // Validar paths permitidos (terminales y orders)
        const allowedPaths = [
            /^\/terminals\/v1\/list(\?.*)?$/,
            /^\/terminals\/v1\/setup$/,
            /^\/v1\/orders$/,
            /^\/v1\/orders\/[A-Z0-9]+$/,
            /^\/v1\/orders\/[A-Z0-9]+\/cancel$/,
            /^\/v1\/orders\/[A-Z0-9]+\/events$/
        ];

        if (!path || !allowedPaths.some(r => r.test(path))) {
            res.status(400).json({ error: 'Path inválido o no permitido', path });
            return;
        }

        try {
            const result = await mpRequest(method.toUpperCase(), path, body, idempotencyKey);

            // 204 sin body
            if (result.status === 204) {
                res.status(200).json({ success: true, noContent: true });
                return;
            }

            res.status(result.status).json(result.body);
        } catch (err) {
            console.error('[mpPoint] Error:', err);
            res.status(500).json({ error: err.message });
        }
    }
);