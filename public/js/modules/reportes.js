// reportes.js - Módulo optimizado para generación de reportes

export class ReportesManager {
    constructor(ventasManager) {
        this.ventasManager = ventasManager;
    }

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
}