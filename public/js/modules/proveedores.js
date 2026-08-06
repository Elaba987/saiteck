// proveedores.js - Módulo para gestión de proveedores con Firestore

import { StorageManager, STORAGE_KEYS } from './storage.js';

export class ProveedoresManager {
    constructor() {
        this.proveedores = [];
        this.unsubscribe = null;
        this._auditoria  = null;

        // ── Historial de visitas (colección independiente 'visitasProveedor') ──
        this.visitas            = [];
        this.unsubscribeVisitas = null;
    }

    setAuditoriaManager(mgr) { this._auditoria = mgr; }

    async cargarProveedores() {
        this.proveedores = await StorageManager.loadAll(STORAGE_KEYS.PROVEEDORES);
        return this.proveedores;
    }

    iniciarEscucha(callback) {
        this.unsubscribe = StorageManager.onSnapshot(STORAGE_KEYS.PROVEEDORES, (proveedores) => {
            this.proveedores = proveedores;
            if (callback) callback(proveedores);
        });
    }

    detenerEscucha() {
        if (this.unsubscribe) this.unsubscribe();
    }

    obtenerTodos()   { return this.proveedores; }
    obtenerPorId(id) { return this.proveedores.find(p => p.id === id); }

    esFechaValida(fechaStr) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const [año, mes, dia] = fechaStr.split('-').map(Number);
        const fecha = new Date(año, mes - 1, dia);
        fecha.setHours(0, 0, 0, 0);
        return fecha >= hoy;
    }

    async agregar(proveedor) {
        let fechaVisita = proveedor.fechaVisita;

        if (fechaVisita && !this.esFechaValida(fechaVisita)) {
            return { success: false, message: 'No se pueden agendar visitas en fechas pasadas' };
        }

        const nuevoProveedor = {
            nombre:            proveedor.nombre,
            telefono:          proveedor.telefono          || '',
            email:             proveedor.email             || '',
            fechaVisita,
            visitaRealizada:   false,
            tipoReparto:       proveedor.tipoReparto       || 'manual',
            diasReparto:       proveedor.diasReparto       || [],
            frecuenciaReparto: proveedor.frecuenciaReparto || 1,
            productosAsociados: [],   // catálogo: [{ productoClave }] — el precio SIEMPRE se lee de Productos
            listaFrecuente:     []    // plantilla persistente: [{ productoClave, cantidad }]
        };

        const resultado = await StorageManager.add(STORAGE_KEYS.PROVEEDORES, nuevoProveedor);

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_CREAR', {
                nombre:    nuevoProveedor.nombre,
                tipo:      nuevoProveedor.tipoReparto === 'constante' ? 'Reparto constante' : 'Fecha fija',
                fecha:     nuevoProveedor.fechaVisita || '-',
                telefono:  nuevoProveedor.telefono    || '-'
            });
            return { success: true, message: 'Proveedor registrado exitosamente' };
        }

        return { success: false, message: 'Error al registrar proveedor' };
    }

    async actualizar(proveedorId, datos) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) {
            return { success: false, message: 'Proveedor no encontrado' };
        }

        const datosActualizados = {
            nombre:            datos.nombre            || proveedor.nombre,
            telefono:          datos.telefono          !== undefined ? datos.telefono  : proveedor.telefono,
            email:             datos.email             !== undefined ? datos.email     : proveedor.email,
            tipoReparto:       datos.tipoReparto       || proveedor.tipoReparto,
            diasReparto:       datos.diasReparto       !== undefined ? datos.diasReparto       : proveedor.diasReparto,
            frecuenciaReparto: datos.frecuenciaReparto !== undefined ? datos.frecuenciaReparto : proveedor.frecuenciaReparto
        };

        if (datos.fechaVisita) {
            if (!this.esFechaValida(datos.fechaVisita)) {
                return { success: false, message: 'No se pueden agendar visitas en fechas pasadas' };
            }
            datosActualizados.fechaVisita     = datos.fechaVisita;
            datosActualizados.visitaRealizada = false;
        }

        if (datos.diasReparto && datosActualizados.tipoReparto === 'constante' && datos.diasReparto.length > 0) {
            const frecuencia = datos.frecuenciaReparto || proveedor.frecuenciaReparto || 1;
            datosActualizados.fechaVisita     = this.calcularProximaFechaConstante(datos.diasReparto, frecuencia);
            datosActualizados.visitaRealizada = false;
        }

        if (datos.visitaRealizada !== undefined) {
            datosActualizados.visitaRealizada = datos.visitaRealizada;
        }

        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, datosActualizados);

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_EDITAR', {
                nombre:         datosActualizados.nombre,
                tipo:           datosActualizados.tipoReparto,
                proximaVisita:  datosActualizados.fechaVisita || '-'
            });
            return { success: true, message: 'Proveedor actualizado' };
        }

        return { success: false, message: 'Error al actualizar proveedor' };
    }

    async eliminar(proveedorId) {
        const proveedor = this.obtenerPorId(proveedorId);
        const resultado = await StorageManager.delete(STORAGE_KEYS.PROVEEDORES, proveedorId);

        if (resultado.success) {
            if (proveedor) {
                this._auditoria?.registrar('PROVEEDOR_ELIMINAR', {
                    nombre:   proveedor.nombre,
                    telefono: proveedor.telefono || '-'
                });
            }
            return { success: true, message: 'Proveedor eliminado' };
        }

        return { success: false, message: 'Error al eliminar proveedor' };
    }

    ordenarPorFecha() {
        return [...this.proveedores].sort((a, b) =>
            new Date(a.fechaVisita) - new Date(b.fechaVisita)
        );
    }

    obtenerProveedoresHoy() {
        const hoy    = new Date();
        const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        return this.proveedores.filter(p => p.fechaVisita === hoyStr);
    }

    esVisitaHoy(fechaVisita) {
        const hoy    = new Date();
        const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        return fechaVisita === hoyStr;
    }

    async marcarVisitaRealizada(proveedorId) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) {
            return { success: false, message: 'Proveedor no encontrado' };
        }

        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, {
            visitaRealizada: true
        });

        if (resultado.success) {
            // ── Registrar en el historial permanente de visitas ──
            await this._registrarVisitaEnHistorial(proveedor, proveedor.fechaVisita);

            this._auditoria?.registrar('PROVEEDOR_VISITA_MARCADA', {
                nombre:       proveedor.nombre,
                fechaVisita:  proveedor.fechaVisita || '-'
            });
            return {
                success:   true,
                message:   'Visita marcada como realizada',
                proveedor: { ...proveedor, visitaRealizada: true }
            };
        }

        return { success: false, message: 'Error al marcar visita' };
    }

    async programarSiguienteVisita(proveedorId, nuevaFecha) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) {
            return { success: false, message: 'Proveedor no encontrado' };
        }

        let fechaVisita;

        if (proveedor.tipoReparto === 'constante' && proveedor.diasReparto.length > 0) {
            const frecuencia = proveedor.frecuenciaReparto || 1;
            fechaVisita      = this.calcularProximaFechaConstante(proveedor.diasReparto, frecuencia);
        } else if (nuevaFecha) {
            fechaVisita = nuevaFecha;
        } else {
            return { success: false, message: 'No se puede programar la próxima visita' };
        }

        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, {
            fechaVisita,
            visitaRealizada: false
        });

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_VISITA_PROGRAMADA', {
                nombre:      proveedor.nombre,
                nuevaFecha:  fechaVisita
            });
            return { success: true, message: 'Próxima visita programada' };
        }

        return { success: false, message: 'Error al programar visita' };
    }

    calcularProximaFechaConstante(diasReparto, frecuencia = 1) {
        const hoy          = new Date();
        let proximaFecha   = new Date(hoy);
        proximaFecha.setDate(proximaFecha.getDate() + 1);

        const diasEncontrados = [];

        for (let i = 0; i < 21; i++) {
            if (diasReparto.includes(proximaFecha.getDay())) {
                diasEncontrados.push(new Date(proximaFecha));
            }
            proximaFecha.setDate(proximaFecha.getDate() + 1);
        }

        let indiceSeleccionado = 0;
        if (frecuencia === 2) indiceSeleccionado = Math.min(1, diasEncontrados.length - 1);
        else if (frecuencia === 3) indiceSeleccionado = Math.min(2, diasEncontrados.length - 1);

        const fechaSeleccionada = diasEncontrados[indiceSeleccionado] || hoy;

        const año = fechaSeleccionada.getFullYear();
        const mes = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaSeleccionada.getDate()).padStart(2, '0');

        return `${año}-${mes}-${dia}`;
    }

    buscar(termino) {
        const busqueda = termino.toLowerCase();
        return this.proveedores.filter(p =>
            p.nombre.toLowerCase().includes(busqueda)
        );
    }

    ordenar(criterio) {
        const proveedoresOrdenados = [...this.proveedores];

        switch (criterio) {
            case 'proxima': return proveedoresOrdenados.sort((a, b) => new Date(a.fechaVisita) - new Date(b.fechaVisita));
            case 'lejana':  return proveedoresOrdenados.sort((a, b) => new Date(b.fechaVisita) - new Date(a.fechaVisita));
            case 'az':      return proveedoresOrdenados.sort((a, b) => a.nombre.localeCompare(b.nombre));
            case 'za':      return proveedoresOrdenados.sort((a, b) => b.nombre.localeCompare(a.nombre));
            default:        return proveedoresOrdenados;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // CATÁLOGO DE PRODUCTOS DEL PROVEEDOR
    //
    // IMPORTANTE: el catálogo solo guarda la CLAVE del producto.
    // NO se guarda nombre ni precio propios — siempre se leen en vivo
    // desde ProductosManager, así cualquier cambio hecho en la sección
    // Productos (precio, nombre) se refleja automáticamente aquí y en
    // los pedidos que se arman a partir del catálogo.
    // ═══════════════════════════════════════════════════════════════

    /** Devuelve las claves crudas guardadas (sin resolver contra Productos) */
    obtenerProductosAsociados(proveedorId) {
        const proveedor = this.obtenerPorId(proveedorId);
        return proveedor?.productosAsociados || [];
    }

    async agregarProductoAsociado(proveedorId, productoClave) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) return { success: false, message: 'Proveedor no encontrado' };

        const claveNum = parseInt(productoClave);
        const yaExiste = (proveedor.productosAsociados || []).some(p => p.productoClave === claveNum);
        if (yaExiste) return { success: false, message: 'Este producto ya está vinculado a este proveedor' };

        const productosAsociados = [...(proveedor.productosAsociados || []), { productoClave: claveNum }];
        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, { productosAsociados });

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_PRODUCTO_ASOCIAR', {
                proveedor: proveedor.nombre,
                clave:     claveNum
            });
            return { success: true, productosAsociados };
        }
        return { success: false, message: 'Error al vincular producto' };
    }

    async eliminarProductoAsociado(proveedorId, productoClave) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) return { success: false, message: 'Proveedor no encontrado' };

        const claveNum = parseInt(productoClave);
        const productosAsociados = (proveedor.productosAsociados || [])
            .filter(p => p.productoClave !== claveNum);
        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, { productosAsociados });

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_PRODUCTO_QUITAR', { proveedor: proveedor.nombre, clave: claveNum });
            return { success: true, productosAsociados };
        }
        return { success: false, message: 'Error al desvincular producto' };
    }

    // ═══════════════════════════════════════════════════════════════
    // LISTA FRECUENTE (plantilla persistente de pedido)
    //
    // A diferencia de un pedido puntual, esta lista vive en el propio
    // proveedor y NO se consume/borra al completar un pedido. Sirve
    // como plantilla reutilizable: "cada vez que venga este proveedor,
    // normalmente le pido esto". Debe estar disponible en Dashboard /
    // Proveedores siempre que el proveedor tenga una fechaVisita asignada.
    // ═══════════════════════════════════════════════════════════════

    obtenerListaFrecuente(proveedorId) {
        const proveedor = this.obtenerPorId(proveedorId);
        return proveedor?.listaFrecuente || [];
    }

    tieneListaFrecuente(proveedorId) {
        return this.obtenerListaFrecuente(proveedorId).length > 0;
    }

    /**
     * Reemplaza la lista frecuente completa del proveedor.
     * @param {string} proveedorId
     * @param {Array}  items - [{ productoClave, cantidad }]
     */
    async guardarListaFrecuente(proveedorId, items = []) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) return { success: false, message: 'Proveedor no encontrado' };

        const listaFrecuente = items
            .filter(i => parseInt(i.cantidad) > 0)
            .map(i => ({ productoClave: parseInt(i.productoClave), cantidad: parseInt(i.cantidad) }));

        if (listaFrecuente.length === 0) {
            return { success: false, message: 'La lista debe tener al menos un producto con cantidad mayor a 0' };
        }

        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, { listaFrecuente });

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_LISTA_FRECUENTE_GUARDAR', {
                proveedor: proveedor.nombre,
                productos: listaFrecuente.length
            });
            return { success: true, listaFrecuente };
        }
        return { success: false, message: 'Error al guardar la lista frecuente' };
    }

    async eliminarListaFrecuente(proveedorId) {
        const proveedor = this.obtenerPorId(proveedorId);
        if (!proveedor) return { success: false, message: 'Proveedor no encontrado' };

        const resultado = await StorageManager.update(STORAGE_KEYS.PROVEEDORES, proveedorId, { listaFrecuente: [] });

        if (resultado.success) {
            this._auditoria?.registrar('PROVEEDOR_LISTA_FRECUENTE_ELIMINAR', { proveedor: proveedor.nombre });
            return { success: true };
        }
        return { success: false, message: 'Error al eliminar la lista frecuente' };
    }

    // ═══════════════════════════════════════════════════════════════
    // HISTORIAL DE VISITAS
    // ═══════════════════════════════════════════════════════════════

    async cargarVisitas() {
        this.visitas = await StorageManager.loadAll('visitasProveedor');
        return this.visitas;
    }

    iniciarEscuchaVisitas(callback) {
        this.unsubscribeVisitas = StorageManager.onSnapshot('visitasProveedor', (visitas) => {
            this.visitas = visitas;
            if (callback) callback(visitas);
        });
    }

    detenerEscuchaVisitas() {
        if (this.unsubscribeVisitas) this.unsubscribeVisitas();
    }

    obtenerHistorialVisitas(proveedorId) {
        return this.visitas
            .filter(v => v.proveedorId === proveedorId)
            .sort((a, b) => new Date(b.fechaRealizada) - new Date(a.fechaRealizada));
    }

    async _registrarVisitaEnHistorial(proveedor, fechaProgramada) {
        const registro = {
            proveedorId:     proveedor.id,
            proveedorNombre: proveedor.nombre,
            fechaProgramada: fechaProgramada || null,
            fechaRealizada:  new Date().toISOString()
        };
        await StorageManager.add('visitasProveedor', registro);
    }
}