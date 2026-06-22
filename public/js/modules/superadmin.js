// superadmin.js - Panel de Administración Supremo (multi-sucursal)
// Permite ver reportes, auditoría y configuración de TODAS las sucursales

export class SuperAdminManager {
    constructor(sucursalesManager, reportesManager, auditoriaManager) {
        this.sucursalesManager = sucursalesManager;
        this.reportesManager   = reportesManager;
        this.auditoriaManager  = auditoriaManager;

        this._filtros = {
            sucursales: [],   // [] = todas
            periodo:    'dia',
            fechaInicio: '',
            fechaFin:    ''
        };
        this._vistaActual = 'resumen'; // 'resumen' | 'reportes' | 'auditoria' | 'config'
    }

    // ─── DATOS AGREGADOS ─────────────────────────────────────────────────

    async obtenerVentasAgregadas(sucursalIds, periodo) {
        const todas = [];
        const sucIds = sucursalIds.length > 0
            ? sucursalIds
            : this.sucursalesManager.obtenerTodas()
                .filter(s => !s.eliminada && s.activa)
                .map(s => s.id);

        for (const sid of sucIds) {
            try {
                const snap = await window.db
                    .collection('users').doc(window.currentUser.uid)
                    .collection('sucursales').doc(sid)
                    .collection('ventas')
                    .orderBy('updatedAt', 'desc').limit(1000).get();

                const ventas = snap.docs.map(d => ({
                    ...d.data(),
                    id: d.id,
                    _sucursalId:     sid,
                    _sucursalNombre: this.sucursalesManager.obtenerPorId(sid)?.nombre || sid
                }));
                todas.push(...ventas);
            } catch (err) {
                console.warn(`[SuperAdmin] No se pudieron leer ventas de ${sid}:`, err);
            }
        }

        return this._filtrarPorPeriodo(todas, periodo);
    }

    async obtenerAuditoriaAgregada(sucursalIds, filtros = {}) {
        // La auditoría ya está en el nivel raíz del usuario, marcada con usuario y sucursal
        // Se filtra por el campo _sucursalId que añadimos al registrar
        const registros = this.auditoriaManager.obtenerTodos();

        let resultado = [...registros];

        if (sucursalIds.length > 0) {
            resultado = resultado.filter(r =>
                sucursalIds.includes(r._sucursalId || r.sucursalId)
            );
        }

        // Filtros de periodo
        if (filtros.periodo) {
            resultado = this._filtrarRegistrosPorPeriodo(resultado, filtros.periodo, filtros);
        }

        return resultado;
    }

    async obtenerResumenPorSucursal() {
        const sucursales = this.sucursalesManager.obtenerTodas().filter(s => !s.eliminada);
        const resumen    = [];

        for (const s of sucursales) {
            const stats = await this.sucursalesManager.obtenerEstadisticasSucursal(s.id);
            resumen.push({ ...s, stats });
        }

        return resumen;
    }

    // ─── FILTROS ─────────────────────────────────────────────────────────

    _filtrarPorPeriodo(ventas, periodo, opciones = {}) {
        const ahora = new Date();

        if (periodo === 'dia') {
            return ventas.filter(v => new Date(v.fecha).toDateString() === ahora.toDateString());
        }
        if (periodo === 'semana') {
            const hace7 = new Date(ahora); hace7.setDate(ahora.getDate() - 7);
            return ventas.filter(v => new Date(v.fecha) >= hace7);
        }
        if (periodo === 'mes') {
            return ventas.filter(v => {
                const f = new Date(v.fecha);
                return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
            });
        }
        if (periodo === 'año') {
            return ventas.filter(v => new Date(v.fecha).getFullYear() === ahora.getFullYear());
        }
        if (periodo === 'rango' && opciones.fechaInicio && opciones.fechaFin) {
            const ini = new Date(opciones.fechaInicio + 'T00:00:00');
            const fin = new Date(opciones.fechaFin   + 'T23:59:59');
            return ventas.filter(v => { const f = new Date(v.fecha); return f >= ini && f <= fin; });
        }
        return ventas;
    }

