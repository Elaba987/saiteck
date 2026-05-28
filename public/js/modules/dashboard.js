// dashboard.js - Panel de control con alertas de stock y próximas visitas

export class DashboardManager {
    constructor(productosManager, proveedoresManager, ventasManager) {
        this.productosManager   = productosManager;
        this.proveedoresManager = proveedoresManager;
        this.ventasManager      = ventasManager;
    }

    // ─── ESTADÍSTICAS RÁPIDAS ────────────────────────────────────────────
    obtenerEstadisticas() {
        return {
            ventasHoy:          this.calcularVentasHoy(),
            gananciaNeta:       this.calcularGananciaNeta(),
            proveedoresHoy:     this.proveedoresManager.obtenerProveedoresHoy().length,
            productosBajoStock: this.productosManager.obtenerBajoStock(5).length
        };
    }

    calcularVentasHoy() {
        const hoy       = new Date();
        const ventasHoy = this.ventasManager.obtenerVentasPorFecha(hoy);
        return ventasHoy.reduce((sum, v) => sum + v.total, 0);
    }

    calcularGananciaNeta() {
        const hoy       = new Date();
        const ventasHoy = this.ventasManager.obtenerVentasPorFecha(hoy);
        const ingresos  = ventasHoy.reduce((sum, v) => sum + v.total, 0);
        const costos    = ventasHoy.reduce((sum, v) => {
            const costoVenta = v.items.reduce((s, item) => {
                if (item.esGranel) {
                    const costo = (item.costoGranel != null)
                        ? item.costoGranel
                        : (item.producto.precioCompra || 0) * ((item.gramos || 0) / 1000);
                    return s + costo;
                }
                return s + ((item.producto.precioCompra || 0) * item.cantidad);
            }, 0);
            return sum + costoVenta;
        }, 0);
        return ingresos - costos;
    }

    // ─── RENDER PRINCIPAL ────────────────────────────────────────────────
    renderizar(contenedor) {
        const stats = this.obtenerEstadisticas();
        const meta  = window.configuracionManager?.obtenerMetaVentasDiaria() || 0;

        // ── Cards de estadísticas ──
        contenedor.innerHTML = `
            <div class="stat-card" data-section="reportes" style="cursor:pointer;">
                <h4>Ventas Hoy</h4>
                <div class="stat-value">$${stats.ventasHoy.toFixed(2)}</div>
            </div>
            <div class="stat-card" style="background:linear-gradient(135deg,#48bb78 0%,#38a169 100%);">
                <h4>Ganancia Neta Hoy</h4>
                <div class="stat-value">$${stats.gananciaNeta.toFixed(2)}</div>
            </div>
            <div class="stat-card" data-section="proveedores" style="cursor:pointer;">
                <h4>Proveedores Hoy</h4>
                <div class="stat-value">${stats.proveedoresHoy}</div>
            </div>
            <div class="stat-card" data-section="productos" style="cursor:pointer;">
                <h4>Bajo Stock</h4>
                <div class="stat-value">${stats.productosBajoStock}</div>
            </div>
        `;

        // ── Barra de meta de ventas ──
        this._renderizarBarraMeta(stats.ventasHoy, meta);

        // ── Botón descargar inventario ──
        this._renderizarBotonInventario();

        // ── Alertas y próximas visitas ──
        this.renderizarAlertasStock();
        this.renderizarProximasVisitas();
    }

