// adminPanel.js - Módulo de UI para el panel de administración y auditoría

import { TIPOS_OPERACION, CATEGORIAS_OPERACION } from './auditoria.js';

// Íconos por categoría, usados tanto en las tarjetas de estadísticas como en
// los chips de filtro. Debe mantenerse en sincronía con las categorías
// declaradas en CATEGORIAS_OPERACION (auditoria.js).
const CATEGORIA_ICONOS = {
    'Productos':     '📦',
    'Ventas':        '💰',
    'Proveedores':   '🚚',
    'Pedidos':       '🛒',
    'Terminales':    '🖥️',
    'Usuarios':      '👤',
    'Sesión':        '🔑',
    'Configuración': '⚙️'
};

export class AdminPanelManager {
    constructor(auditoriaManager, usuariosManager) {
        this.auditoriaManager = auditoriaManager;
        this.usuariosManager  = usuariosManager;

        // Estado del panel
        this._filtros = {
            periodo:          'dia',
            fechaEspecifica:  '',
            fechaInicio:      '',
            fechaFin:         '',
            categorias:       [],
            tipos:            [],
            usuarioId:        ''
        };

        this._escuchaActiva = false;
        this._unsubAudit    = null;
    }

    // ─── CICLO DE VIDA ────────────────────────────────────────────────────

    async activar() {
        if (this._escuchaActiva) return;
        this._escuchaActiva = true;

        this._unsubAudit = this.auditoriaManager.iniciarEscucha(() => {
            this._renderizarResultados();
        });

        await this.auditoriaManager.cargarRegistros();
        this.renderizarPanel();
    }

    desactivar() {
        if (this._unsubAudit) {
            this._unsubAudit();
            this._unsubAudit = null;
        }
        this._escuchaActiva = false;
    }

    // ─── RENDER PRINCIPAL ─────────────────────────────────────────────────

