// ventas.js - Módulo para gestión de ventas con Firestore

import { StorageManager, STORAGE_KEYS } from './storage.js';

export class VentasManager {
    constructor() {
        this.ventas      = [];
        this.ventaActual = [];
        this.unsubscribe = null;
        this._auditoria  = null;
    }

    setAuditoriaManager(mgr) { this._auditoria = mgr; }

    async cargarVentas() {
        this.ventas = await StorageManager.loadAll(STORAGE_KEYS.VENTAS);
        return this.ventas;
    }

    iniciarEscucha(callback) {
        this.unsubscribe = StorageManager.onSnapshot(STORAGE_KEYS.VENTAS, (ventas) => {
            this.ventas = ventas;
            if (callback) callback(ventas);
        });
    }

    detenerEscucha() {
        if (this.unsubscribe) this.unsubscribe();
    }

    obtenerTodas()        { return this.ventas; }
    obtenerVentaActual()  { return this.ventaActual; }

    // ─── FILTROS POR FECHA ────────────────────────────────────────────────

    obtenerVentasPorFecha(fecha) {
        return this.ventas.filter(v =>
            new Date(v.fecha).toDateString() === fecha.toDateString()
        );
    }

    obtenerVentasPorRango(fechaInicio, fechaFin) {
        return this.ventas.filter(v => {
            const fv = new Date(v.fecha);
            return fv >= fechaInicio && fv <= fechaFin;
        });
    }

    // ─── CARRITO ──────────────────────────────────────────────────────────

    agregarItemVenta(producto, cantidad) {
        if (producto.esGranel) {
            return { success: false, message: 'Usar agregarItemGranel para productos a granel' };
        }

        const itemExistente = this.ventaActual.find(item =>
            item.producto.clave === producto.clave && !item.esGranel
        );

        if (itemExistente) {
            itemExistente.cantidad += parseInt(cantidad);
            itemExistente.subtotal  = itemExistente.producto.precioVenta * itemExistente.cantidad;
            return { success: true, item: itemExistente, agrupado: true };
        }

        const productoSanitizado = {
            clave:        producto.clave,
            nombre:       producto.nombre,
            precioCompra: producto.precioCompra,
            precioVenta:  producto.precioVenta,
            stock:        producto.stock,
            esGranel:     false
        };

        const item = {
            producto:  productoSanitizado,
            cantidad:  parseInt(cantidad),
            subtotal:  producto.precioVenta * parseInt(cantidad),
            esGranel:  false
        };

        this.ventaActual.push(item);
        return { success: true, item, agrupado: false };
    }

    /**
     * Agrega un producto a granel.
     * costoGranel = costo proporcional a los gramos vendidos.
     */
    agregarItemGranel(producto, gramos, precio) {
        const costoKilo        = producto.precioCompra || 0;
        const costoProporcional = costoKilo * (parseFloat(gramos) / 1000);

        const productoSanitizado = {
            clave:        producto.clave,
            nombre:       producto.nombre,
            precioCompra: producto.precioCompra,
            precioVenta:  producto.precioVenta,
            stock:        producto.stock,
            esGranel:     true
        };

        const item = {
            producto:    productoSanitizado,
            cantidad:    1,
            gramos:      parseFloat(gramos),
            subtotal:    parseFloat(precio),
            costoGranel: parseFloat(costoProporcional.toFixed(4)),
            esGranel:    true
        };

        this.ventaActual.push(item);
        return { success: true, item, agrupado: false };
    }

    modificarCantidadItem(index, cambio) {
        if (index < 0 || index >= this.ventaActual.length) {
            return { success: false, message: 'Índice inválido' };
        }

        const item = this.ventaActual[index];
        if (item.esGranel) {
            return { success: false, message: 'Usa la interfaz de granel para modificar' };
        }

        const nuevaCantidad = item.cantidad + cambio;
        if (nuevaCantidad <= 0) return this.quitarItemVenta(index);

        item.cantidad = nuevaCantidad;
        item.subtotal = item.producto.precioVenta * item.cantidad;
        return { success: true, item };
    }

