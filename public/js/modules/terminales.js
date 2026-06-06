// terminales.js - Módulo para gestión de terminales Mercado Pago Point

import { StorageManager } from './storage.js';

export class TerminalesManager {
    constructor() {
        this.terminales  = [];
        this.unsubscribe = null;
        this._auditoria  = null;
    }

    setAuditoriaManager(mgr) { this._auditoria = mgr; }

    // ─── FIRESTORE ────────────────────────────────────────────────────────

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

    // ─── ACCESO ───────────────────────────────────────────────────────────

    obtenerTodas()         { return this.terminales; }
    obtenerActivas()       { return this.terminales.filter(t => t.activa); }
    obtenerPorId(id)       { return this.terminales.find(t => t.id === id); }
    obtenerPorDeviceId(did){ return this.terminales.find(t => t.deviceId === did); }

    // ─── CRUD ─────────────────────────────────────────────────────────────

    async agregar(datos) {
        const { nombre, deviceId } = datos;

        if (!nombre?.trim())    return { success: false, message: 'El nombre es obligatorio' };
        if (!deviceId?.trim())  return { success: false, message: 'El Device ID es obligatorio' };

        // Evitar Device IDs duplicados
        if (this.obtenerPorDeviceId(deviceId.trim())) {
            return { success: false, message: 'Ya existe una terminal con ese Device ID' };
        }

        const nueva = {
            nombre:   nombre.trim(),
            deviceId: deviceId.trim(),
            activa:   true,
            fechaCreacion: new Date().toISOString()
        };

        const resultado = await StorageManager.add('terminales', nueva);

        if (resultado.success) {
            this._auditoria?.registrar('TERMINAL_CREAR', {
                nombre:   nueva.nombre,
                deviceId: nueva.deviceId
            });
            return { success: true, message: 'Terminal registrada correctamente', id: resultado.id };
        }

        return { success: false, message: 'Error al registrar la terminal' };
    }

    async actualizar(id, datos) {
        const terminal = this.obtenerPorId(id);
        if (!terminal) return { success: false, message: 'Terminal no encontrada' };

        const { nombre, deviceId, activa } = datos;

        if (nombre !== undefined && !nombre.trim()) {
            return { success: false, message: 'El nombre no puede estar vacío' };
        }

        // Validar que el nuevo Device ID no esté en uso por otra terminal
        if (deviceId && deviceId.trim() !== terminal.deviceId) {
            if (this.obtenerPorDeviceId(deviceId.trim())) {
                return { success: false, message: 'Ese Device ID ya está en uso por otra terminal' };
            }
        }

        const datosActualizados = {};
        if (nombre   !== undefined) datosActualizados.nombre   = nombre.trim();
        if (deviceId !== undefined) datosActualizados.deviceId = deviceId.trim();
        if (activa   !== undefined) datosActualizados.activa   = Boolean(activa);

        const resultado = await StorageManager.update('terminales', id, datosActualizados);

        if (resultado.success) {
            this._auditoria?.registrar('TERMINAL_EDITAR', {
                nombre:   datosActualizados.nombre   ?? terminal.nombre,
                deviceId: datosActualizados.deviceId ?? terminal.deviceId
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
                nombre:   terminal.nombre,
                deviceId: terminal.deviceId
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
}