    _filtrarRegistrosPorPeriodo(registros, periodo, opciones = {}) {
        const ahora = new Date();
        if (periodo === 'dia') {
            return registros.filter(r => new Date(r.fecha).toDateString() === ahora.toDateString());
        }
        if (periodo === 'semana') {
            const hace7 = new Date(ahora); hace7.setDate(ahora.getDate() - 7);
            return registros.filter(r => new Date(r.fecha) >= hace7);
        }
        if (periodo === 'mes') {
            return registros.filter(r => {
                const f = new Date(r.fecha);
                return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
            });
        }
        if (periodo === 'rango' && opciones.fechaInicio && opciones.fechaFin) {
            const ini = new Date(opciones.fechaInicio + 'T00:00:00');
            const fin = new Date(opciones.fechaFin   + 'T23:59:59');
            return registros.filter(r => { const f = new Date(r.fecha); return f >= ini && f <= fin; });
        }
        return registros;
    }

    // ─── CÁLCULOS FINANCIEROS AGREGADOS ──────────────────────────────────

    calcularTotales(ventas) {
        const total   = ventas.reduce((s, v) => s + (v.total || 0), 0);
        const costos  = ventas.reduce((s, v) => {
            const c = (v.items || []).reduce((acc, item) => {
                if (item.esGranel) {
                    return acc + (item.costoGranel != null
                        ? item.costoGranel
                        : (item.producto?.precioCompra || 0) * ((item.gramos || 0) / 1000));
                }
                return acc + (item.producto?.precioCompra || 0) * (item.cantidad || 0);
            }, 0);
            return s + c;
        }, 0);

        return {
            totalVentas:    total,
            totalCostos:    costos,
            ganancianeta:   total - costos,
            cantidadVentas: ventas.length,
            promedioVenta:  ventas.length > 0 ? total / ventas.length : 0
        };
    }

    agruparPorSucursal(ventas) {
        const grupos = {};
        ventas.forEach(v => {
            const sid = v._sucursalId || 'sin-sucursal';
            if (!grupos[sid]) {
                grupos[sid] = {
                    sucursalId:     sid,
                    sucursalNombre: v._sucursalNombre || sid,
                    ventas:         []
                };
            }
            grupos[sid].ventas.push(v);
        });

        return Object.values(grupos).map(g => ({
            ...g,
            totales: this.calcularTotales(g.ventas)
        }));
    }

    // ─── RENDER PRINCIPAL ─────────────────────────────────────────────────

