// terminales.js - Módulo para gestión de terminales Mercado Pago Point
// Ahora soporta sincronización con la API de MP para obtener el terminal ID real.

import { StorageManager } from './storage.js';

export class TerminalesManager {
    constructor() {
        this.terminales  = [];
        this.unsubscribe = null;
        this._auditoria  = null;
    }

    setAuditoriaManager(mgr) { this._auditoria = mgr; }

    // ─── FIRESTORE ────────────────────────────────────────────────────────────

    async cargarTerminales() {
        this.terminales = await StorageManager.loadAll('terminales');
        return this.terminales;
    }

    iniciarEscucha(callback) {
        this.unsubscribe = StorageManager.onSnapshot('terminales', (terminales) => {
            this.terminales = terminales;
            if (callback) callback(terminales);
        });
    }

    detenerEscucha() {
        if (this.unsubscribe) this.unsubscribe();
    }

    // ─── ACCESO ───────────────────────────────────────────────────────────────

    obtenerTodas()          { return this.terminales; }
    obtenerActivas()        { return this.terminales.filter(t => t.activa); }
    obtenerPorId(id)        { return this.terminales.find(t => t.id === id); }
    obtenerPorTerminalId(tid){ return this.terminales.find(t => t.terminalId === tid); }

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    /**
     * Agrega una terminal manualmente.
     * El usuario registra: nombre + terminalId (obtenido desde la app MP o el PDF de integración).
     *
     * @param {Object} datos
     *   datos.nombre      - Nombre descriptivo (ej: "Caja 1")
     *   datos.terminalId  - ID de la terminal en MP (ej: "NEWLAND_N950__N950NCB801293324")
     */
    async agregar(datos) {
        const { nombre, terminalId } = datos;

        if (!nombre?.trim())     return { success: false, message: 'El nombre es obligatorio' };
        if (!terminalId?.trim()) return { success: false, message: 'El Terminal ID es obligatorio' };

        // Evitar Terminal IDs duplicados
        if (this.obtenerPorTerminalId(terminalId.trim())) {
            return { success: false, message: 'Ya existe una terminal con ese Terminal ID' };
        }

        const nueva = {
            nombre:       nombre.trim(),
            terminalId:   terminalId.trim(),
            activa:       true,
            fechaCreacion: new Date().toISOString()
        };

        const resultado = await StorageManager.add('terminales', nueva);

        if (resultado.success) {
            this._auditoria?.registrar('TERMINAL_CREAR', {
                nombre:     nueva.nombre,
                terminalId: nueva.terminalId
            });
            return { success: true, message: 'Terminal registrada correctamente', id: resultado.id };
        }

        return { success: false, message: 'Error al registrar la terminal' };
    }

    async actualizar(id, datos) {
        const terminal = this.obtenerPorId(id);
        if (!terminal) return { success: false, message: 'Terminal no encontrada' };

        const { nombre, terminalId, activa } = datos;

        if (nombre !== undefined && !nombre.trim()) {
            return { success: false, message: 'El nombre no puede estar vacío' };
        }

        // Validar que el nuevo terminalId no esté en uso por otra terminal
        if (terminalId && terminalId.trim() !== terminal.terminalId) {
            if (this.obtenerPorTerminalId(terminalId.trim())) {
                return { success: false, message: 'Ese Terminal ID ya está en uso por otra terminal' };
            }
        }

        const datosActualizados = {};
        if (nombre     !== undefined) datosActualizados.nombre     = nombre.trim();
        if (terminalId !== undefined) datosActualizados.terminalId = terminalId.trim();
        if (activa     !== undefined) datosActualizados.activa     = Boolean(activa);

        const resultado = await StorageManager.update('terminales', id, datosActualizados);

        if (resultado.success) {
            this._auditoria?.registrar('TERMINAL_EDITAR', {
                nombre:     datosActualizados.nombre     ?? terminal.nombre,
                terminalId: datosActualizados.terminalId ?? terminal.terminalId
            });
            return { success: true, message: 'Terminal actualizada correctamente' };
        }

        return { success: false, message: 'Error al actualizar la terminal' };
    }

    async eliminar(id) {
        const terminal = this.obtenerPorId(id);
        if (!terminal) return { success: false, message: 'Terminal no encontrada' };

        const resultado = await StorageManager.delete('terminales', id);

        if (resultado.success) {
            this._auditoria?.registrar('TERMINAL_ELIMINAR', {
                nombre:     terminal.nombre,
                terminalId: terminal.terminalId
            });
            return { success: true, message: 'Terminal eliminada' };
        }

        return { success: false, message: 'Error al eliminar la terminal' };
    }

    async toggleActiva(id) {
        const terminal = this.obtenerPorId(id);
        if (!terminal) return { success: false, message: 'Terminal no encontrada' };

        return await this.actualizar(id, { activa: !terminal.activa });
    }

    // ─── SINCRONIZACIÓN CON MP ────────────────────────────────────────────────

    /**
     * Obtiene la lista de terminales reales desde la API de MP
     * a través de la Cloud Function proxy.
     *
     * @param {MercadoPagoManager} mpManager
     * @returns {Array} Terminales de MP: [{ id, operating_mode, store_id, ... }]
     */
    async obtenerTerminalesDeMP(mpManager) {
        try {
            const terminalesMP = await mpManager.obtenerTerminalesMP();
            return terminalesMP;
        } catch (err) {
            console.error('[Terminales] Error al obtener terminales de MP:', err);
            return [];
        }
    }

    /**
     * Activa el modo PDV en una terminal mediante la API de MP.
     *
     * @param {string} terminalId
     * @param {MercadoPagoManager} mpManager
     */
    async activarPDV(terminalId, mpManager) {
        try {
            const resultado = await mpManager.activarModoPDV(terminalId);
            if (resultado.success) {
                this._auditoria?.registrar('TERMINAL_PDV_ACTIVADO', { terminalId });
            }
            return resultado;
        } catch (err) {
            console.error('[Terminales] Error al activar PDV:', err);
            return { success: false, error: err.message };
        }
    }
}