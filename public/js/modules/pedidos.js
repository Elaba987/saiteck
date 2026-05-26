// pedidos.js - Módulo para gestión de listas de pedidos a proveedores

import { StorageManager } from './storage.js';

export class PedidosManager {
    constructor() {
        this.pedidos = [];
        this.unsubscribe = null;
    }

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

    obtenerFrecuentes() {
        return this.pedidos.filter(p => p.esFrecuente && !p.completado);
    }

    obtenerCompletados() {
        return this.pedidos.filter(p => p.completado);
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
            esFrecuente: false,
            completado: false,
            fechaCreacion: new Date().toISOString(),
            total: this.calcularTotal(items)
        };

        const resultado = await StorageManager.add('pedidos', nuevoPedido);

        if (resultado.success) {
            return { success: true, pedido: { ...nuevoPedido, id: resultado.id } };
        }

        return { success: false, message: 'Error al crear pedido' };
    }

    async agregarItem(pedidoId, item) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        if (pedido.completado) {
            return { success: false, message: 'No se pueden modificar pedidos completados' };
        }

        // Verificar si el producto ya existe en el pedido
        const itemExistente = pedido.items.find(i => i.productoClave === item.productoClave);
        
        let nuevosItems;
        if (itemExistente) {
            // Actualizar cantidad
            nuevosItems = pedido.items.map(i => 
                i.productoClave === item.productoClave
                    ? { ...i, cantidad: i.cantidad + parseInt(item.cantidad), subtotal: (i.cantidad + parseInt(item.cantidad)) * i.precioCompra }
                    : i
            );
        } else {
            // Agregar nuevo item
            nuevosItems = [...pedido.items, {
                productoId: item.productoId,
                productoClave: item.productoClave,
                productoNombre: item.productoNombre,
                cantidad: parseInt(item.cantidad),
                precioCompra: parseFloat(item.precioCompra),
                subtotal: parseFloat(item.precioCompra) * parseInt(item.cantidad)
            }];
        }

        const nuevoTotal = nuevosItems.reduce((sum, i) => sum + i.subtotal, 0);

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            items: nuevosItems,
            total: nuevoTotal,
            fechaModificacion: new Date().toISOString()
        });

        if (resultado.success) {
            return { success: true, items: nuevosItems };
        }

        return { success: false, message: 'Error al agregar item' };
    }

    async actualizarCantidadItem(pedidoId, productoClave, nuevaCantidad) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        if (pedido.completado) {
            return { success: false, message: 'No se pueden modificar pedidos completados' };
        }

        const nuevosItems = pedido.items.map(item => 
            item.productoClave === productoClave
                ? { ...item, cantidad: parseInt(nuevaCantidad), subtotal: parseInt(nuevaCantidad) * item.precioCompra }
                : item
        );

        const nuevoTotal = nuevosItems.reduce((sum, i) => sum + i.subtotal, 0);

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            items: nuevosItems,
            total: nuevoTotal,
            fechaModificacion: new Date().toISOString()
        });

        if (resultado.success) {
            return { success: true, items: nuevosItems };
        }

        return { success: false, message: 'Error al actualizar cantidad' };
    }

    async eliminarItem(pedidoId, productoClave) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        if (pedido.completado) {
            return { success: false, message: 'No se pueden modificar pedidos completados' };
        }

        const nuevosItems = pedido.items.filter(item => item.productoClave !== productoClave);
        
        if (nuevosItems.length === 0) {
            // Si no quedan items, eliminar el pedido
            return await this.eliminarPedido(pedidoId);
        }

        const nuevoTotal = nuevosItems.reduce((sum, i) => sum + i.subtotal, 0);

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            items: nuevosItems,
            total: nuevoTotal,
            fechaModificacion: new Date().toISOString()
        });

        if (resultado.success) {
            return { success: true, items: nuevosItems };
        }

        return { success: false, message: 'Error al eliminar item' };
    }

    async marcarComoFrecuente(pedidoId, esFrecuente) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            esFrecuente: esFrecuente
        });

        if (resultado.success) {
            return { success: true, message: esFrecuente ? 'Lista marcada como frecuente' : 'Lista desmarcada como frecuente' };
        }

        return { success: false, message: 'Error al actualizar pedido' };
    }

    async completarPedido(pedidoId) {
        const pedido = this.obtenerPorId(pedidoId);
        if (!pedido) {
            return { success: false, message: 'Pedido no encontrado' };
        }

        if (pedido.completado) {
            return { success: false, message: 'Este pedido ya está completado' };
        }

        const resultado = await StorageManager.update('pedidos', pedidoId, {
            completado: true,
            fechaCompletado: new Date().toISOString()
        });

        if (resultado.success) {
            return { success: true, pedido: { ...pedido, completado: true, fechaCompletado: new Date().toISOString() } };
        }

        return { success: false, message: 'Error al completar pedido' };
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

${pedido.esFrecuente ? '⭐ Lista frecuente' : ''}
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