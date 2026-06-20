// auditoria.js - Módulo para registro de auditoría de operaciones CRUD

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE TIPOS DE OPERACIÓN
// ─────────────────────────────────────────────────────────────────────────────
export const TIPOS_OPERACION = {
    // ── Productos ──
    PRODUCTO_CREAR:             { label: 'Creó producto',                  icono: '📦➕', categoria: 'Productos' },
    PRODUCTO_EDITAR:            { label: 'Editó producto',                 icono: '📦✏️', categoria: 'Productos' },
    PRODUCTO_EDITAR_PRECIO:     { label: 'Modificó precio de producto',    icono: '💲✏️', categoria: 'Productos' },
    PRODUCTO_EDITAR_STOCK:      { label: 'Modificó stock de producto',     icono: '📊✏️', categoria: 'Productos' },
    PRODUCTO_ELIMINAR:          { label: 'Eliminó producto',               icono: '📦🗑️', categoria: 'Productos' },
    PRODUCTO_STOCK_REDUCIDO:    { label: 'Stock reducido por venta',       icono: '📉',   categoria: 'Productos' },

    // ── Ventas ──
    VENTA_CREAR:                { label: 'Realizó venta',                  icono: '💰✅', categoria: 'Ventas' },
    VENTA_TICKET_DESCARGADO:    { label: 'Descargó ticket de venta',       icono: '🎫📥', categoria: 'Ventas' },

    // ── Pagos con tarjeta (Mercado Pago Orders API) ──
    PAGO_TARJETA_INICIADO:      { label: 'Inició cobro con tarjeta',       icono: '💳📡', categoria: 'Ventas' },
    PAGO_TARJETA_CONFIRMADO:    { label: 'Confirmó pago con tarjeta',      icono: '💳✅', categoria: 'Ventas' },
    PAGO_TARJETA_CANCELADO:     { label: 'Canceló cobro con tarjeta',      icono: '💳❌', categoria: 'Ventas' },
    PAGO_TARJETA_EXPIRADO:      { label: 'Order de pago expirada',         icono: '💳⏱️', categoria: 'Ventas' },
    PAGO_TARJETA_FALLIDO:       { label: 'Pago con tarjeta fallido',       icono: '💳⚠️', categoria: 'Ventas' },

    // ── Proveedores ──
    PROVEEDOR_CREAR:            { label: 'Creó proveedor',                 icono: '🚚➕', categoria: 'Proveedores' },
    PROVEEDOR_EDITAR:           { label: 'Editó proveedor',                icono: '🚚✏️', categoria: 'Proveedores' },
    PROVEEDOR_ELIMINAR:         { label: 'Eliminó proveedor',              icono: '🚚🗑️', categoria: 'Proveedores' },
    PROVEEDOR_VISITA_MARCADA:   { label: 'Marcó proveedor como visitado',  icono: '✅🚚', categoria: 'Proveedores' },
    PROVEEDOR_VISITA_PROGRAMADA:{ label: 'Programó visita de proveedor',   icono: '📅🚚', categoria: 'Proveedores' },

    // ── Pedidos ──
    PEDIDO_CREAR:               { label: 'Creó pedido',                    icono: '🛒➕', categoria: 'Pedidos' },
    PEDIDO_COMPLETAR:           { label: 'Completó pedido',                icono: '🛒✅', categoria: 'Pedidos' },
    PEDIDO_ELIMINAR:            { label: 'Eliminó pedido',                 icono: '🛒🗑️', categoria: 'Pedidos' },

    // ── Terminales Mercado Pago ──
    TERMINAL_CREAR:             { label: 'Registró terminal MP',           icono: '🖥️➕', categoria: 'Terminales' },
    TERMINAL_EDITAR:            { label: 'Editó terminal MP',              icono: '🖥️✏️', categoria: 'Terminales' },
    TERMINAL_ELIMINAR:          { label: 'Eliminó terminal MP',            icono: '🖥️🗑️', categoria: 'Terminales' },
    TERMINAL_PDV_ACTIVADO:      { label: 'Activó modo PDV en terminal',    icono: '🖥️✅', categoria: 'Terminales' },

    // ── Usuarios / Perfiles ──
    USUARIO_CREAR:              { label: 'Creó usuario',                   icono: '👤➕', categoria: 'Usuarios' },
    USUARIO_EDITAR:             { label: 'Editó usuario',                  icono: '👤✏️', categoria: 'Usuarios' },
    USUARIO_ELIMINAR:           { label: 'Eliminó usuario',                icono: '👤🗑️', categoria: 'Usuarios' },
    USUARIO_NIP_CAMBIO:         { label: 'Cambió NIP de usuario',          icono: '🔒✏️', categoria: 'Usuarios' },
    SESION_INICIO:              { label: 'Inició sesión de perfil',        icono: '🔑✅', categoria: 'Sesión' },
    SESION_CIERRE:              { label: 'Cerró sesión de perfil',         icono: '🔑🚪', categoria: 'Sesión' },

    // ── Configuración ──
    CONFIG_COLORES:             { label: 'Cambió colores de la interfaz',  icono: '🎨✏️', categoria: 'Configuración' },
    CONFIG_COLORES_RESET:       { label: 'Restableció colores predeterminados', icono: '🎨↩️', categoria: 'Configuración' },
    CONFIG_META_VENTAS:         { label: 'Cambió meta de ventas diaria',   icono: '🎯✏️', categoria: 'Configuración' },
};

