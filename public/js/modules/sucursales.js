// sucursales.js - Módulo para gestión de sucursales (multi-tenant)
// Arquitectura: users/{uid}/sucursales/{sucursalId}/{coleccion}

export class SucursalesManager {
    constructor() {
        this.sucursales    = [];
        this.sucursalActual = null;  // { id, nombre, nip, ... }
        this.unsubscribe   = null;
    }

    // ─── COLECCIÓN BASE ──────────────────────────────────────────────────

    _colBase() {
        if (!window.currentUser) throw new Error('Usuario no autenticado');
        return window.db.collection('users').doc(window.currentUser.uid).collection('sucursales');
    }

    /** Retorna la referencia a una sub-colección DENTRO de una sucursal */
    getSubColeccion(sucursalId, coleccionNombre) {
        return this._colBase().doc(sucursalId).collection(coleccionNombre);
    }

    // ─── CARGA Y ESCUCHA ─────────────────────────────────────────────────

    async cargarSucursales() {
        try {
            const snap = await this._colBase().orderBy('createdAt', 'asc').get();
            this.sucursales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            return this.sucursales;
        } catch (err) {
            console.error('[Sucursales] Error al cargar:', err);
            return [];
        }
    }

    iniciarEscucha(callback) {
        try {
            this.unsubscribe = this._colBase()
                .orderBy('createdAt', 'asc')
                .onSnapshot(snap => {
                    this.sucursales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    if (callback) callback(this.sucursales);
                }, err => console.error('[Sucursales] Snapshot error:', err));
            return this.unsubscribe;
        } catch (err) {
            console.error('[Sucursales] Error al iniciar escucha:', err);
            return () => {};
        }
    }

    detenerEscucha() {
        if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    }

    obtenerTodas()   { return this.sucursales; }
    obtenerPorId(id) { return this.sucursales.find(s => s.id === id); }

    // ─── CRUD SUCURSALES ─────────────────────────────────────────────────

    async crear(datos) {
        const { nombre, nip } = datos;
        if (!nombre?.trim()) return { success: false, message: 'El nombre es obligatorio' };
        if (!/^\d{4}$/.test(nip))  return { success: false, message: 'El NIP debe ser de 4 dígitos' };

        if (this.sucursales.some(s => s.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
            return { success: false, message: 'Ya existe una sucursal con ese nombre' };
        }

        const nueva = {
            nombre:    nombre.trim(),
            nip,
            activa:    true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const ref = await this._colBase().add(nueva);
            // Inicializar estructura vacía con un documento marcador
            await this._colBase().doc(ref.id)
                .collection('_meta').doc('init')
                .set({ creadoEn: firebase.firestore.FieldValue.serverTimestamp() });

            return { success: true, message: 'Sucursal creada exitosamente', id: ref.id };
        } catch (err) {
            console.error('[Sucursales] Error al crear:', err);
            return { success: false, message: 'Error al crear sucursal' };
        }
    }

    async actualizar(id, datos) {
        const sucursal = this.obtenerPorId(id);
        if (!sucursal) return { success: false, message: 'Sucursal no encontrada' };

        if (datos.nombre) {
            const dup = this.sucursales.some(
                s => s.id !== id && s.nombre.toLowerCase() === datos.nombre.trim().toLowerCase()
            );
            if (dup) return { success: false, message: 'Ya existe otra sucursal con ese nombre' };
        }

        if (datos.nip && !/^\d{4}$/.test(datos.nip)) {
            return { success: false, message: 'El NIP debe ser de 4 dígitos' };
        }

        const actualizados = {
            ...(datos.nombre  && { nombre: datos.nombre.trim() }),
            ...(datos.nip     && { nip: datos.nip }),
            ...(datos.activa  !== undefined && { activa: Boolean(datos.activa) }),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await this._colBase().doc(id).update(actualizados);
            const idx = this.sucursales.findIndex(s => s.id === id);
            if (idx !== -1) this.sucursales[idx] = { ...this.sucursales[idx], ...actualizados };
            return { success: true, message: 'Sucursal actualizada' };
        } catch (err) {
            console.error('[Sucursales] Error al actualizar:', err);
            return { success: false, message: 'Error al actualizar sucursal' };
        }
    }

    async eliminar(id) {
        try {
            // Eliminar doc raíz (sub-colecciones deben eliminarse manualmente vía Cloud Functions
            // o en lotes, pero para proteger datos solo desactivamos)
            await this._colBase().doc(id).update({
                activa:    false,
                eliminada: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, message: 'Sucursal desactivada' };
        } catch (err) {
            console.error('[Sucursales] Error al eliminar:', err);
            return { success: false, message: 'Error al eliminar sucursal' };
        }
    }

    async toggleActiva(id) {
        const s = this.obtenerPorId(id);
        if (!s) return { success: false, message: 'Sucursal no encontrada' };
        return this.actualizar(id, { activa: !s.activa });
    }

    // ─── NIP ─────────────────────────────────────────────────────────────

    generarNIP() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    async verificarNIP(sucursalId, nip) {
        const s = this.obtenerPorId(sucursalId);
        return s ? s.nip === nip.toString() : false;
    }

    // ─── SESIÓN DE SUCURSAL ──────────────────────────────────────────────

    establecerSucursalActual(sucursal) {
        this.sucursalActual = sucursal;
        sessionStorage.setItem('sucursalActual', JSON.stringify(sucursal));
    }

    cargarSucursalDeSession() {
        const guardada = sessionStorage.getItem('sucursalActual');
        if (guardada) this.sucursalActual = JSON.parse(guardada);
        return this.sucursalActual;
    }

    cerrarSesionSucursal() {
        this.sucursalActual = null;
        sessionStorage.removeItem('sucursalActual');
    }

    obtenerSucursalActual() { return this.sucursalActual; }

    // ─── INICIALIZACIÓN AUTOMÁTICA ───────────────────────────────────────
    // Si no existen sucursales, crea la sucursal principal por defecto

    async inicializarSiVacio() {
        await this.cargarSucursales();
        const activas = this.sucursales.filter(s => !s.eliminada);
        if (activas.length === 0) {
            const nip = this.generarNIP();
            await this.crear({ nombre: 'Sucursal Principal', nip });
            await this.cargarSucursales();
        }
        return this.sucursales.filter(s => !s.eliminada);
    }

    // ─── ESTADÍSTICAS RÁPIDAS ─────────────────────────────────────────────

    async obtenerEstadisticasSucursal(sucursalId) {
        try {
            const hoy    = new Date();
            const hoyStr = hoy.toDateString();

            const [ventasSnap, productosSnap, proveedoresSnap] = await Promise.all([
                this.getSubColeccion(sucursalId, 'ventas')
                    .orderBy('updatedAt', 'desc').limit(500).get(),
                this.getSubColeccion(sucursalId, 'productos').get(),
                this.getSubColeccion(sucursalId, 'proveedores').get()
            ]);

            const ventas = ventasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const ventasHoy = ventas.filter(v => new Date(v.fecha).toDateString() === hoyStr);

            return {
                totalVentasHoy:   ventasHoy.reduce((s, v) => s + v.total, 0),
                cantidadVentas:   ventasHoy.length,
                totalProductos:   productosSnap.size,
                totalProveedores: proveedoresSnap.size
            };
        } catch (err) {
            console.error('[Sucursales] Error stats:', err);
            return { totalVentasHoy: 0, cantidadVentas: 0, totalProductos: 0, totalProveedores: 0 };
        }
    }
}