    async renderizar(contenedor) {
        if (!contenedor) return;

        const sucursales = this.sucursalesManager.obtenerTodas().filter(s => !s.eliminada);

        contenedor.innerHTML = `
            <div class="superadmin-wrapper">

                <!-- Header -->
                <div class="superadmin-header">
                    <div class="superadmin-header-left">
                        <span class="superadmin-icon">👑</span>
                        <div>
                            <h2 class="superadmin-title">Panel Maestro</h2>
                            <p class="superadmin-subtitle">Visión global de todas las sucursales</p>
                        </div>
                    </div>
                    <div class="superadmin-nav">
                        <button class="superadmin-nav-btn active" data-vista="resumen">📊 Resumen</button>
                        <button class="superadmin-nav-btn" data-vista="reportes">💰 Reportes</button>
                        <button class="superadmin-nav-btn" data-vista="auditoria">🛡️ Auditoría</button>
                        <button class="superadmin-nav-btn" data-vista="sucursales">🏪 Sucursales</button>
                    </div>
                </div>

                <!-- Filtros globales -->
                <div class="superadmin-filtros-bar">
                    <div class="superadmin-filtro-group">
                        <label>🏪 Sucursales</label>
                        <div class="superadmin-suc-chips" id="saFiltroSucursales">
                            <button class="sa-chip active" data-suc="todas">Todas</button>
                            ${sucursales.map(s => `
                                <button class="sa-chip" data-suc="${s.id}">${s.nombre}</button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="superadmin-filtro-group">
                        <label>📅 Periodo</label>
                        <select id="saFiltroPeriodo">
                            <option value="dia">Hoy</option>
                            <option value="semana">Última semana</option>
                            <option value="mes" selected>Este mes</option>
                            <option value="año">Este año</option>
                            <option value="rango">Rango personalizado</option>
                        </select>
                    </div>
                    <div id="saRangoFechas" class="hidden" style="display:flex;gap:10px;align-items:center;">
                        <input type="date" id="saFechaInicio" style="padding:8px;border:2px solid #e2e8f0;border-radius:8px;">
                        <span style="color:#718096;">—</span>
                        <input type="date" id="saFechaFin" style="padding:8px;border:2px solid #e2e8f0;border-radius:8px;">
                    </div>
                    <button id="saAplicarFiltros" class="btn btn-primary" style="padding:8px 20px;font-size:14px;">
                        🔍 Aplicar
                    </button>
                </div>

                <!-- Contenido dinámico -->
                <div id="saContenido" class="superadmin-contenido">
                    <div style="text-align:center;padding:60px;color:#718096;">
                        <span style="font-size:48px;">⏳</span>
                        <p style="margin-top:16px;">Cargando datos...</p>
                    </div>
                </div>
            </div>
        `;

        this._bindEventos(contenedor);
        await this._renderizarVista('resumen');
    }

    _bindEventos(contenedor) {
        // Navegación de vistas
        contenedor.querySelectorAll('.superadmin-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                contenedor.querySelectorAll('.superadmin-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._vistaActual = btn.dataset.vista;
                this._renderizarVista(btn.dataset.vista);
            });
        });

        // Chips de sucursales
        const chipsContainer = contenedor.querySelector('#saFiltroSucursales');
        if (chipsContainer) {
            chipsContainer.addEventListener('click', e => {
                const chip = e.target.closest('.sa-chip');
                if (!chip) return;
                const suc = chip.dataset.suc;
                if (suc === 'todas') {
                    chipsContainer.querySelectorAll('.sa-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    this._filtros.sucursales = [];
                } else {
                    chipsContainer.querySelector('[data-suc="todas"]').classList.remove('active');
                    chip.classList.toggle('active');
                    this._filtros.sucursales = Array.from(
                        chipsContainer.querySelectorAll('.sa-chip.active:not([data-suc="todas"])')
                    ).map(c => c.dataset.suc);
                    if (this._filtros.sucursales.length === 0) {
                        chipsContainer.querySelector('[data-suc="todas"]').classList.add('active');
                    }
                }
            });
        }

        // Filtro periodo
        const periodoSel = contenedor.querySelector('#saFiltroPeriodo');
        if (periodoSel) {
            periodoSel.addEventListener('change', () => {
                this._filtros.periodo = periodoSel.value;
                const rangoDiv = contenedor.querySelector('#saRangoFechas');
                if (rangoDiv) rangoDiv.style.display = periodoSel.value === 'rango' ? 'flex' : 'none';
            });
        }

        // Botón aplicar
        contenedor.querySelector('#saAplicarFiltros')?.addEventListener('click', () => {
            this._filtros.fechaInicio = contenedor.querySelector('#saFechaInicio')?.value || '';
            this._filtros.fechaFin    = contenedor.querySelector('#saFechaFin')?.value    || '';
            this._renderizarVista(this._vistaActual);
        });
    }

    async _renderizarVista(vista) {
        const contenedor = document.getElementById('saContenido');
        if (!contenedor) return;

        contenedor.innerHTML = `<div style="text-align:center;padding:60px;color:#718096;"><span style="font-size:48px;">⏳</span><p style="margin-top:16px;">Cargando...</p></div>`;

        try {
            if (vista === 'resumen')    await this._renderResumen(contenedor);
            if (vista === 'reportes')   await this._renderReportes(contenedor);
            if (vista === 'auditoria')  await this._renderAuditoria(contenedor);
            if (vista === 'sucursales') await this._renderSucursalesConfig(contenedor);
        } catch (err) {
            console.error('[SuperAdmin] Error render:', err);
            contenedor.innerHTML = `<div class="alert alert-danger">Error al cargar: ${err.message}</div>`;
        }
    }

    // ─── VISTAS ───────────────────────────────────────────────────────────

    async _renderResumen(cont) {
        const resumen = await this.obtenerResumenPorSucursal();
        const filtradas = this._filtros.sucursales.length > 0
            ? resumen.filter(r => this._filtros.sucursales.includes(r.id))
            : resumen;

        const totalVentas = filtradas.reduce((s, r) => s + r.stats.totalVentasHoy, 0);
        const totalProds  = filtradas.reduce((s, r) => s + r.stats.totalProductos, 0);
        const totalProv   = filtradas.reduce((s, r) => s + r.stats.totalProveedores, 0);
        const totalVcant  = filtradas.reduce((s, r) => s + r.stats.cantidadVentas, 0);

        cont.innerHTML = `
            <!-- KPIs globales -->
            <div class="sa-kpis-grid">
                <div class="sa-kpi-card sa-kpi-primary">
                    <div class="sa-kpi-icon">💰</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">$${totalVentas.toFixed(2)}</div>
                        <div class="sa-kpi-label">Ventas Hoy (Total)</div>
                    </div>
                </div>
                <div class="sa-kpi-card">
                    <div class="sa-kpi-icon">🧾</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">${totalVcant}</div>
                        <div class="sa-kpi-label">Tickets Hoy</div>
                    </div>
                </div>
                <div class="sa-kpi-card">
                    <div class="sa-kpi-icon">📦</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">${totalProds}</div>
                        <div class="sa-kpi-label">Productos Totales</div>
                    </div>
                </div>
                <div class="sa-kpi-card">
                    <div class="sa-kpi-icon">🚚</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">${totalProv}</div>
                        <div class="sa-kpi-label">Proveedores</div>
                    </div>
                </div>
            </div>

            <!-- Tabla por sucursal -->
            <div class="sa-section-card">
                <h4 style="color:#2d3748;margin-bottom:20px;font-size:18px;font-weight:700;">
                    🏪 Comparativa por Sucursal — Hoy
                </h4>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f7fafc;">
                                <th style="padding:12px 16px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Sucursal</th>
                                <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Ventas Hoy</th>
                                <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Tickets</th>
                                <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Productos</th>
                                <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Proveedores</th>
                                <th style="padding:12px 16px;text-align:center;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtradas.map(s => `
                                <tr style="border-bottom:1px solid #f0f4f8;">
                                    <td style="padding:14px 16px;">
                                        <strong style="color:#2d3748;">${s.nombre}</strong>
                                    </td>
                                    <td style="padding:14px 16px;text-align:right;font-weight:700;color:#38a169;">
                                        $${s.stats.totalVentasHoy.toFixed(2)}
                                    </td>
                                    <td style="padding:14px 16px;text-align:right;color:#4a5568;">
                                        ${s.stats.cantidadVentas}
                                    </td>
                                    <td style="padding:14px 16px;text-align:right;color:#4a5568;">
                                        ${s.stats.totalProductos}
                                    </td>
                                    <td style="padding:14px 16px;text-align:right;color:#4a5568;">
                                        ${s.stats.totalProveedores}
                                    </td>
                                    <td style="padding:14px 16px;text-align:center;">
                                        <span style="
                                            padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;
                                            background:${s.activa ? '#edf7ed' : '#fee2e2'};
                                            color:${s.activa ? '#276749' : '#c53030'};">
                                            ${s.activa ? '● Activa' : '● Inactiva'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    async _renderReportes(cont) {
        const ventas = await this.obtenerVentasAgregadas(
            this._filtros.sucursales,
            this._filtros.periodo,
            this._filtros
        );

        const totales     = this.calcularTotales(ventas);
        const porSucursal = this.agruparPorSucursal(ventas);
        const margen      = totales.totalVentas > 0
            ? ((totales.ganancianeta / totales.totalVentas) * 100).toFixed(1)
            : 0;

        cont.innerHTML = `
            <!-- KPIs financieros -->
            <div class="sa-kpis-grid">
                <div class="sa-kpi-card sa-kpi-primary">
                    <div class="sa-kpi-icon">💵</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">$${totales.totalVentas.toFixed(2)}</div>
                        <div class="sa-kpi-label">Ingresos Totales</div>
                    </div>
                </div>
                <div class="sa-kpi-card">
                    <div class="sa-kpi-icon">📉</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">$${totales.totalCostos.toFixed(2)}</div>
                        <div class="sa-kpi-label">Costos Totales</div>
                    </div>
                </div>
                <div class="sa-kpi-card sa-kpi-success">
                    <div class="sa-kpi-icon">📈</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">$${totales.ganancianeta.toFixed(2)}</div>
                        <div class="sa-kpi-label">Ganancia Neta (${margen}%)</div>
                    </div>
                </div>
                <div class="sa-kpi-card">
                    <div class="sa-kpi-icon">🧾</div>
                    <div class="sa-kpi-info">
                        <div class="sa-kpi-value">${totales.cantidadVentas}</div>
                        <div class="sa-kpi-label">Tickets (prom $${totales.promedioVenta.toFixed(2)})</div>
                    </div>
                </div>
            </div>

            <!-- Desglose por sucursal -->
            <div class="sa-section-card">
                <h4 style="color:#2d3748;margin-bottom:20px;font-size:18px;font-weight:700;">
                    💰 Desglose por Sucursal
                </h4>
                ${porSucursal.length === 0
                    ? '<p style="text-align:center;color:#718096;padding:40px;">Sin ventas en el periodo seleccionado</p>'
                    : `<div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr style="background:#f7fafc;">
                                    <th style="padding:12px 16px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Sucursal</th>
                                    <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Ingresos</th>
                                    <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Costos</th>
                                    <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Ganancia</th>
                                    <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Tickets</th>
                                    <th style="padding:12px 16px;text-align:right;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">% del Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${porSucursal.sort((a,b) => b.totales.totalVentas - a.totales.totalVentas).map(g => {
                                    const pct = totales.totalVentas > 0
                                        ? ((g.totales.totalVentas / totales.totalVentas) * 100).toFixed(1)
                                        : 0;
                                    return `<tr style="border-bottom:1px solid #f0f4f8;">
                                        <td style="padding:14px 16px;"><strong>${g.sucursalNombre}</strong></td>
                                        <td style="padding:14px 16px;text-align:right;color:#2d3748;">$${g.totales.totalVentas.toFixed(2)}</td>
                                        <td style="padding:14px 16px;text-align:right;color:#e53e3e;">$${g.totales.totalCostos.toFixed(2)}</td>
                                        <td style="padding:14px 16px;text-align:right;font-weight:700;color:#38a169;">$${g.totales.ganancianeta.toFixed(2)}</td>
                                        <td style="padding:14px 16px;text-align:right;color:#4a5568;">${g.totales.cantidadVentas}</td>
                                        <td style="padding:14px 16px;text-align:right;">
                                            <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
                                                <div style="flex:1;max-width:80px;background:#e2e8f0;border-radius:4px;height:6px;">
                                                    <div style="width:${pct}%;background:var(--color-primario);height:6px;border-radius:4px;"></div>
                                                </div>
                                                <span style="font-size:13px;font-weight:600;">${pct}%</span>
                                            </div>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`
                }
            </div>

            <!-- Botón exportar CSV -->
            <div style="text-align:right;margin-top:16px;">
                <button id="saExportarCSV" class="btn btn-success">📊 Exportar CSV</button>
            </div>
        `;

        document.getElementById('saExportarCSV')?.addEventListener('click', () => {
            this._exportarVentasCSV(ventas);
        });
    }

    async _renderAuditoria(cont) {
        const registros = await this.obtenerAuditoriaAgregada(
            this._filtros.sucursales,
            { periodo: this._filtros.periodo, ...this._filtros }
        );

        cont.innerHTML = `
            <div class="sa-section-card">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
                    <h4 style="color:#2d3748;font-size:18px;font-weight:700;margin:0;">
                        🛡️ Auditoría Global — ${registros.length} registro${registros.length !== 1 ? 's' : ''}
                    </h4>
                    <button id="saExportarAudit" class="btn btn-success" style="font-size:13px;padding:8px 16px;">
                        📊 Exportar CSV
                    </button>
                </div>

                ${registros.length === 0
                    ? '<p style="text-align:center;color:#718096;padding:40px;">Sin registros en el periodo seleccionado</p>'
                    : `<div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:#f7fafc;">
                                    <th style="padding:10px 12px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Fecha/Hora</th>
                                    <th style="padding:10px 12px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Sucursal</th>
                                    <th style="padding:10px 12px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Usuario</th>
                                    <th style="padding:10px 12px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Categoría</th>
                                    <th style="padding:10px 12px;text-align:left;color:#4a5568;font-weight:700;border-bottom:2px solid #e2e8f0;">Operación</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${registros.slice(0, 200).map(r => {
                                    const fecha = new Date(r.fecha);
                                    const sNombre = this.sucursalesManager.obtenerPorId(r._sucursalId || r.sucursalId)?.nombre || 'Desconocida';
                                    return `<tr style="border-bottom:1px solid #f0f4f8;">
                                        <td style="padding:10px 12px;white-space:nowrap;">
                                            <div style="font-weight:600;color:#2d3748;">${fecha.toLocaleDateString('es-MX', {day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
                                            <div style="color:#718096;font-size:11px;">${fecha.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}</div>
                                        </td>
                                        <td style="padding:10px 12px;">
                                            <span style="background:#ebf4ff;color:#2b6cb0;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;">
                                                ${sNombre}
                                            </span>
                                        </td>
                                        <td style="padding:10px 12px;color:#4a5568;">${r.usuario?.nombre || 'Sistema'}</td>
                                        <td style="padding:10px 12px;">
                                            <span style="background:#f7fafc;border:1px solid #e2e8f0;padding:2px 8px;border-radius:8px;font-size:11px;">
                                                ${r.categoria || '-'}
                                            </span>
                                        </td>
                                        <td style="padding:10px 12px;">
                                            <span style="margin-right:6px;">${r.icono || '⚙️'}</span>
                                            ${r.label || r.tipo}
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                        ${registros.length > 200 ? `<p style="text-align:center;color:#718096;margin-top:12px;font-size:13px;">Mostrando 200 de ${registros.length} registros. Exporta CSV para ver todos.</p>` : ''}
                    </div>`
                }
            </div>
        `;

        document.getElementById('saExportarAudit')?.addEventListener('click', () => {
            this.auditoriaManager.exportarCSV(registros);
        });
    }

    async _renderSucursalesConfig(cont) {
        const sucursales = this.sucursalesManager.obtenerTodas().filter(s => !s.eliminada);

        cont.innerHTML = `
            <div class="sa-section-card">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
                    <h4 style="color:#2d3748;font-size:18px;font-weight:700;margin:0;">
                        🏪 Gestión de Sucursales
                    </h4>
                    <button id="saBtnCrearSucursal" class="btn btn-primary">➕ Nueva Sucursal</button>
                </div>

                <div id="saSucursalesLista">
                    ${sucursales.map(s => `
                        <div class="sa-sucursal-card" style="
                            background:white;border:2px solid ${s.activa ? '#e2e8f0' : '#fed7d7'};
                            border-radius:12px;padding:20px;margin-bottom:14px;
                            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                            <div>
                                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                    <span style="font-size:24px;">🏪</span>
                                    <div>
                                        <strong style="font-size:17px;color:#2d3748;">${s.nombre}</strong>
                                        <span style="
                                            margin-left:8px;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;
                                            background:${s.activa ? '#edf7ed' : '#fee2e2'};
                                            color:${s.activa ? '#276749' : '#c53030'};">
                                            ${s.activa ? '● Activa' : '● Inactiva'}
                                        </span>
                                    </div>
                                </div>
                                <div style="margin-top:8px;font-size:13px;color:#718096;">
                                    🔒 NIP: <code style="background:#f7fafc;padding:2px 8px;border-radius:4px;font-size:14px;color:#2d3748;font-weight:700;">${s.nip || '????'}</code>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="btn btn-primary btn-sm" data-accion="editar-suc" data-id="${s.id}">✏️ Editar</button>
                                <button class="btn btn-secondary btn-sm" data-accion="toggle-suc" data-id="${s.id}">
                                    ${s.activa ? '⏸ Desactivar' : '▶ Activar'}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.getElementById('saBtnCrearSucursal')?.addEventListener('click', () => {
            this._abrirModalSucursal(null);
        });

        cont.querySelectorAll('button[data-accion]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const { accion, id } = btn.dataset;
                if (accion === 'editar-suc')  this._abrirModalSucursal(id);
                if (accion === 'toggle-suc') {
                    await this.sucursalesManager.toggleActiva(id);
                    this._renderizarVista('sucursales');
                }
            });
        });
    }

    _abrirModalSucursal(id) {
        const sucursal = id ? this.sucursalesManager.obtenerPorId(id) : null;
        const modal    = document.getElementById('modalSucursal');
        if (!modal) return;

        document.getElementById('sucursalModalTitulo').textContent = sucursal ? 'Editar Sucursal' : 'Nueva Sucursal';
        document.getElementById('sucursalId').value     = id || '';
        document.getElementById('sucursalNombre').value = sucursal?.nombre || '';
        document.getElementById('sucursalNIP').value    = sucursal?.nip    || this.sucursalesManager.generarNIP();

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }

    // ─── EXPORT CSV ───────────────────────────────────────────────────────

    _exportarVentasCSV(ventas) {
        const header = ['Sucursal','Fecha','Hora','Usuario','Método Pago','Total','Items'];
        const filas  = ventas.map(v => {
            const fecha   = new Date(v.fecha);
            const items   = (v.items || []).map(i => i.esGranel
                ? `${i.producto?.nombre} ${i.gramos}g`
                : `${i.producto?.nombre} ×${i.cantidad}`
            ).join(' | ');
            return [
                v._sucursalNombre || '-',
                fecha.toLocaleDateString('es-MX'),
                fecha.toLocaleTimeString('es-MX'),
                v.usuario?.nombre || 'Sistema',
                v.metodoPago || 'efectivo',
                `$${v.total?.toFixed(2) || '0.00'}`,
                `"${items}"`
            ];
        });

        const csv  = [header, ...filas].map(r => r.join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `VENTAS_GLOBAL_${new Date().toLocaleDateString('es-MX').replace(/\//g,'-')}.csv`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}