// fechasUtil.js - Utilidades de filtrado por periodo, compartidas entre
// reportes de ventas, reportes de compras a proveedores y el reporte de
// entradas/salidas (flujo de caja).

export function filtrarPorPeriodo(items, tipo, parametros = {}, obtenerFecha = (item) => item.fecha) {
    const ahora = new Date();

    switch (tipo) {
        case 'diario':
            return items.filter(i => new Date(obtenerFecha(i)).toDateString() === ahora.toDateString());

        case 'semanal': {
            const semanaAtras = new Date(ahora);
            semanaAtras.setDate(ahora.getDate() - 7);
            return items.filter(i => {
                const f = new Date(obtenerFecha(i));
                return f >= semanaAtras && f <= ahora;
            });
        }

        case 'mensual':
            return items.filter(i => {
                const f = new Date(obtenerFecha(i));
                return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
            });

        case 'anual':
            return items.filter(i => new Date(obtenerFecha(i)).getFullYear() === ahora.getFullYear());

        case 'fecha': {
            if (!parametros.fecha) return [];
            const objetivo = new Date(parametros.fecha);
            return items.filter(i => new Date(obtenerFecha(i)).toDateString() === objetivo.toDateString());
        }

        case 'rango': {
            if (!parametros.fechaInicio || !parametros.fechaFin) return [];
            const ini = new Date(parametros.fechaInicio);
            const fin = new Date(parametros.fechaFin);
            fin.setHours(23, 59, 59, 999);
            return items.filter(i => {
                const f = new Date(obtenerFecha(i));
                return f >= ini && f <= fin;
            });
        }

        case 'mes-especifico':
            return items.filter(i => {
                const f = new Date(obtenerFecha(i));
                return f.getMonth() === parseInt(parametros.mes) && f.getFullYear() === parseInt(parametros.año);
            });

        case 'año-especifico':
            return items.filter(i => new Date(obtenerFecha(i)).getFullYear() === parseInt(parametros.año));

        case 'todos':
            return [...items];

        default:
            return [...items];
    }
}

export function tituloPeriodo(tipo, parametros = {}) {
    const titulos = {
        'diario':  'Hoy',
        'semanal': 'Última Semana',
        'mensual': 'Este Mes',
        'anual':   'Este Año',
        'todos':   'Todo el Historial'
    };
    if (titulos[tipo]) return titulos[tipo];
    if (tipo === 'fecha' && parametros.fecha) return `Del ${new Date(parametros.fecha).toLocaleDateString()}`;
    if (tipo === 'rango' && parametros.fechaInicio && parametros.fechaFin) {
        return `Del ${new Date(parametros.fechaInicio).toLocaleDateString()} al ${new Date(parametros.fechaFin).toLocaleDateString()}`;
    }
    if (tipo === 'mes-especifico' && parametros.mes !== undefined && parametros.año) {
        const nombreMes = new Date(parametros.año, parametros.mes, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
        return `De ${nombreMes}`;
    }
    if (tipo === 'año-especifico' && parametros.año) return `Del año ${parametros.año}`;
    return 'Periodo seleccionado';
}