// Lista de categorías únicas (para filtros en la UI)
export const CATEGORIAS_OPERACION = [
    'Productos', 'Ventas', 'Proveedores', 'Pedidos', 'Terminales', 'Usuarios', 'Sesión', 'Configuración'
];

// ─────────────────────────────────────────────────────────────────────────────
export class AuditoriaManager {
    constructor() {
        this.registros   = [];
        this.unsubscribe = null;
        this._habilitado = true;
    }

    // ─── NÚCLEO: REGISTRAR UNA OPERACIÓN ──────────────────────────────────

    async registrar(tipo, detalles = {}, usuario = null) {
        if (!this._habilitado) return;
        if (!window.currentUser) return;

        const tipoInfo = TIPOS_OPERACION[tipo];
        if (!tipoInfo) {
            console.warn(`[Auditoría] Tipo desconocido: ${tipo}`);
            return;
        }

        const u = usuario
            || window.appInstance?.usuariosManager?.obtenerUsuarioActual?.()
            || null;

        const registro = {
            tipo,
            label:     tipoInfo.label,
            icono:     tipoInfo.icono,
            categoria: tipoInfo.categoria,
            detalles,
            usuario: u
                ? { id: u.id, nombre: u.nombre, rol: u.rol }
                : { id: 'system', nombre: 'Sistema', rol: 'sistema' },
            fecha: new Date().toISOString()
        };

        try {
            await window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('auditoria')
                .add({
                    ...registro,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (err) {
            console.error('[Auditoría] Error al registrar:', err);
        }
    }

    // ─── CARGA Y ESCUCHA ──────────────────────────────────────────────────

    async cargarRegistros(opciones = {}) {
        if (!window.currentUser) return [];

        try {
            let query = window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('auditoria')
                .orderBy('createdAt', 'desc')
                .limit(opciones.limite || 1000);

            const snapshot = await query.get();
            this.registros = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                fecha: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().fecha
            }));

            return this.registros;
        } catch (err) {
            console.error('[Auditoría] Error al cargar registros:', err);
            return [];
        }
    }

