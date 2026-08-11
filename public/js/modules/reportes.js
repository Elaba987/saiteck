// reportes.js - Módulo optimizado para generación de reportes

import { filtrarPorPeriodo, tituloPeriodo } from './fechasUtil.js';

export class ReportesManager {
    constructor(ventasManager, pedidosManager = null) {
        this.ventasManager  = ventasManager;
        this.pedidosManager = pedidosManager;
    }

    setPedidosManager(mgr) { this.pedidosManager = mgr; }

    generarReporte(tipo, parametros = {}) {
        const generadores = {
            'diario':          () => this.generarReporteDiario(),
            'semanal':         () => this.generarReporteSemanal(),
            'mensual':         () => this.generarReporteMensual(),
            'anual':           () => this.generarReporteAnual(),
            'fecha':           () => this.generarReporteFechaEspecifica(parametros.fecha),
            'rango':           () => this.generarReporteRango(parametros.fechaInicio, parametros.fechaFin),
            'mes-especifico':  () => this.generarReporteMesEspecifico(parametros.mes, parametros.año),
            'año-especifico':  () => this.generarReporteAñoEspecifico(parametros.año)
        };

        return generadores[tipo] ? generadores[tipo]() : null;
    }

    crearReporte(titulo, ventas) {
        return {
            titulo,
            ventas,
            cantidadVentas: ventas.length,
            totalVentas:  this.calcularTotal(ventas),
            totalCostos:  this.calcularCostos(ventas),
            ganancia:     this.calcularGanancia(ventas)
        };
    }

    // ─── GENERADORES ─────────────────────────────────────────────────────

    generarReporteDiario() {
        const ahora = new Date();
        const ventasFiltradas = this.ventasManager.obtenerVentasPorFecha(ahora);
        return this.crearReporte('Ventas del Día', ventasFiltradas);
    }

    generarReporteSemanal() {
        const ahora = new Date();
        const semanaAtras = new Date(ahora);
        semanaAtras.setDate(ahora.getDate() - 7);
        const ventasFiltradas = this.ventasManager.obtenerVentasPorRango(semanaAtras, ahora);
        return this.crearReporte('Ventas de la Semana', ventasFiltradas);
    }

    generarReporteMensual() {
        const ahora  = new Date();
        const ventas = this.ventasManager.obtenerTodas();
        const ventasFiltradas = ventas.filter(v => {
            const fv = new Date(v.fecha);
            return fv.getMonth()     === ahora.getMonth() &&
                   fv.getFullYear()  === ahora.getFullYear();
        });
        return this.crearReporte('Ventas del Mes', ventasFiltradas);
    }

    generarReporteAnual() {
        const ahora  = new Date();
        const ventas = this.ventasManager.obtenerTodas();
        const ventasFiltradas = ventas.filter(v =>
            new Date(v.fecha).getFullYear() === ahora.getFullYear()
        );
        return this.crearReporte('Ventas del Año', ventasFiltradas);
    }

    generarReporteFechaEspecifica(fecha) {
        const ventasFiltradas = this.ventasManager.obtenerVentasPorFecha(new Date(fecha));
        return this.crearReporte(
            `Ventas del ${new Date(fecha).toLocaleDateString()}`,
            ventasFiltradas
        );
    }

    generarReporteRango(fechaInicio, fechaFin) {
        const ventasFiltradas = this.ventasManager.obtenerVentasPorRango(
            new Date(fechaInicio),
            new Date(fechaFin)
        );
        return this.crearReporte(
            `Ventas del ${new Date(fechaInicio).toLocaleDateString()} al ${new Date(fechaFin).toLocaleDateString()}`,
            ventasFiltradas
        );
    }