    renderizarPanel() {
        const contenedor = document.getElementById('adminPanelContenido');
        if (!contenedor) return;

        const usuarios = this.usuariosManager.obtenerTodos();

        contenedor.innerHTML = `
            <!-- ENCABEZADO -->
            <div class="admin-panel-header">
                <div class="admin-panel-title-group">
                    <span class="admin-panel-icon">🛡️</span>
                    <div>
                        <h2 class="admin-panel-title">Panel de Administración</h2>
                        <p class="admin-panel-subtitle">Registro completo de operaciones del sistema</p>
                    </div>
                </div>
                <button id="btnExportarAuditoria" class="btn btn-success admin-export-btn">
                    📊 Exportar CSV
                </button>
            </div>

            <!-- TARJETAS DE RESUMEN -->
            <div id="adminStatsCards" class="admin-stats-grid"></div>

            <!-- PANEL DE FILTROS -->
            <div class="admin-filtros-card">
                <div class="admin-filtros-header" id="adminFiltrosToggle">
                    <span style="font-weight:700;color:#2d3748;display:flex;align-items:center;gap:8px;">
                        <span style="font-size:18px;">🔍</span> Filtros de búsqueda
                    </span>
                    <span class="admin-filtros-toggle-icon" id="adminFiltrosIcon">▼</span>
                </div>

                <div class="admin-filtros-body" id="adminFiltrosBody">
                    <!-- Fila 1: Periodo y Usuario -->
                    <div class="admin-filtros-row">
                        <div class="form-group" style="flex:1;min-width:180px;">
                            <label>📅 Periodo</label>
                            <select id="adminFiltroPeriodo">
                                <option value="dia">Hoy</option>
                                <option value="semana">Última semana</option>
                                <option value="mes">Este mes</option>
                                <option value="año">Este año</option>
                                <option value="fecha">Fecha específica</option>
                                <option value="rango">Rango de fechas</option>
                                <option value="todos">Todos los registros</option>
                            </select>
                        </div>

                        <div class="form-group" style="flex:1;min-width:180px;">
                            <label>👤 Usuario</label>
                            <select id="adminFiltroUsuario">
                                <option value="">Todos los usuarios</option>
                                ${usuarios.map(u => `
                                    <option value="${u.id}">${u.nombre} (${u.rol})</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <!-- Fechas dinámicas -->
                    <div id="adminFechaEspecificaGroup" class="form-group hidden">
                        <label>Seleccionar fecha</label>
                        <input type="date" id="adminFechaEspecifica" style="max-width:250px;">
                    </div>

                    <div id="adminRangoFechasGroup" class="hidden">
                        <div class="admin-filtros-row">
                            <div class="form-group" style="flex:1;">
                                <label>Fecha inicio</label>
                                <input type="date" id="adminFechaInicio">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>Fecha fin</label>
                                <input type="date" id="adminFechaFin">
                            </div>
                        </div>
                    </div>

                    <!-- Fila 2: Categorías -->
                    <div class="form-group">
                        <label style="margin-bottom:10px;display:block;">
                            🏷️ Categorías
                            <span style="font-size:11px;color:#a0aec0;margin-left:6px;">(vacío = todas)</span>
                        </label>
                        <div class="admin-chips-group" id="adminCategoriasChips">
                            ${CATEGORIAS_OPERACION.map(cat => `
                                <button class="admin-chip" data-categoria="${cat}" data-activo="false">
                                    ${this._iconoCategoria(cat)} ${cat}
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Fila 3: Tipos de operación -->
                    <div class="form-group">
                        <label style="margin-bottom:10px;display:block;">
                            ⚙️ Tipos de operación
                            <span style="font-size:11px;color:#a0aec0;margin-left:6px;">(vacío = todos)</span>
                        </label>
                        <div class="admin-chips-group" id="adminTiposChips">
                            ${Object.entries(TIPOS_OPERACION).map(([key, val]) => `
                                <button class="admin-chip admin-chip-sm" data-tipo="${key}" data-activo="false"
                                        title="${val.categoria}">
                                    ${val.icono} ${val.label}
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display:flex;gap:10px;margin-top:5px;">
                        <button id="btnAplicarFiltrosAdmin" class="btn btn-primary">
                            🔍 Aplicar filtros
                        </button>
                        <button id="btnLimpiarFiltrosAdmin" class="btn btn-secondary">
                            ↩️ Limpiar
                        </button>
                    </div>
                </div>
            </div>

            <!-- RESULTADOS -->
            <div class="admin-resultados-card">
                <div class="admin-resultados-header">
                    <span id="adminResultadosCount" style="font-weight:700;color:#2d3748;font-size:15px;">
                        Cargando...
                    </span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <label style="font-size:13px;color:#718096;">Vista:</label>
                        <button id="btnVistaTabla"   class="admin-vista-btn active" title="Tabla">☰ Tabla</button>
                        <button id="btnVistaLinea"   class="admin-vista-btn"        title="Línea de tiempo">📋 Línea</button>
                    </div>
                </div>
                <div id="adminRegistrosContainer"></div>
            </div>
        `;

        this._bindFiltros();
        this._renderizarResultados();
    }

    // ─── BINDING DE EVENTOS ───────────────────────────────────────────────

    _bindFiltros() {
        // Toggle panel filtros
        document.getElementById('adminFiltrosToggle')?.addEventListener('click', () => {
            const body = document.getElementById('adminFiltrosBody');
            const icon = document.getElementById('adminFiltrosIcon');
            body?.classList.toggle('open');
            if (icon) icon.textContent = body?.classList.contains('open') ? '▲' : '▼';
        });

        // Cambio de periodo
        document.getElementById('adminFiltroPeriodo')?.addEventListener('change', (e) => {
            this._filtros.periodo = e.target.value;
            this._actualizarVisibildadFechas();
        });

        // Chips de categorías
        document.getElementById('adminCategoriasChips')?.addEventListener('click', (e) => {
            const chip = e.target.closest('.admin-chip[data-categoria]');
            if (!chip) return;
            const activo = chip.dataset.activo === 'true';
            chip.dataset.activo = (!activo).toString();
            chip.classList.toggle('active', !activo);
        });

        // Chips de tipos
        document.getElementById('adminTiposChips')?.addEventListener('click', (e) => {
            const chip = e.target.closest('.admin-chip[data-tipo]');
            if (!chip) return;
            const activo = chip.dataset.activo === 'true';
            chip.dataset.activo = (!activo).toString();
            chip.classList.toggle('active', !activo);
        });

        // Botones
        document.getElementById('btnAplicarFiltrosAdmin')?.addEventListener('click', () => {
            this._recopilarFiltros();
            this._renderizarResultados();
        });

        document.getElementById('btnLimpiarFiltrosAdmin')?.addEventListener('click', () => {
            this._limpiarFiltros();
        });

        document.getElementById('btnExportarAuditoria')?.addEventListener('click', () => {
            const registros = this.auditoriaManager.filtrar(this._filtros);
            this.auditoriaManager.exportarCSV(registros);
        });

        // Vistas
        document.getElementById('btnVistaTabla')?.addEventListener('click', () => {
            this._vistaActual = 'tabla';
            document.getElementById('btnVistaTabla')?.classList.add('active');
            document.getElementById('btnVistaLinea')?.classList.remove('active');
            this._renderizarResultados();
        });

        document.getElementById('btnVistaLinea')?.addEventListener('click', () => {
            this._vistaActual = 'linea';
            document.getElementById('btnVistaLinea')?.classList.add('active');
            document.getElementById('btnVistaTabla')?.classList.remove('active');
            this._renderizarResultados();
        });
    }

    _actualizarVisibildadFechas() {
        const p = this._filtros.periodo;
        document.getElementById('adminFechaEspecificaGroup')?.classList.toggle('hidden', p !== 'fecha');
        document.getElementById('adminRangoFechasGroup')?.classList.toggle('hidden', p !== 'rango');
    }

    _recopilarFiltros() {
        this._filtros.periodo         = document.getElementById('adminFiltroPeriodo')?.value || 'dia';
        this._filtros.fechaEspecifica = document.getElementById('adminFechaEspecifica')?.value || '';
        this._filtros.fechaInicio     = document.getElementById('adminFechaInicio')?.value || '';
        this._filtros.fechaFin        = document.getElementById('adminFechaFin')?.value || '';
        this._filtros.usuarioId       = document.getElementById('adminFiltroUsuario')?.value || '';

        // Chips categorías activas
        this._filtros.categorias = Array.from(
            document.querySelectorAll('.admin-chip[data-categoria][data-activo="true"]')
        ).map(c => c.dataset.categoria);

        // Chips tipos activos
        this._filtros.tipos = Array.from(
            document.querySelectorAll('.admin-chip[data-tipo][data-activo="true"]')
        ).map(c => c.dataset.tipo);
    }

    _limpiarFiltros() {
        this._filtros = {
            periodo: 'dia', fechaEspecifica: '', fechaInicio: '',
            fechaFin: '', categorias: [], tipos: [], usuarioId: ''
        };

        const periodoEl = document.getElementById('adminFiltroPeriodo');
        if (periodoEl) periodoEl.value = 'dia';

        const usuarioEl = document.getElementById('adminFiltroUsuario');
        if (usuarioEl) usuarioEl.value = '';

        document.querySelectorAll('.admin-chip').forEach(c => {
            c.dataset.activo = 'false';
            c.classList.remove('active');
        });

        this._actualizarVisibildadFechas();
        this._renderizarResultados();
    }

    // ─── RENDER DE RESULTADOS ─────────────────────────────────────────────

    _renderizarResultados() {
        const registros  = this.auditoriaManager.filtrar(this._filtros);
        const stats      = this.auditoriaManager.generarEstadisticas(registros);
        const countEl    = document.getElementById('adminResultadosCount');
        const contenedor = document.getElementById('adminRegistrosContainer');

        if (countEl) {
            countEl.textContent = `${registros.length} registro${registros.length !== 1 ? 's' : ''} encontrado${registros.length !== 1 ? 's' : ''}`;
        }

        this._renderizarStatsCards(stats);

        if (!contenedor) return;

        if (registros.length === 0) {
            contenedor.innerHTML = `
                <div class="admin-empty">
                    <span style="font-size:48px;">🔍</span>
                    <p style="font-size:18px;font-weight:600;color:#4a5568;margin-top:12px;">
                        Sin registros para los filtros seleccionados
                    </p>
                    <p style="color:#a0aec0;margin-top:6px;">
                        Prueba cambiando el periodo o quitando algún filtro
                    </p>
                </div>`;
            return;
        }

        if (this._vistaActual === 'linea') {
            contenedor.innerHTML = this._renderizarLineaTiempo(registros);
        } else {
            contenedor.innerHTML = this._renderizarTabla(registros);
        }
    }

    _renderizarStatsCards(stats) {
        const contenedor = document.getElementById('adminStatsCards');
        if (!contenedor) return;

        const topCats = Object.entries(stats.porCategoria)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);

        contenedor.innerHTML = `
            <!-- Total -->
            <div class="admin-stat-card admin-stat-total">
                <div class="admin-stat-icon">📋</div>
                <div class="admin-stat-info">
                    <div class="admin-stat-value">${stats.total}</div>
                    <div class="admin-stat-label">Total operaciones</div>
                </div>
            </div>

            <!-- Por usuario top -->
            ${Object.entries(stats.porUsuario).slice(0, 1).map(([nombre, cnt]) => `
                <div class="admin-stat-card admin-stat-usuario">
                    <div class="admin-stat-icon">👤</div>
                    <div class="admin-stat-info">
                        <div class="admin-stat-value">${cnt}</div>
                        <div class="admin-stat-label">Ops. de ${nombre}</div>
                    </div>
                </div>
            `).join('')}

            <!-- Por categoría -->
            ${topCats.map(([cat, cnt]) => `
                <div class="admin-stat-card">
                    <div class="admin-stat-icon">${CATEGORIA_ICONOS[cat] || '⚙️'}</div>
                    <div class="admin-stat-info">
                        <div class="admin-stat-value">${cnt}</div>
                        <div class="admin-stat-label">${cat}</div>
                    </div>
                </div>
            `).join('')}

            <!-- Top operación -->
            ${stats.topOperaciones[0] ? `
                <div class="admin-stat-card admin-stat-top">
                    <div class="admin-stat-icon">${stats.topOperaciones[0].icono}</div>
                    <div class="admin-stat-info">
                        <div class="admin-stat-value">${stats.topOperaciones[0].count}×</div>
                        <div class="admin-stat-label">${stats.topOperaciones[0].label}</div>
                    </div>
                </div>
            ` : ''}
        `;
    }

    // ─── VISTA TABLA ──────────────────────────────────────────────────────

    _renderizarTabla(registros) {
        return `
            <div style="overflow-x:auto;">
                <table class="admin-tabla">
                    <thead>
                        <tr>
                            <th style="width:160px;">Fecha y hora</th>
                            <th style="width:140px;">Usuario</th>
                            <th style="width:110px;">Categoría</th>
                            <th>Operación</th>
                            <th>Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.map(r => {
                            const fecha = new Date(r.fecha);
                            const usuarioRol = r.usuario?.rol || 'sistema';
                            const iconoRol = usuarioRol === 'administrador' ? '👑'
                                           : usuarioRol === 'empleado'      ? '👤' : '⚙️';
                            const detallesHtml = this._renderizarDetalles(r.detalles);

                            return `
                                <tr class="admin-tabla-row">
                                    <td class="admin-fecha-cell">
                                        <div style="font-weight:600;color:#2d3748;">
                                            ${fecha.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'2-digit' })}
                                        </div>
                                        <div style="color:#718096;font-size:12px;">
                                            ${fecha.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                                        </div>
                                    </td>
                                    <td>
                                        <div class="admin-usuario-chip ${usuarioRol}">
                                            ${iconoRol} ${r.usuario?.nombre || 'Sistema'}
                                        </div>
                                    </td>
                                    <td>
                                        <span class="admin-categoria-badge admin-cat-${r.categoria?.toLowerCase().replace(/\s/g,'_') || 'otro'}">
                                            ${r.categoria || '-'}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="font-size:16px;margin-right:6px;">${r.icono || '⚙️'}</span>
                                        <span style="font-weight:500;color:#2d3748;">${r.label || r.tipo}</span>
                                    </td>
                                    <td class="admin-detalles-cell">${detallesHtml}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ─── VISTA LÍNEA DE TIEMPO ────────────────────────────────────────────

    _renderizarLineaTiempo(registros) {
        // Agrupar por día
        const grupos = {};
        registros.forEach(r => {
            const fecha = new Date(r.fecha);
            const diaKey = fecha.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
            if (!grupos[diaKey]) grupos[diaKey] = [];
            grupos[diaKey].push(r);
        });

        return `
            <div class="admin-timeline">
                ${Object.entries(grupos).map(([dia, regs]) => `
                    <div class="admin-timeline-group">
                        <div class="admin-timeline-day-header">
                            <span class="admin-timeline-day-dot"></span>
                            <span class="admin-timeline-day-label">${dia}</span>
                            <span class="admin-timeline-day-count">${regs.length} op.</span>
                        </div>

                        <div class="admin-timeline-items">
                            ${regs.map(r => {
                                const fecha = new Date(r.fecha);
                                const usuarioRol = r.usuario?.rol || 'sistema';
                                const iconoRol = usuarioRol === 'administrador' ? '👑'
                                               : usuarioRol === 'empleado'      ? '👤' : '⚙️';
                                const detallesHtml = this._renderizarDetalles(r.detalles);

                                return `
                                    <div class="admin-timeline-item">
                                        <div class="admin-timeline-item-icon">${r.icono || '⚙️'}</div>
                                        <div class="admin-timeline-item-content">
                                            <div class="admin-timeline-item-header">
                                                <span class="admin-timeline-item-op">${r.label || r.tipo}</span>
                                                <span class="admin-timeline-item-hora">
                                                    ${fecha.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
                                                </span>
                                            </div>
                                            <div class="admin-timeline-item-meta">
                                                <span class="admin-usuario-chip ${usuarioRol} sm">
                                                    ${iconoRol} ${r.usuario?.nombre || 'Sistema'}
                                                </span>
                                                <span class="admin-categoria-badge admin-cat-${r.categoria?.toLowerCase().replace(/\s/g,'_') || 'otro'} sm">
                                                    ${r.categoria || '-'}
                                                </span>
                                            </div>
                                            ${detallesHtml ? `<div class="admin-timeline-item-detalles">${detallesHtml}</div>` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ─── HELPERS INTERNOS ─────────────────────────────────────────────────

    _renderizarDetalles(detalles) {
        if (!detalles || Object.keys(detalles).length === 0) return '-';

        // Mapeo de claves técnicas a etiquetas legibles
        const etiquetas = {
            nombre:            'Nombre',
            clave:             'Clave',
            precioCompra:      'P. Compra',
            precioVentaAntes:  'Precio antes',
            precioVentaDespues:'Precio después',
            stockAntes:        'Stock antes',
            stockDespues:      'Stock después',
            stock:             'Stock',
            tipo:              'Tipo',
            total:             'Total',
            items:             'Productos',
            proveedor:         'Proveedor',
            fecha:             'Fecha visita',
            colores:           'Colores',
            meta:              'Meta $',
            usuarioNombre:     'Usuario',
            rolAntes:          'Rol antes',
            rolDespues:        'Rol después',
            cantidad:          'Cantidad',
        };

        const pares = Object.entries(detalles)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => {
                const etiq  = etiquetas[k] || k;
                const valor = typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `<span class="admin-detalle-tag"><strong>${etiq}:</strong> ${valor}</span>`;
            });

        return `<div class="admin-detalles-lista">${pares.join('')}</div>`;
    }

    _iconoCategoria(cat) {
        return CATEGORIA_ICONOS[cat] || '⚙️';
    }
}