    iniciarEscucha(callback) {
        if (!window.currentUser) return () => {};

        try {
            const ref = window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('auditoria')
                .orderBy('createdAt', 'desc')
                .limit(1000);

            this.unsubscribe = ref.onSnapshot(snapshot => {
                this.registros = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    fecha: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().fecha
                }));
                if (callback) callback(this.registros);
            }, err => {
                console.error('[Auditoría] Error en snapshot:', err);
            });

            return this.unsubscribe;
        } catch (err) {
            console.error('[Auditoría] Error al iniciar escucha:', err);
            return () => {};
        }
    }

    detenerEscucha() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    obtenerTodos() { return this.registros; }

    // ─── FILTROS ──────────────────────────────────────────────────────────

    filtrar(filtros = {}) {
        let resultado = [...this.registros];
        const ahora   = new Date();

        if (filtros.periodo === 'dia') {
            resultado = resultado.filter(r =>
                new Date(r.fecha).toDateString() === ahora.toDateString()
            );
        } else if (filtros.periodo === 'semana') {
            const hace7 = new Date(ahora);
            hace7.setDate(ahora.getDate() - 7);
            resultado = resultado.filter(r => new Date(r.fecha) >= hace7);
        } else if (filtros.periodo === 'mes') {
            resultado = resultado.filter(r => {
                const f = new Date(r.fecha);
                return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
            });
        } else if (filtros.periodo === 'año') {
            resultado = resultado.filter(r =>
                new Date(r.fecha).getFullYear() === ahora.getFullYear()
            );
        } else if (filtros.periodo === 'fecha' && filtros.fechaEspecifica) {
            const objetivo = new Date(filtros.fechaEspecifica + 'T00:00:00');
            resultado = resultado.filter(r =>
                new Date(r.fecha).toDateString() === objetivo.toDateString()
            );
        } else if (filtros.periodo === 'rango' && filtros.fechaInicio && filtros.fechaFin) {
            const ini = new Date(filtros.fechaInicio + 'T00:00:00');
            const fin = new Date(filtros.fechaFin   + 'T23:59:59');
            resultado = resultado.filter(r => {
                const f = new Date(r.fecha);
                return f >= ini && f <= fin;
            });
        }

        if (filtros.categorias?.length > 0) {
            resultado = resultado.filter(r => filtros.categorias.includes(r.categoria));
        }

        if (filtros.tipos?.length > 0) {
            resultado = resultado.filter(r => filtros.tipos.includes(r.tipo));
        }

        if (filtros.usuarioId) {
            resultado = resultado.filter(r => r.usuario?.id === filtros.usuarioId);
        }

        return resultado;
    }

    // ─── ESTADÍSTICAS ─────────────────────────────────────────────────────

    generarEstadisticas(registros) {
        const stats = {
            total: registros.length,
            porCategoria:   {},
            porUsuario:     {},
            porDia:         {},
            topOperaciones: []
        };

        const contadorTipos = {};

        registros.forEach(r => {
            stats.porCategoria[r.categoria] = (stats.porCategoria[r.categoria] || 0) + 1;
            const uNombre = r.usuario?.nombre || 'Sistema';
            stats.porUsuario[uNombre] = (stats.porUsuario[uNombre] || 0) + 1;
            const dia = new Date(r.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
            stats.porDia[dia] = (stats.porDia[dia] || 0) + 1;
            contadorTipos[r.tipo] = (contadorTipos[r.tipo] || 0) + 1;
        });

        stats.topOperaciones = Object.entries(contadorTipos)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tipo, count]) => ({
                tipo,
                label: TIPOS_OPERACION[tipo]?.label || tipo,
                icono: TIPOS_OPERACION[tipo]?.icono || '⚙️',
                count
            }));

        return stats;
    }

    // ─── EXPORTAR CSV ─────────────────────────────────────────────────────

    exportarCSV(registros) {
        const encabezado = ['Fecha', 'Hora', 'Usuario', 'Rol', 'Categoria', 'Operacion', 'Detalles'];
        const filas = registros.map(r => {
            const fecha  = new Date(r.fecha);
            const detStr = Object.entries(r.detalles || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(' | ');
            return [
                fecha.toLocaleDateString('es-MX'),
                fecha.toLocaleTimeString('es-MX'),
                r.usuario?.nombre || 'Sistema',
                r.usuario?.rol    || '-',
                r.categoria,
                r.label,
                `"${detStr}"`
            ];
        });

        const contenido = [encabezado, ...filas].map(f => f.join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const hoy  = new Date();

        a.href     = url;
        a.download = `AUDITORIA_${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}