    generarReporteMesEspecifico(mes, año) {
        const ventas = this.ventasManager.obtenerTodas();
        const ventasFiltradas = ventas.filter(v => {
            const fv = new Date(v.fecha);
            return fv.getMonth()    === parseInt(mes) &&
                   fv.getFullYear() === parseInt(año);
        });
        const nombreMes = new Date(año, mes, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
        return this.crearReporte(`Ventas de ${nombreMes}`, ventasFiltradas);
    }

    generarReporteAñoEspecifico(año) {
        const ventas = this.ventasManager.obtenerTodas();
        const ventasFiltradas = ventas.filter(v =>
            new Date(v.fecha).getFullYear() === parseInt(año)
        );
        return this.crearReporte(`Ventas del año ${año}`, ventasFiltradas);
    }

    // ─── CÁLCULOS FINANCIEROS ─────────────────────────────────────────────

    calcularTotal(ventas) {
        return ventas.reduce((sum, v) => sum + v.total, 0);
    }

    /**
     * Calcula el costo total de un conjunto de ventas.
     *
     * CORRECCIÓN GRANEL:
     * Para ítems a granel usa `item.costoGranel` (costo proporcional guardado
     * al momento de crear el ítem). Si no existe el campo (ventas antiguas),
     * recalcula: precioCompra/kg × (gramos / 1000).
     * Para productos normales: precioCompra × cantidad (sin cambios).
     */
    calcularCostos(ventas) {
        return ventas.reduce((sum, v) => {
            const costoVenta = v.items.reduce((itemSum, item) => {
                if (item.esGranel) {
                    const costo = (item.costoGranel != null)
                        ? item.costoGranel
                        : (item.producto.precioCompra || 0) * ((item.gramos || 0) / 1000);
                    return itemSum + costo;
                }
                return itemSum + ((item.producto.precioCompra || 0) * item.cantidad);
            }, 0);
            return sum + costoVenta;
        }, 0);
    }

    calcularGanancia(ventas) {
        return this.calcularTotal(ventas) - this.calcularCostos(ventas);
    }

    /**
     * Desglose de ganancia por producto.
     * Para granel acumula gramos en cantidadVendida y usa costoGranel proporcional.
     */
    obtenerGananciaPorProducto(ventas) {
        const productos = {};

        ventas.forEach(venta => {
            venta.items.forEach(item => {
                const clave = item.producto.clave;
                if (!productos[clave]) {
                    productos[clave] = {
                        clave,
                        nombre:          item.producto.nombre,
                        cantidadVendida: 0,
                        totalVentas:     0,
                        totalCostos:     0,
                        ganancia:        0,
                        esGranel:        item.esGranel || false
                    };
                }

                if (item.esGranel) {
                    productos[clave].cantidadVendida += item.gramos || 0;
                    const costo = (item.costoGranel != null)
                        ? item.costoGranel
                        : (item.producto.precioCompra || 0) * ((item.gramos || 0) / 1000);
                    productos[clave].totalCostos += costo;
                } else {
                    productos[clave].cantidadVendida += item.cantidad;
                    productos[clave].totalCostos += (item.producto.precioCompra || 0) * item.cantidad;
                }

                productos[clave].totalVentas += item.subtotal;
                productos[clave].ganancia =
                    productos[clave].totalVentas - productos[clave].totalCostos;
            });
        });

        return Object.values(productos);
    }

    ordenarProductosPorVentas(ventas, orden = 'mayor') {
        const productos  = this.obtenerGananciaPorProducto(ventas);
        const comparador = orden === 'mayor'
            ? (a, b) => b.cantidadVendida - a.cantidadVendida
            : (a, b) => a.cantidadVendida - b.cantidadVendida;
        return productos.sort(comparador);
    }

    // ═══════════════════════════════════════════════════════════════
    // REPORTE DE ENTRADAS Y SALIDAS (flujo de caja)
    //
    // ── LÓGICA DE MOVIMIENTOS DE DINERO ──────────────────────────────
    // Entradas: dinero físico/electrónico que efectivamente entra a caja.
    //   - Venta en efectivo → entra lo que el CLIENTE PAGA EN MANO (`pago`),
    //     no el total de la venta (eso vendría después, neto de cambio).
    //   - Venta con tarjeta  → entra el total cobrado (no hay cambio).
    //
    // Salidas: dinero que sale de caja.
    //   - Cambio entregado en ventas de efectivo (`cambio`).
    //   - Pagos a proveedores: total de los PEDIDOS COMPLETADOS en el
    //     periodo (usa el precio real pagado en cada recepción, que vive
    //     únicamente en el pedido — ver pedidos.js).
    //
    // Con esto, matemáticamente: Entradas − Salidas = Σ(total de ventas)
    // − Σ(pagos a proveedores). El bug anterior restaba el cambio de un
    // total que YA estaba neto de cambio (`venta.total`), descontándolo
    // dos veces y dando un Neto artificialmente bajo.
    //
    // ── GANANCIA NETA vs FLUJO NETO — NO SON LO MISMO ────────────────
    // Ganancia Neta (margen contable) = Ingresos por ventas − Costo de
    // la mercancía VENDIDA (precio de compra congelado al momento de
    // cada venta). Es una medida de rentabilidad, sin importar cuándo se
    // pagó esa mercancía al proveedor.
    //
    // Flujo Neto (caja) = Entradas − Salidas de efectivo/tarjeta de ESTE
    // periodo, incluyendo pagos a proveedores que pueden corresponder a
    // mercancía comprada para vender en OTRO periodo (o que ni se ha
    // vendido todavía).
    //
    // Por diseño pueden diferir: se muestran juntas, con la nota arriba,
    // en vez de forzarlas a coincidir.
    // ═══════════════════════════════════════════════════════════════

    generarReporteFlujo(tipo, parametros = {}) {
        const ventas  = filtrarPorPeriodo(this.ventasManager.obtenerTodas(), tipo, parametros, v => v.fecha);
        const compras = this.pedidosManager
            ? filtrarPorPeriodo(this.pedidosManager.obtenerCompletados(), tipo, parametros, p => p.fechaCompletado || p.fechaCreacion)
            : [];

        // Entradas: pago en mano (efectivo) o total (tarjeta).
        // Con datos antiguos sin `pago` guardado, se usa total como respaldo.
        const entradas = ventas.reduce((sum, v) => {
            if (v.metodoPago === 'efectivo') return sum + (v.pago ?? v.total);
            return sum + v.total;
        }, 0);

        const salidasCambio    = ventas.reduce((sum, v) =>
            sum + (v.metodoPago === 'efectivo' ? (v.cambio || 0) : 0), 0);
        const salidasProveedor = compras.reduce((sum, p) => sum + p.total, 0);
        const salidas = salidasCambio + salidasProveedor;

        // Para contexto: ganancia neta (margen contable) del mismo periodo.
        const totalVentas  = this.calcularTotal(ventas);
        const costoVentas   = this.calcularCostos(ventas);
        const gananciaNeta  = totalVentas - costoVentas;

        return {
            titulo:  `Entradas y Salidas — ${tituloPeriodo(tipo, parametros)}`,
            entradas,
            salidasProveedor,
            salidasCambio,
            salidas,
            neto: entradas - salidas,
            totalVentas,
            gananciaNeta,
            cantidadVentas:  ventas.length,
            cantidadCompras: compras.length,
            ventas,
            compras
        };
    }
}