    quitarItemVenta(index) {
        if (index < 0 || index >= this.ventaActual.length) {
            return { success: false, message: 'Índice inválido' };
        }
        this.ventaActual.splice(index, 1);
        return { success: true };
    }

    calcularTotal() {
        return this.ventaActual.reduce((sum, item) => sum + item.subtotal, 0);
    }

    obtenerStockEnCarrito(clave) {
        return this.ventaActual
            .filter(item => item.producto.clave === clave)
            .reduce((sum, item) => sum + (item.esGranel ? item.gramos : item.cantidad), 0);
    }

    // ─── FINALIZAR VENTA ─────────────────────────────────────────────────

    async finalizarVenta() {
        if (this.ventaActual.length === 0) {
            return { success: false, message: 'No hay productos en la venta' };
        }

        const total = this.calcularTotal();

        const usuarioActual = window.appInstance?.usuariosManager?.obtenerUsuarioActual?.();
        const usuario = usuarioActual
            ? { id: usuarioActual.id, nombre: usuarioActual.nombre, rol: usuarioActual.rol }
            : { id: 'system', nombre: 'Sistema', rol: 'sistema' };

        const venta = {
            items:   [...this.ventaActual],
            total,
            fecha:   new Date().toISOString(),
            usuario
        };

        const resultado = await StorageManager.add(STORAGE_KEYS.VENTAS, venta);

        if (resultado.success) {
            const numeroTicket  = this.ventas.length + 1;
            const ventaFinalizada = { ...venta, numeroTicket, id: resultado.id };

            // ── Auditoría ──
            const resumenItems = this.ventaActual
                .map(i => i.esGranel
                    ? `${i.producto.nombre} ${i.gramos}g`
                    : `${i.producto.nombre} ×${i.cantidad}`)
                .join(', ');

            this._auditoria?.registrar('VENTA_CREAR', {
                ticket:   `#${numeroTicket}`,
                total:    `$${total.toFixed(2)}`,
                items:    resumenItems,
                cantidad: this.ventaActual.length
            }, usuario);

            this.ventaActual = [];
            return { success: true, venta: ventaFinalizada };
        }

        return { success: false, message: 'Error al finalizar venta' };
    }

    // ─── TICKET ──────────────────────────────────────────────────────────

    generarTicket(venta, numeroTicket) {
        const fecha         = new Date(venta.fecha);
        const usuarioNombre = venta.usuario?.nombre || 'Sistema';

        return `======= TICKET DE VENTA =======
Fecha: ${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}
Ticket #${numeroTicket}
Atendido por: ${usuarioNombre}

PRODUCTOS:
${venta.items.map(item => {
    if (item.esGranel) {
        return `${item.producto.nombre} [GRANEL]
  ${item.gramos}g x $${item.producto.precioVenta.toFixed(2)}/kg = $${item.subtotal.toFixed(2)}`;
    }
    return `${item.producto.nombre}
  Cantidad: ${item.cantidad} x $${item.producto.precioVenta.toFixed(2)} = $${item.subtotal.toFixed(2)}`;
}).join('\n')}

================================
TOTAL: $${venta.total.toFixed(2)}
PAGO: $${venta.pago   ? venta.pago.toFixed(2)   : venta.total.toFixed(2)}
CAMBIO: $${venta.cambio ? venta.cambio.toFixed(2) : '0.00'}
================================

¡Gracias por su compra!
`;
    }

    descargarTicket(venta, numeroTicket) {
        const contenido = this.generarTicket(venta, numeroTicket);
        const blob  = new Blob([contenido], { type: 'text/plain' });
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement('a');
        const fecha = new Date(venta.fecha);

        a.href     = url;
        a.download = `TICKET_${numeroTicket}_${fecha.getDate()}-${fecha.getMonth()+1}-${fecha.getFullYear()}_${fecha.getHours()}-${fecha.getMinutes()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // ── Auditoría ──
        this._auditoria?.registrar('VENTA_TICKET_DESCARGADO', {
            ticket: `#${numeroTicket}`,
            total:  `$${venta.total.toFixed(2)}`
        });
    }
}