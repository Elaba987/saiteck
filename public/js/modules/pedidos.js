// pedidos.js - Módulo para gestión de listas de pedidos a proveedores

import { StorageManager } from './storage.js';
import { filtrarPorPeriodo, tituloPeriodo } from './fechasUtil.js';

export class PedidosManager {
    constructor() {
        this.pedidos = [];
        this.unsubscribe = null;
        this._auditoria      = null;
        this._productosManager = null; // ── NUEVO: para actualizar stock al recibir ──
    }

    setAuditoriaManager(mgr) { this._auditoria = mgr; }

    /** NUEVO — necesario para aumentar stock y sincronizar precio de compra al recibir un pedido */
    setProductosManager(mgr) { this._productosManager = mgr; }

    async cargarPedidos() {
        this.pedidos = await StorageManager.loadAll('pedidos');
        return this.pedidos;
    }

    iniciarEscucha(callback) {
        this.unsubscribe = StorageManager.onSnapshot('pedidos', (pedidos) => {
            this.pedidos = pedidos;
            if (callback) callback(pedidos);
        });
    }

    detenerEscucha() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    obtenerTodos() {
        return this.pedidos;
    }

    obtenerPorId(id) {
        return this.pedidos.find(p => p.id === id);
    }

    obtenerPorProveedor(proveedorId) {
        return this.pedidos.filter(p => p.proveedorId === proveedorId && !p.completado);
    }

    obtenerCompletados() {
        return this.pedidos.filter(p => p.completado);
    }

    obtenerPendientes() {
        return this.pedidos.filter(p => !p.completado);
    }

    async crearPedido(proveedorId, proveedorNombre, items = []) {
        const nuevoPedido = {
            proveedorId,
            proveedorNombre,
            items: items.map(item => ({
                productoId: item.productoId,
                productoClave: item.productoClave,
                productoNombre: item.productoNombre,
                cantidad: parseInt(item.cantidad),
                precioCompra: parseFloat(item.precioCompra),
                subtotal: parseFloat(item.precioCompra) * parseInt(item.cantidad)
            })),
            completado: false,
            fechaCreacion: new Date().toISOString(),
            total: this.calcularTotal(items)
        };

        const resultado = await StorageManager.add('pedidos', nuevoPedido);

        if (resultado.success) {
            const pedidoFinal = { ...nuevoPedido, id: resultado.id };

            this._auditoria?.registrar('PEDIDO_CREAR', {
                proveedor: proveedorNombre,
                productos: nuevoPedido.items.length,
                total:     `$${nuevoPedido.total.toFixed(2)}`
            });

            return { success: true, pedido: pedidoFinal };
        }

        return { success: false, message: 'Error al crear pedido' };
    }

