// productos.js - Módulo para gestión de productos con Firestore

import { StorageManager, STORAGE_KEYS } from './storage.js';

export class ProductosManager {
    constructor() {
        this.productos = [];
        this.unsubscribe = null;
    }

    async cargarProductos() {
        this.productos = await StorageManager.loadAll(STORAGE_KEYS.PRODUCTOS);
        return this.productos;
    }

    iniciarEscucha(callback) {
        this.unsubscribe = StorageManager.onSnapshot(STORAGE_KEYS.PRODUCTOS, (productos) => {
            this.productos = productos;
            if (callback) callback(productos);
        });
    }

    detenerEscucha() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    obtenerTodos() {
        return this.productos;
    }

    obtenerPorClave(clave) {
        return this.productos.find(p => p.clave === parseInt(clave));
    }

    obtenerPorId(id) {
        return this.productos.find(p => p.id === id);
    }

    existeClave(clave, excluirId = null) {
        return this.productos.some(p =>
            p.clave === parseInt(clave) && p.id !== excluirId
        );
    }

    async agregar(producto) {
        if (this.existeClave(producto.clave)) {
            return { success: false, message: 'Clave en uso' };
        }

        const esGranel = producto.esGranel === true || producto.esGranel === 'true';

        const nuevoProducto = {
            clave: parseInt(producto.clave),
            nombre: producto.nombre,
            precioCompra: parseFloat(producto.precioCompra),
            precioVenta: parseFloat(producto.precioVenta),
            stock: parseFloat(producto.stock),          // kg si es granel, unidades si no
            esGranel: esGranel
        };

        // Campos adicionales para granel
        if (esGranel) {
            // precioVenta es el precio por kg, stock es en kg
            nuevoProducto.precioKilo = parseFloat(producto.precioVenta);
        }

        const resultado = await StorageManager.add(STORAGE_KEYS.PRODUCTOS, nuevoProducto);

        if (resultado.success) {
            return { success: true, message: 'Producto registrado exitosamente' };
        }

        return { success: false, message: 'Error al registrar producto' };
    }

    async actualizar(productoId, datos) {
        const producto = this.obtenerPorId(productoId);
        if (!producto) {
            return { success: false, message: 'Producto no encontrado' };
        }

        const claveNueva = datos.clave ? parseInt(datos.clave) : producto.clave;

        if (claveNueva !== producto.clave && this.existeClave(claveNueva, productoId)) {
            return { success: false, message: 'La nueva clave ya está en uso por otro producto' };
        }

        const esGranel = datos.esGranel === true || datos.esGranel === 'true';

        const datosActualizados = {
            clave: claveNueva,
            nombre: datos.nombre || producto.nombre,
            precioCompra: datos.precioCompra !== undefined ? parseFloat(datos.precioCompra) : producto.precioCompra,
            precioVenta: datos.precioVenta !== undefined ? parseFloat(datos.precioVenta) : producto.precioVenta,
            stock: datos.stock !== undefined ? parseFloat(datos.stock) : producto.stock,
            esGranel: esGranel
        };

        if (esGranel) {
            datosActualizados.precioKilo = parseFloat(datos.precioVenta || producto.precioVenta);
        }

        const resultado = await StorageManager.update(STORAGE_KEYS.PRODUCTOS, productoId, datosActualizados);

        if (resultado.success) {
            return { success: true, message: 'Producto actualizado' };
        }

        return { success: false, message: 'Error al actualizar producto' };
    }

    async eliminar(productoId) {
        const resultado = await StorageManager.delete(STORAGE_KEYS.PRODUCTOS, productoId);

        if (resultado.success) {
            return { success: true, message: 'Producto eliminado' };
        }

        return { success: false, message: 'Error al eliminar producto' };
    }

    buscar(termino) {
        const busqueda = termino.toLowerCase();
        return this.productos.filter(p =>
            p.nombre.toLowerCase().includes(busqueda) ||
            p.clave.toString().includes(busqueda)
        );
    }

    ordenar(criterio) {
        const ordenadores = {
            'mayor': (a, b) => b.stock - a.stock,
            'menor': (a, b) => a.stock - b.stock,
            'az': (a, b) => a.nombre.localeCompare(b.nombre),
            'za': (a, b) => b.nombre.localeCompare(a.nombre)
        };

        return ordenadores[criterio] ? [...this.productos].sort(ordenadores[criterio]) : [...this.productos];
    }

    obtenerBajoStock(umbral = 5) {
        return this.productos.filter(p => {
            if (p.esGranel) {
                // Para granel, umbral es en kg (ej: menos de 1 kg)
                return p.stock < 1;
            }
            return p.stock < umbral;
        });
    }

    async reducirStock(clave, cantidad) {
        const producto = this.obtenerPorClave(clave);
        if (!producto) {
            return { success: false, message: 'Producto no encontrado' };
        }

        // Para granel: cantidad viene en gramos, convertir a kg
        const reduccion = producto.esGranel ? (cantidad / 1000) : cantidad;

        if (producto.stock < reduccion) {
            return { success: false, message: 'Stock insuficiente' };
        }

        const nuevoStock = parseFloat((producto.stock - reduccion).toFixed(3));
        const resultado = await StorageManager.update(STORAGE_KEYS.PRODUCTOS, producto.id, {
            stock: nuevoStock
        });

        if (resultado.success) {
            return { success: true, producto: { ...producto, stock: nuevoStock } };
        }

        return { success: false, message: 'Error al actualizar stock' };
    }

    generarArchivoAlmacen() {
        const totalCompra = this.productos.reduce((sum, p) => sum + (p.precioCompra * p.stock), 0);
        const totalVenta = this.productos.reduce((sum, p) => sum + (p.precioVenta * p.stock), 0);

        return `INVENTARIO COMPLETO DE ALMACÉN
Generado el: ${new Date().toLocaleString()}
================================================

${this.productos.map((p, i) => {
    const margen = p.precioVenta - p.precioCompra;
    const porcentaje = p.precioCompra > 0 ? ((margen / p.precioCompra) * 100).toFixed(1) : '0.0';
    const tipoStock = p.esGranel ? `${p.stock.toFixed(3)} kg` : `${p.stock} unidades`;
    const tipoPrecio = p.esGranel ? `$${p.precioVenta.toFixed(2)}/kg` : `$${p.precioVenta.toFixed(2)}`;

    return `Producto #${i + 1}${p.esGranel ? ' [GRANEL]' : ''}
Clave: ${p.clave}
Nombre: ${p.nombre}
Precio Compra: $${p.precioCompra.toFixed(2)}${p.esGranel ? '/kg' : ''}
Precio Venta: ${tipoPrecio}
Stock: ${tipoStock}
Margen: $${margen.toFixed(2)} (${porcentaje}%)
------------------------------------------------`;
}).join('\n')}

RESUMEN:
Total de productos: ${this.productos.length}
Productos a granel: ${this.productos.filter(p => p.esGranel).length}
Valor de inventario (compra): $${totalCompra.toFixed(2)}
Valor de inventario (venta): $${totalVenta.toFixed(2)}
`;
    }

    descargarArchivoAlmacen() {
        const contenido = this.generarArchivoAlmacen();
        const blob = new Blob([contenido], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fecha = new Date();

        a.href = url;
        a.download = `ALMACEN_${fecha.getDate()}-${fecha.getMonth() + 1}-${fecha.getFullYear()}_${fecha.getHours()}-${fecha.getMinutes()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}