    // ─── BARRA DE PROGRESO DE META ───────────────────────────────────────
    _renderizarBarraMeta(ventasHoy, meta) {
        const contenedor = document.getElementById('dashboardMetaVentas');
        if (!contenedor) return;

        if (meta <= 0) {
            contenedor.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <span style="color:#718096;font-size:14px;">
                        💡 Sin meta diaria configurada —
                        <a href="#" id="linkIrConfigMeta"
                           style="color:var(--color-primario);font-weight:600;text-decoration:none;">
                            Definir una meta
                        </a>
                    </span>
                </div>`;

            document.getElementById('linkIrConfigMeta')?.addEventListener('click', (e) => {
                e.preventDefault();
                window.appInstance?.uiManager.mostrarSeccion('configuracion');
            });
            return;
        }

        const porcentaje  = Math.min((ventasHoy / meta) * 100, 100);
        const completada  = ventasHoy >= meta;
        const falta       = Math.max(meta - ventasHoy, 0);

        // Color dinámico: rojo → amarillo → verde
        let colorBarra;
        if (porcentaje < 40)      colorBarra = 'var(--color-peligro)';
        else if (porcentaje < 75) colorBarra = 'var(--color-advertencia)';
        else                       colorBarra = 'var(--color-exito)';

        contenedor.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                <div>
                    <span style="font-weight:700;color:#2d3748;font-size:15px;">
                        🎯 Meta diaria de ventas
                    </span>
                    <span style="margin-left:10px;font-size:13px;color:#718096;">
                        Meta: <strong>$${meta.toFixed(2)}</strong>
                    </span>
                </div>
                <span style="font-size:14px;font-weight:700;color:${colorBarra};">
                    ${completada
                        ? '✅ ¡Meta alcanzada!'
                        : `Faltan $${falta.toFixed(2)}`}
                </span>
            </div>
            <div style="background:#e2e8f0;border-radius:999px;height:18px;overflow:hidden;position:relative;">
                <div id="barraMetaFill" style="
                    width: ${porcentaje}%;
                    height: 100%;
                    background: ${completada
                        ? 'linear-gradient(90deg,#48bb78,#38a169)'
                        : `linear-gradient(90deg,${colorBarra},${colorBarra}cc)`};
                    border-radius: 999px;
                    transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
                    position: relative;
                ">
                    ${porcentaje >= 15 ? `
                    <span style="
                        position:absolute;right:10px;top:50%;transform:translateY(-50%);
                        font-size:11px;font-weight:700;color:white;white-space:nowrap;
                    ">${porcentaje.toFixed(1)}%</span>` : ''}
                </div>
                ${porcentaje < 15 ? `
                <span style="
                    position:absolute;left:8px;top:50%;transform:translateY(-50%);
                    font-size:11px;font-weight:700;color:#4a5568;
                ">${porcentaje.toFixed(1)}%</span>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:#718096;">
                <span>$0</span>
                <span>$${(meta / 2).toFixed(0)}</span>
                <span>$${meta.toFixed(2)}</span>
            </div>
        `;

        // Animación: iniciar desde 0 y expandir
        requestAnimationFrame(() => {
            const fill = document.getElementById('barraMetaFill');
            if (fill) {
                fill.style.width = '0%';
                requestAnimationFrame(() => {
                    fill.style.width = `${porcentaje}%`;
                });
            }
        });
    }

    // ─── BOTÓN DESCARGAR INVENTARIO ──────────────────────────────────────
    _renderizarBotonInventario() {
        const contenedor = document.getElementById('dashboardBotonInventario');
        if (!contenedor) return;

        contenedor.innerHTML = `
            <button id="btnDashboardDescargaInventario" class="btn btn-success"
                style="display:inline-flex;align-items:center;gap:8px;">
                📥 Descargar Inventario Completo
            </button>
        `;

        document.getElementById('btnDashboardDescargaInventario')
            ?.addEventListener('click', () => {
                this.productosManager.descargarArchivoAlmacen();
            });
    }

    // ─── ALERTAS DE STOCK BAJO ───────────────────────────────────────────
    renderizarAlertasStock() {
        const contenedor = document.getElementById('alertasStock');
        if (!contenedor) return;

        const todos    = this.productosManager.obtenerTodos();
        const bajStock = todos.filter(p => {
            if (p.esGranel) return parseFloat(p.stock) < 1;
            return parseInt(p.stock) < 5;
        }).sort((a, b) => parseFloat(a.stock) - parseFloat(b.stock));

        if (bajStock.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:20px;color:#48bb78;">
                    <span style="font-size:32px;">✅</span>
                    <p style="margin-top:8px;font-weight:600;">Sin alertas — todo el inventario está en buen nivel</p>
                </div>`;
            return;
        }

        contenedor.innerHTML = bajStock.map(p => {
            const stockText = p.esGranel
                ? `${parseFloat(p.stock).toFixed(3)} kg`
                : `${p.stock} unidades`;
            const urgente   = p.esGranel ? parseFloat(p.stock) < 0.2 : parseInt(p.stock) <= 1;
            const color     = urgente ? '#fed7d7' : '#fef3cd';
            const borde     = urgente ? '#fc8181' : '#f6ad55';
            const icono     = urgente ? '🔴' : '🟡';
            const granelTag = p.esGranel
                ? '<span style="background:#e6f0ff;color:#667eea;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:5px;">⚖ Granel</span>'
                : '';

            return `
                <div style="display:flex;align-items:center;justify-content:space-between;
                            background:${color};border:1px solid ${borde};border-radius:8px;
                            padding:12px 16px;margin-bottom:8px;">
                    <div>
                        <span style="font-size:16px;">${icono}</span>
                        <strong style="margin-left:8px;">${p.nombre}${granelTag}</strong>
                        <small style="color:#718096;margin-left:8px;">clave: ${p.clave}</small>
                    </div>
                    <div style="font-weight:700;color:${urgente ? '#c53030' : '#c05621'};">
                        ${stockText}
                    </div>
                </div>`;
        }).join('');
    }

    // ─── PRÓXIMAS VISITAS DE PROVEEDORES ─────────────────────────────────
    renderizarProximasVisitas() {
        const contenedor = document.getElementById('proximasVisitas');
        if (!contenedor) return;

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const todos = this.proveedoresManager.obtenerTodos();

        const proximos = todos
            .filter(p => p.fechaVisita && !p.visitaRealizada)
            .map(p => {
                const [y, m, d] = p.fechaVisita.split('-').map(Number);
                const fecha     = new Date(y, m - 1, d);
                fecha.setHours(0, 0, 0, 0);
                const diffMs   = fecha - hoy;
                const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
                return { ...p, fechaObj: fecha, diffDias };
            })
            .filter(p => p.diffDias >= 0)
            .sort((a, b) => a.diffDias - b.diffDias)
            .slice(0, 10);

        if (proximos.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:20px;color:#718096;">
                    <span style="font-size:32px;">📭</span>
                    <p style="margin-top:8px;">No hay visitas próximas programadas</p>
                </div>`;
            return;
        }

        const nombresDias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const nombresMeses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

        contenedor.innerHTML = proximos.map(p => {
            const esHoy    = p.diffDias === 0;
            const esManana = p.diffDias === 1;
            const estasSem = p.diffDias > 1 && p.diffDias <= 6;

            let labelDias, colorBg, colorBorde;
            if (esHoy) {
                labelDias  = '🔵 HOY';
                colorBg    = '#ebf4ff';
                colorBorde = '#4299e1';
            } else if (esManana) {
                labelDias  = '🟡 Mañana';
                colorBg    = '#fef9e7';
                colorBorde = '#f6ad55';
            } else if (estasSem) {
                labelDias  = `en ${p.diffDias} días`;
                colorBg    = '#f7fafc';
                colorBorde = '#cbd5e0';
            } else {
                labelDias  = `${nombresDias[p.fechaObj.getDay()]} ${p.fechaObj.getDate()} ${nombresMeses[p.fechaObj.getMonth()]}`;
                colorBg    = '#f7fafc';
                colorBorde = '#e2e8f0';
            }

            let infoProgramacion = '';
            if (p.tipoReparto === 'constante' && p.diasReparto?.length > 0) {
                const diasStr = p.diasReparto.sort((a,b)=>a-b).map(d => nombresDias[d]).join(', ');
                infoProgramacion = `<small style="color:#667eea;">🔄 ${diasStr}</small>`;
            } else {
                infoProgramacion = `<small style="color:#718096;">📅 Fecha manual</small>`;
            }

            return `
                <div style="display:flex;align-items:center;justify-content:space-between;
                            background:${colorBg};border:1px solid ${colorBorde};border-radius:8px;
                            padding:12px 16px;margin-bottom:8px;">
                    <div>
                        <strong>${p.nombre}</strong>
                        <br>${infoProgramacion}
                        ${p.telefono ? `<br><small style="color:#718096;">📞 ${p.telefono}</small>` : ''}
                    </div>
                    <div style="text-align:right;min-width:90px;">
                        <div style="font-weight:700;font-size:14px;color:${esHoy ? '#2b6cb0' : '#4a5568'};">
                            ${labelDias}
                        </div>
                        <div style="font-size:12px;color:#718096;margin-top:2px;">
                            ${p.fechaObj.getDate()} ${nombresMeses[p.fechaObj.getMonth()]}
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
}