    /**
     * NUEVO — Sobrescribe por completo los items de un pedido PENDIENTE.
     * Usado para "editar pedido" (agregar/quitar productos, cambiar cantidades)
     * antes de que llegue el proveedor.
     * @param {string} pedidoId
     * @param {Array}  itemsCatalogo - [{ productoClave, productoNombre, precioCompra, cantidad }]
     */
    async actualizarItemsPedido(pedidoId, itemsCatalogo = []) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) return { success: false, message: 'Pedido no encontrado' };
        if (pedido.completado) return { success: false, message: 'No se pueden modificar pedidos completados' };

        const items = itemsCatalogo
            .filter(i => parseInt(i.cantidad) > 0)
            .map(i => ({
                productoId:     i.productoId || null,
                productoClave:  i.productoClave,
                productoNombre: i.productoNombre,
                cantidad:       parseInt(i.cantidad),
                precioCompra:   parseFloat(i.precioCompra),
                subtotal:       parseFloat(i.precioCompra) * parseInt(i.cantidad)
            }));

        if (items.length === 0) {
            return { success: false, message: 'El pedido debe tener al menos un producto con cantidad mayor a 0' };
        }

        const total = items.reduce((sum, i) => sum + i.subtotal, 0);

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            items, total, fechaModificacion: new Date().toISOString()
        });

        if (resultado.success) {
            this._auditoria?.registrar('PEDIDO_EDITAR', {
                proveedor: pedido.proveedorNombre,
                productos: items.length,
                total:     `$${total.toFixed(2)}`
            });
            return { success: true, items, total };
        }
        return { success: false, message: 'Error al actualizar el pedido' };
    }

    async eliminarPedido(pedidoId) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        if (pedido.completado) {
            return { success: false, message: 'No se pueden eliminar pedidos completados. Están guardados en reportes.' };
        }

        const resultado = await StorageManager.delete('pedidos', pedidoId);

        if (resultado.success) {
            this._auditoria?.registrar('PEDIDO_ELIMINAR', {
                proveedor: pedido.proveedorNombre,
                productos: pedido.items.length
            });

            return { success: true, message: 'Pedido eliminado' };
        }

        return { success: false, message: 'Error al eliminar pedido' };
    }

    async duplicarPedido(pedidoId) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        // Crear nuevo pedido con los mismos items
        return await this.crearPedido(
            pedido.proveedorId,
            pedido.proveedorNombre,
            pedido.items
        );
    }

    calcularTotal(items) {
        return items.reduce((sum, item) => {
            const precio = parseFloat(item.precioCompra);
            const cantidad = parseInt(item.cantidad);
            return sum + (precio * cantidad);
        }, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // RECEPCIÓN DE PEDIDO (checklist) — REDISEÑADO
    //
    // Al "completar" un pedido, el usuario revisa un checklist con cada
    // producto: puede desmarcar los que NO llegaron, ajustar la cantidad
    // realmente recibida y el precio de compra real pagado. Solo los
    // productos marcados como recibidos:
    //   1. Se suman al stock del producto correspondiente (Productos).
    //   2. Si el precio de compra real difiere del registrado en
    //      Productos, se actualiza ahí también (mismo origen de datos).
    //   3. Quedan guardados en el pedido con el total recalculado.
    // ═══════════════════════════════════════════════════════════════

    /**
     * @param {string} pedidoId
     * @param {Array|null} itemsRecibidos - checklist resultante:
     *        [{ productoClave, productoNombre, cantidad, precioCompra, recibido }]
     *        Si es null, se asume que TODO el pedido llegó tal cual fue creado
     *        (atajo "marcar todo como completado").
     */
    async completarPedido(pedidoId, itemsRecibidos = null) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }
        if (pedido.completado) {
            return { success: false, message: 'Este pedido ya está completado' };
        }

        const base = itemsRecibidos || pedido.items.map(i => ({
            productoClave:  i.productoClave,
            productoNombre: i.productoNombre,
            cantidad:       i.cantidad,
            precioCompra:   i.precioCompra,
            recibido:       true
        }));

        const itemsFinales = base
            .filter(i => i.recibido)
            .map(i => ({
                productoId:     i.productoId || null,
                productoClave:  i.productoClave,
                productoNombre: i.productoNombre,
                cantidad:       parseInt(i.cantidad),
                precioCompra:   parseFloat(i.precioCompra),
                subtotal:       parseFloat(i.precioCompra) * parseInt(i.cantidad)
            }));

        if (itemsFinales.length === 0) {
            return { success: false, message: 'Debes marcar al menos un producto como recibido' };
        }

        const nuevoTotal = itemsFinales.reduce((sum, i) => sum + i.subtotal, 0);
        const fechaCompletado = new Date().toISOString();

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            items:      itemsFinales,
            total:      nuevoTotal,
            completado: true,
            fechaCompletado
        });

        if (!resultado.success) {
            return { success: false, message: 'Error al completar pedido' };
        }

        // ── Sincronizar con Productos: aumentar stock y (si cambió) precio de compra ──
        if (this._productosManager) {
            for (const item of itemsFinales) {
                await this._productosManager.aumentarStock(item.productoClave, item.cantidad);

                const productoActual = this._productosManager.obtenerPorClave(item.productoClave);
                if (productoActual && productoActual.precioCompra !== item.precioCompra) {
                    await this._productosManager.actualizar(productoActual.id, { precioCompra: item.precioCompra });
                }
            }
        }

        const huboProductosNoRecibidos = itemsFinales.length < pedido.items.length;

        this._auditoria?.registrar('PEDIDO_COMPLETAR', {
            proveedor:          pedido.proveedorNombre,
            productosRecibidos: itemsFinales.length,
            productosPedidos:   pedido.items.length,
            recepcionParcial:   huboProductosNoRecibidos ? 'Sí' : 'No',
            total:              `$${nuevoTotal.toFixed(2)}`
        });

        return {
            success: true,
            pedido: { ...pedido, items: itemsFinales, total: nuevoTotal, completado: true, fechaCompletado }
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // PEDIDO DESDE CATÁLOGO DEL PROVEEDOR
    // itemsCatalogo debe venir ya resuelto (nombre/precio en vivo desde
    // ProductosManager) — normalmente construido en app.js.
    // ═══════════════════════════════════════════════════════════════

    async crearPedidoDesdeCatalogo(proveedor, itemsCatalogo = []) {
        const items = itemsCatalogo
            .filter(i => parseInt(i.cantidad) > 0)
            .map(i => ({
                productoId:     i.productoId || null,
                productoClave:  i.productoClave,
                productoNombre: i.productoNombre,
                cantidad:       parseInt(i.cantidad),
                precioCompra:   parseFloat(i.precioCompra) || 0
            }));

        if (items.length === 0) {
            return { success: false, message: 'Selecciona al menos un producto con cantidad mayor a 0' };
        }

        const resultado = await this.crearPedido(proveedor.id, proveedor.nombre, items);

        if (resultado.success) {
            this._auditoria?.registrar('PEDIDO_DESDE_CATALOGO', {
                proveedor: proveedor.nombre,
                productos: items.length,
                total:     `$${resultado.pedido.total.toFixed(2)}`
            });
        }

        return resultado;
    }

    // ═══════════════════════════════════════════════════════════════
    // HISTORIAL DE COMPRAS POR PROVEEDOR
    // ═══════════════════════════════════════════════════════════════

    obtenerHistorialComprasPorProveedor(proveedorId) {
        return this.pedidos
            .filter(p => p.proveedorId === proveedorId && p.completado)
            .sort((a, b) =>
                new Date(b.fechaCompletado || b.fechaCreacion) - new Date(a.fechaCompletado || a.fechaCreacion)
            );
    }

    calcularTotalGastadoConProveedor(proveedorId) {
        return this.obtenerHistorialComprasPorProveedor(proveedorId)
            .reduce((sum, p) => sum + p.total, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // REPORTES DE COMPRAS
    // ═══════════════════════════════════════════════════════════════

    generarReporteCompras(tipo, parametros = {}, proveedorId = null) {
        let base = this.obtenerCompletados();
        if (proveedorId) base = base.filter(p => p.proveedorId === proveedorId);

        const filtrados = filtrarPorPeriodo(
            base,
            tipo,
            parametros,
            (p) => p.fechaCompletado || p.fechaCreacion
        );

        const totalCompras       = filtrados.reduce((sum, p) => sum + p.total, 0);
        const cantidadProductos  = filtrados.reduce((sum, p) => sum + p.items.reduce((s, i) => s + i.cantidad, 0), 0);
        const nombreProveedor    = proveedorId ? (filtrados[0]?.proveedorNombre || '') : null;

        return {
            titulo: nombreProveedor
                ? `Compras a ${nombreProveedor} — ${tituloPeriodo(tipo, parametros)}`
                : `Compras a Proveedores — ${tituloPeriodo(tipo, parametros)}`,
            pedidos:          filtrados,
            cantidadPedidos:  filtrados.length,
            cantidadProductos,
            totalCompras
        };
    }

    generarTextoReporteCompras(reporte) {
        return `======= REPORTE DE COMPRAS A PROVEEDORES =======
${reporte.titulo}
Generado: ${new Date().toLocaleString()}
================================================

${reporte.pedidos.map((p, i) => {
    const fecha = new Date(p.fechaCompletado || p.fechaCreacion);
    return `Pedido #${i + 1}
Proveedor: ${p.proveedorNombre}
Fecha: ${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}
Productos:
${p.items.map(item =>
`  - ${item.productoNombre} (Clave: ${item.productoClave})  ${item.cantidad} x $${item.precioCompra.toFixed(2)} = $${item.subtotal.toFixed(2)}`
).join('\n')}
Total del pedido: $${p.total.toFixed(2)}
------------------------------------------------`;
}).join('\n\n')}

================================================
RESUMEN
Pedidos incluidos: ${reporte.cantidadPedidos}
Productos comprados (unidades): ${reporte.cantidadProductos}
TOTAL GASTADO: $${reporte.totalCompras.toFixed(2)}
================================================
`;
    }

    descargarReporteCompras(reporte) {
        const contenido = this.generarTextoReporteCompras(reporte);
        const blob = new Blob([contenido], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const fecha = new Date();

        a.href     = url;
        a.download = `REPORTE_COMPRAS_${fecha.getDate()}-${fecha.getMonth()+1}-${fecha.getFullYear()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this._auditoria?.registrar('PEDIDO_REPORTE_EXPORTADO', {
            titulo:  reporte.titulo,
            pedidos: reporte.cantidadPedidos,
            total:   `$${reporte.totalCompras.toFixed(2)}`
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TICKET INDIVIDUAL DE PEDIDO
    // ═══════════════════════════════════════════════════════════════

    generarTicketPedido(pedido) {
        const fecha = new Date(pedido.fechaCompletado || pedido.fechaCreacion);

        return `======= PEDIDO A PROVEEDOR =======
Proveedor: ${pedido.proveedorNombre}
Fecha: ${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}
${pedido.completado ? `Estado: COMPLETADO\nFecha completado: ${new Date(pedido.fechaCompletado).toLocaleDateString()}` : 'Estado: PENDIENTE'}

PRODUCTOS:
${pedido.items.map(item =>
`${item.productoNombre} (Clave: ${item.productoClave})
  Cantidad: ${item.cantidad} x $${item.precioCompra.toFixed(2)} = $${item.subtotal.toFixed(2)}`
).join('\n')}

================================
TOTAL: $${pedido.total.toFixed(2)}
================================
`;
    }

    descargarTicketPedido(pedido) {
        const contenido = this.generarTicketPedido(pedido);
        const blob = new Blob([contenido], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fecha = new Date(pedido.fechaCompletado || pedido.fechaCreacion);

        a.href = url;
        a.download = `PEDIDO_${pedido.proveedorNombre.replace(/\s+/g, '_')}_${fecha.getDate()}-${fecha.getMonth() + 1}-${fecha.getFullYear()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}