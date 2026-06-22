// ui.js - Módulo para manejo de la interfaz de usuario
// CORREGIDO: Lógica de permisos en mostrarSeccion y renderizarMenu

export class UIManager {
    constructor() {
        this.currentSection = 'dashboard';
    }

    // === INDICADORES DE CARGA ===
    mostrarCargando() {
        const contenedor = document.getElementById('statsGrid');
        if (contenedor) {
            contenedor.innerHTML = `
                <div class="loading" style="grid-column: 1 / -1;">
                    Cargando datos...
                </div>`;
        }
    }

    ocultarCargando() {}

    // === NAVEGACIÓN ===
    mostrarSeccion(seccionId) {
        // Secciones que siempre son accesibles sin verificación de permiso
        const seccionesLibres = ['administracion', 'superadmin', 'configuracion'];

        if (!seccionesLibres.includes(seccionId)) {
            if (window.appInstance && window.appInstance.usuariosManager) {
                const usuarioActual = window.appInstance.usuariosManager.obtenerUsuarioActual();
                // Solo verificar permisos si hay un usuario activo
                if (usuarioActual && !window.appInstance.usuariosManager.tienePermiso(seccionId)) {
                    this.alerta('No tienes permiso para acceder a esta sección');
                    return;
                }
            }
        }

        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });
        const seccion = document.getElementById(seccionId);
        if (seccion) {
            seccion.classList.remove('hidden');
            this.currentSection = seccionId;
        }
        this.actualizarMenuActivo(seccionId);

        if (seccionId === 'ventas') {
            setTimeout(() => {
                const claveInput = document.getElementById('buscarClaveVenta');
                if (claveInput) claveInput.focus();
            }, 100);
        }

        if (seccionId === 'configuracion' && window.configuracionManager) {
            window.configuracionManager.actualizarEmailUsuario();
            window.configuracionManager.cargarColoresDesdeFirestore();
            window.configuracionManager.actualizarInputNombreSucursal?.();
            if (window.appInstance?.actualizarInfoUsuarioEnConfiguracion) {
                window.appInstance.actualizarInfoUsuarioEnConfiguracion();
            }
            // Mostrar/ocultar sección de nombre de sucursal
            const secNombre = document.getElementById('seccionNombreSucursal');
            if (secNombre) {
                secNombre.style.display = window.sucursalActualId ? 'block' : 'none';
            }
        }
    }

    actualizarMenuActivo(seccionId) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === seccionId) {
                item.classList.add('active');
            }
        });
    }

    // === MENSAJES Y ALERTAS ===
    mostrarMensaje(contenedorId, mensaje, tipo = 'success') {
        const contenedor = document.getElementById(contenedorId);
        if (!contenedor) return;
        const clase = tipo === 'success' ? 'alert-success' : 'alert-danger';
        contenedor.innerHTML = `<div class="alert ${clase}">${mensaje}</div>`;
        setTimeout(() => { contenedor.innerHTML = ''; }, 3000);
    }

    confirmar(mensaje) { return window.confirm(mensaje); }
    prompt(mensaje, valorDefault = '') { return window.prompt(mensaje, valorDefault); }
    alerta(mensaje) { window.alert(mensaje); }

    // === RENDERIZADO DE MENÚ ===
    renderizarMenu(contenedor) {
        if (!contenedor) return;

        // CORRECCIÓN: Solo es modo superAdmin si explícitamente NO hay sucursal activa
        // y además se está en el panel maestro (determinado por la sección actual o un flag)
        // La verificación correcta es: hay usuario autenticado en Firebase pero
        // NO hay sucursal seleccionada Y el usuario eligió "Panel Maestro"
        // Para evitar falsos positivos al inicio, usamos un flag explícito
        const esSuperAdmin = window._modoSuperAdmin === true;

        const menuItemsSucursal = [
            { id: 'dashboard',      icono: '📊', texto: 'Dashboard' },
            { id: 'productos',      icono: '📦', texto: 'Productos' },
            { id: 'ventas',         icono: '💰', texto: 'Realizar Venta' },
            { id: 'proveedores',    icono: '🚚', texto: 'Proveedores' },
            { id: 'reportes',       icono: '📈', texto: 'Reportes' },
            { id: 'administracion', icono: '🛡️', texto: 'Administración' },
            { id: 'configuracion',  icono: '⚙️', texto: 'Configuración' }
        ];

        const menuItemsSuperAdmin = [
            { id: 'superadmin',    icono: '👑', texto: 'Panel Maestro' },
            { id: 'configuracion', icono: '⚙️', texto: 'Configuración' }
        ];

        const menuItems     = esSuperAdmin ? menuItemsSuperAdmin : menuItemsSucursal;
        const defaultSection = esSuperAdmin ? 'superadmin' : 'dashboard';

        contenedor.innerHTML = menuItems.map(item => `
            <div class="menu-item ${item.id === defaultSection ? 'active' : ''}"
                 data-section="${item.id}">
                ${item.icono} ${item.texto}
            </div>`).join('');
    }

    // === RENDERIZADO DE PRODUCTOS ===
    renderizarTablaProductos(productos, tbody) {
        if (!tbody) return;

        const tienePermisoEditar   = window.appInstance?.usuariosManager?.tienePermiso('productos_editar')   || false;
        const tienePermisoEliminar = window.appInstance?.usuariosManager?.tienePermiso('productos_eliminar') || false;

        tbody.innerHTML = productos.map(producto => {
            const stockTexto  = producto.esGranel
                ? `${parseFloat(producto.stock).toFixed(3)} kg`
                : producto.stock;
            const precioTexto = producto.esGranel
                ? `$${producto.precioVenta.toFixed(2)}/kg`
                : `$${producto.precioVenta.toFixed(2)}`;
            const granelBadge = producto.esGranel
                ? '<span style="background:#e6f0ff;color:#667eea;font-size:11px;padding:2px 7px;border-radius:10px;margin-left:5px;">⚖ Granel</span>'
                : '';
            const stockBajo = producto.esGranel ? producto.stock < 1 : producto.stock < 5;

            return `
                <tr>
                    <td>${producto.clave}</td>
                    <td>${producto.nombre}${granelBadge}</td>
                    <td>$${producto.precioCompra.toFixed(2)}</td>
                    <td>${precioTexto}</td>
                    <td class="${stockBajo ? 'low-stock' : ''}">${stockTexto}</td>
                    <td>
                        ${tienePermisoEditar   ? `<button class="btn btn-primary"  data-accion="editar"   data-id="${producto.id}">✏️ Editar</button>`   : ''}
                        ${tienePermisoEliminar ? `<button class="btn btn-danger"   data-accion="eliminar" data-id="${producto.id}">🗑️ Eliminar</button>` : ''}
                        ${!tienePermisoEditar && !tienePermisoEliminar ? '<span style="color:#718096;font-size:13px;">Sin permisos</span>' : ''}
                    </td>
                </tr>`;
        }).join('');
    }

    // === RENDERIZADO DE SELECT DE PRODUCTOS ===
    actualizarSelectProductos(productos, select) {
        if (!select) return;
        const opciones = productos.map((producto, index) => {
            const stockTexto = producto.esGranel
                ? `${parseFloat(producto.stock).toFixed(2)} kg`
                : `Stock: ${producto.stock}`;
            const granelTag = producto.esGranel ? ' ⚖' : '';
            return `<option value="${index}">${producto.nombre}${granelTag} - ${stockTexto}</option>`;
        }).join('');
        select.innerHTML = '<option value="">-- Seleccione --</option>' + opciones;
    }

    // === RENDERIZADO DE INFORMACIÓN DEL PRODUCTO EN VENTA ===
    mostrarInfoProducto(producto, stockEnCarrito, contenedor) {
        if (!contenedor) return;

        if (producto.esGranel) {
            const kgEnCarrito  = stockEnCarrito / 1000;
            const kgDisponible = producto.stock - kgEnCarrito;
            const stockBajo    = kgDisponible < 0.5;

            contenedor.innerHTML = `
                <div style="background:#f0f4ff;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #667eea;">
                    <strong>⚖ ${producto.nombre}</strong>
                    <span style="background:#667eea;color:white;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px;">GRANEL</span><br>
                    Precio: <strong>$${producto.precioVenta.toFixed(2)}/kg</strong><br>
                    Stock disponible: <span class="${stockBajo ? 'low-stock' : ''}">${kgDisponible.toFixed(3)} kg</span>
                    ${kgEnCarrito > 0 ? `<br><small>(${(kgEnCarrito * 1000).toFixed(0)}g ya en carrito)</small>` : ''}
                </div>`;
        } else {
            const stockDisponible = producto.stock - stockEnCarrito;
            contenedor.innerHTML = `
                <div style="background:#f7fafc;padding:15px;border-radius:8px;margin:15px 0;">
                    <strong>${producto.nombre}</strong><br>
                    Precio: $${producto.precioVenta.toFixed(2)}<br>
                    Stock disponible: <span class="${stockDisponible < 5 ? 'low-stock' : ''}">${stockDisponible}</span>
                    ${stockEnCarrito > 0 ? `<br><small>(${stockEnCarrito} ya en carrito)</small>` : ''}
                </div>`;
        }
    }

    // === RENDERIZADO DE LISTA DE VENTA ACTUAL ===
    renderizarListaVenta(items, contenedor) {
        if (!contenedor) return;
        if (items.length === 0) { contenedor.innerHTML = ''; return; }

        const html = '<h4>Productos en la venta:</h4>' + items.map((item, index) => {
            if (item.esGranel) {
                return `
                    <div class="venta-item">
                        <div style="flex:1;">
                            <strong>${item.producto.nombre}</strong>
                            <span style="background:#667eea;color:white;font-size:10px;padding:1px 7px;border-radius:10px;margin-left:6px;">⚖ Granel</span><br>
                            <span style="font-size:15px;color:#4a5568;margin-top:6px;display:inline-block;">
                                <strong style="color:var(--color-primario);">${item.gramos}g</strong>
                                &nbsp;×&nbsp; $${item.producto.precioVenta.toFixed(2)}/kg
                            </span>
                        </div>
                        <div style="text-align:right;">
                            <strong style="font-size:20px;color:var(--color-primario);">$${item.subtotal.toFixed(2)}</strong><br>
                            <button class="btn btn-danger" style="margin-top:8px;font-size:14px;padding:8px 16px;"
                                onclick="window.appInstance.eliminarDelCarrito(${index})">🗑️ Quitar</button>
                        </div>
                    </div>`;
            }
            return `
                <div class="venta-item">
                    <div style="flex:1;">
                        <strong>${item.producto.nombre}</strong><br>
                        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
                            <button class="btn-cantidad" onclick="window.appInstance.disminuirCantidadCarrito(${index})" title="Disminuir cantidad">−</button>
                            <span style="min-width:80px;text-align:center;">
                                <strong style="font-size:18px;color:var(--color-primario);">${item.cantidad}</strong>
                            </span>
                            <button class="btn-cantidad" onclick="window.appInstance.aumentarCantidadCarrito(${index})" title="Aumentar cantidad">+</button>
                            <span style="margin-left:10px;">× $${item.producto.precioVenta.toFixed(2)}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <strong style="font-size:20px;color:var(--color-primario);">$${item.subtotal.toFixed(2)}</strong><br>
                        <button class="btn btn-danger" style="margin-top:8px;font-size:14px;padding:8px 16px;"
                            onclick="window.appInstance.eliminarDelCarrito(${index})">🗑️ Quitar</button>
                    </div>
                </div>`;
        }).join('');

        contenedor.innerHTML = html;
    }

    // === ACTUALIZAR TOTAL DE VENTA ===
    actualizarTotalVenta(total, elemento) {
        if (elemento) elemento.textContent = total.toFixed(2);
    }

    // === RENDERIZADO DE PROVEEDORES ===
    renderizarTablaProveedores(proveedores, tbody, proveedoresManager) {
        if (!tbody) return;

        const tienePermisoEditar   = window.appInstance?.usuariosManager?.tienePermiso('proveedores_editar')   || false;
        const tienePermisoEliminar = window.appInstance?.usuariosManager?.tienePermiso('proveedores_eliminar') || false;

        tbody.innerHTML = proveedores.map(proveedor => {
            const esHoy = proveedoresManager.esVisitaHoy(proveedor.fechaVisita);
            const [año, mes, dia] = proveedor.fechaVisita.split('-').map(Number);
            const fecha = new Date(año, mes - 1, dia);
            const estiloFecha = esHoy ? 'font-weight:bold;color:var(--color-primario);' : '';

            let infoReparto = '';
            if (proveedor.tipoReparto === 'constante' && proveedor.diasReparto?.length > 0) {
                const nombresDias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                const diasTexto    = proveedor.diasReparto.sort((a,b)=>a-b).map(d=>nombresDias[d]).join(', ');
                const frecuencia   = proveedor.frecuenciaReparto || 1;
                let textoFrecuencia = 'Semanal';
                if (frecuencia === 2) textoFrecuencia = 'Quincenal';
                else if (frecuencia === 3) textoFrecuencia = 'Cada 3 semanas';
                infoReparto = `<div style="background:#e6f0ff;padding:5px 10px;border-radius:5px;margin-top:5px;font-size:12px;">
                    🔄 <strong>${textoFrecuencia}:</strong> ${diasTexto}</div>`;
            } else {
                infoReparto = `<div style="background:#f0f0f0;padding:5px 10px;border-radius:5px;margin-top:5px;font-size:12px;">
                    📅 <strong>Fecha fija</strong></div>`;
            }

            return `
                <tr ${proveedor.visitaRealizada ? 'style="opacity:0.6;"' : ''}>
                    <td><strong>${proveedor.nombre}</strong>${infoReparto}</td>
                    <td>${proveedor.telefono || '-'}</td>
                    <td>${proveedor.email || '-'}</td>
                    <td style="${estiloFecha}">
                        ${esHoy ? '<strong style="color:var(--color-primario);">🔵 Hoy</strong>' : fecha.toLocaleDateString('es-ES')}
                    </td>
                    <td>
                        ${!proveedor.visitaRealizada
                            ? `<button class="btn btn-success" data-accion="marcar-visita" data-id="${proveedor.id}">✓ Marcar</button>`
                            : '<span style="color:#48bb78;font-weight:bold;">✓ Visitado</span>'}
                        ${tienePermisoEditar   ? `<button class="btn btn-primary"  data-accion="editar-proveedor"   data-id="${proveedor.id}">✏️ Editar</button>`   : ''}
                        ${tienePermisoEliminar ? `<button class="btn btn-danger"   data-accion="eliminar-proveedor" data-id="${proveedor.id}">🗑️ Eliminar</button>` : ''}
                    </td>
                </tr>`;
        }).join('');
    }

    // === RENDERIZADO DE REPORTES ===
    renderizarReporte(reporte, contenedor, ventas, reportesManager) {
        if (!contenedor) return;

        const um = window.appInstance?.usuariosManager;
        const puedeVerVentas  = um ? um.tienePermiso('reportes_ventas')  : true;
        const puedeGenerarRep = um ? um.tienePermiso('reportes_generar') : true;

        const porcentajeGanancia = reporte.totalVentas > 0
            ? ((reporte.ganancia / reporte.totalVentas) * 100).toFixed(2) : 0;

        const htmlStats = `
            <div class="stats-grid">
                <div class="stat-card" id="statTotalVentas" style="cursor:pointer;">
                    <h4>Total Ventas</h4>
                    <div class="stat-value">${reporte.cantidadVentas}</div>
                </div>
                <div class="stat-card">
                    <h4>Ingresos Totales</h4>
                    <div class="stat-value">$${reporte.totalVentas.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h4>Costos Proveedores</h4>
                    <div class="stat-value">$${reporte.totalCostos.toFixed(2)}</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#48bb78 0%,#38a169 100%);">
                    <h4>Ganancia Neta</h4>
                    <div class="stat-value">$${reporte.ganancia.toFixed(2)}</div>
                    <small>${porcentajeGanancia}% de margen</small>
                </div>
            </div>`;

        const htmlGrafico = puedeGenerarRep && reporte.ventas.length > 0 ? `
            <div style="background:white;padding:25px;border-radius:12px;margin:20px 0;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                <div style="margin-bottom:20px;display:flex;gap:10px;justify-content:center;">
                    <button id="btnGraficoBarras" class="btn btn-primary">📊 Gráfico de Barras</button>
                    <button id="btnGraficoPastel" class="btn btn-secondary">🥧 Gráfico de Pastel</button>
                </div>
                <div id="contenedorGrafico" style="min-height:300px;display:flex;align-items:center;justify-content:center;">
                    <canvas id="graficoComparativo"></canvas>
                </div>
            </div>` : !puedeGenerarRep ? `
            <div class="alert alert-danger" style="margin:20px 0;">
                🔒 No tienes permiso para generar reportes estadísticos.
            </div>` : '';

        const htmlRanking = puedeGenerarRep && reporte.ventas.length > 0 ? `
            <div style="margin:20px 0;">
                <button id="btnMostrarRankingProductos" class="btn btn-primary">📋 Ver Ranking de Productos</button>
            </div>
            <div id="seccionRankingProductos" class="hidden" style="background:white;padding:20px;border-radius:12px;margin:20px 0;">
                <h4>Ranking de Productos Vendidos</h4>
                <div class="form-group" style="max-width:300px;">
                    <label>Ordenar por:</label>
                    <select id="ordenRankingProductos">
                        <option value="mayor">Mayor cantidad vendida</option>
                        <option value="menor">Menor cantidad vendida</option>
                    </select>
                </div>
                <div id="tablaRankingProductos"></div>
            </div>` : '';

        const htmlTickets = puedeVerVentas ? `
            <div id="seccionTickets">
                <h4>${reporte.titulo}</h4>
                ${reporte.ventas.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Ticket</th><th>Fecha</th><th>Usuario</th>
                                <th>Productos</th><th>Total</th><th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reporte.ventas.map(venta => {
                                const numeroTicket  = ventas.indexOf(venta) + 1;
                                const usuarioNombre = venta.usuario?.nombre || 'Sistema';
                                const usuarioRol    = venta.usuario?.rol    || 'sistema';
                                const iconoRol = usuarioRol === 'administrador' ? '👑' : '👤';
                                return `
                                    <tr>
                                        <td>#${numeroTicket}</td>
                                        <td>${new Date(venta.fecha).toLocaleString()}</td>
                                        <td>
                                            <div class="ticket-usuario">
                                                ${iconoRol} ${usuarioNombre}
                                            </div>
                                        </td>
                                        <td>${venta.items.length} producto(s)</td>
                                        <td>$${venta.total.toFixed(2)}</td>
                                        <td>
                                            <button class="btn btn-secondary"
                                                data-accion="descargar-ticket"
                                                data-index="${ventas.indexOf(venta)}">
                                                📥 Descargar Ticket
                                            </button>
                                        </td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>` : '<p style="text-align:center;padding:20px;">No hay ventas para mostrar</p>'}
            </div>` : `
            <div class="alert alert-danger" style="margin:20px 0;">
                🔒 No tienes permiso para ver el historial de ventas y tickets.
            </div>`;

        contenedor.innerHTML = htmlStats + htmlGrafico + htmlRanking + htmlTickets;

        if (puedeGenerarRep && reporte.ventas.length > 0) {
            this.dibujarGraficoComparativo(reporte, 'barras');
        }
    }

    // === RENDERIZAR RANKING ===
    renderizarRankingProductos(productos, contenedor) {
        if (!contenedor) return;
        if (productos.length === 0) {
            contenedor.innerHTML = '<p style="text-align:center;padding:20px;">No hay datos de productos vendidos</p>';
            return;
        }
        contenedor.innerHTML = `
            <table style="margin-top:15px;">
                <thead>
                    <tr>
                        <th>Posición</th><th>Producto</th><th>Cantidad Vendida</th>
                        <th>Total Ventas</th><th>Total Costos</th><th>Ganancia</th>
                    </tr>
                </thead>
                <tbody>
                    ${productos.map((producto, index) => `
                        <tr>
                            <td><strong>${index + 1}°</strong></td>
                            <td>${producto.nombre}</td>
                            <td><strong>${producto.cantidadVendida}</strong> unidades</td>
                            <td>$${producto.totalVentas.toFixed(2)}</td>
                            <td>$${producto.totalCostos.toFixed(2)}</td>
                            <td style="color:${producto.ganancia >= 0 ? '#48bb78' : '#f56565'};font-weight:bold;">
                                $${producto.ganancia.toFixed(2)}
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }

    // === GRÁFICOS ===
    dibujarGraficoComparativo(reporte, tipo = 'barras') {
        const canvas = document.getElementById('graficoComparativo');
        if (!canvas) return;
        const contenedor = document.getElementById('contenedorGrafico');
        if (tipo === 'barras') {
            canvas.width  = contenedor.offsetWidth - 50;
            canvas.height = 300;
            this.dibujarGraficoBarrasHorizontal(canvas, reporte);
        } else if (tipo === 'pastel') {
            const size = Math.min(contenedor.offsetWidth - 50, 500);
            canvas.width = size; canvas.height = size;
            this.dibujarGraficoPastel(canvas, reporte);
        }
    }

    dibujarGraficoBarrasHorizontal(canvas, reporte) {
        const ctx    = canvas.getContext('2d');
        const width  = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const margenIzq = 150, margenDer = 120, margenTop = 40;
        const alturaBarra = 60, espacioEntreBarra = 30;
        const anchoDisponible = width - margenIzq - margenDer;
        const maxValor = Math.max(reporte.totalVentas, reporte.totalCostos, reporte.ganancia);

        if (!maxValor || maxValor <= 0 || !isFinite(maxValor)) {
            ctx.fillStyle = '#718096'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No hay datos suficientes para graficar', width / 2, height / 2);
            return;
        }

        const datos = [
            { label: 'Ingresos', valor: reporte.totalVentas, color: getComputedStyle(document.documentElement).getPropertyValue('--color-primario').trim() || '#667eea' },
            { label: 'Costos',   valor: reporte.totalCostos, color: getComputedStyle(document.documentElement).getPropertyValue('--color-peligro').trim()  || '#f56565' },
            { label: 'Ganancia', valor: reporte.ganancia,    color: getComputedStyle(document.documentElement).getPropertyValue('--color-exito').trim()    || '#48bb78' }
        ];

        datos.forEach((dato, index) => {
            const y = margenTop + (index * (alturaBarra + espacioEntreBarra));
            const anchoBarra = (dato.valor / maxValor) * anchoDisponible;
            if (!isFinite(anchoBarra) || anchoBarra < 0) return;

            const gradient = ctx.createLinearGradient(margenIzq, 0, margenIzq + Math.max(1, anchoBarra), 0);
            gradient.addColorStop(0, dato.color);
            gradient.addColorStop(1, dato.color + 'cc');
            ctx.fillStyle = gradient;
            ctx.fillRect(margenIzq, y, anchoBarra, alturaBarra);
            ctx.strokeStyle = dato.color; ctx.lineWidth = 2;
            ctx.strokeRect(margenIzq, y, anchoBarra, alturaBarra);
            ctx.fillStyle = '#2d3748'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'right';
            ctx.fillText(dato.label, margenIzq - 10, y + alturaBarra / 2 + 6);
            ctx.textAlign = 'left'; ctx.fillStyle = dato.color; ctx.font = 'bold 18px Arial';
            ctx.fillText(`$${dato.valor.toFixed(2)}`, margenIzq + anchoBarra + 10, y + alturaBarra / 2 + 6);
        });

        ctx.fillStyle = '#2d3748'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Análisis Financiero', width / 2, 25);
    }

    dibujarGraficoPastel(canvas, reporte) {
        const ctx    = canvas.getContext('2d');
        const width  = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const centerX = width / 2, centerY = height / 2;
        const radius  = Math.min(width, height) / 2.8;
        const total   = reporte.totalVentas;

        if (total === 0 || !isFinite(total)) {
            ctx.fillStyle = '#718096'; ctx.font = '18px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No hay datos para mostrar', centerX, centerY);
            return;
        }

        const costoAngulo    = (reporte.totalCostos / total) * 2 * Math.PI;
        const gananciaAngulo = (reporte.ganancia    / total) * 2 * Math.PI;
        let currentAngle     = -Math.PI / 2;

        // Costos
        ctx.beginPath(); ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + costoAngulo); ctx.closePath();
        const gradC = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradC.addColorStop(0, '#ff8a80'); gradC.addColorStop(1, '#f56565');
        ctx.fillStyle = gradC; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        const cMid = currentAngle + costoAngulo / 2;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
        ctx.fillText('Costos', centerX + Math.cos(cMid) * (radius * 0.65), centerY + Math.sin(cMid) * (radius * 0.65) - 10);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${((reporte.totalCostos / total) * 100).toFixed(1)}%`, centerX + Math.cos(cMid) * (radius * 0.65), centerY + Math.sin(cMid) * (radius * 0.65) + 8);
        ctx.shadowBlur = 0; currentAngle += costoAngulo;

        // Ganancia
        ctx.beginPath(); ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + gananciaAngulo); ctx.closePath();
        const gradG = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradG.addColorStop(0, '#81e6d9'); gradG.addColorStop(1, '#48bb78');
        ctx.fillStyle = gradG; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        const gMid = currentAngle + gananciaAngulo / 2;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
        ctx.fillText('Ganancia', centerX + Math.cos(gMid) * (radius * 0.65), centerY + Math.sin(gMid) * (radius * 0.65) - 10);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${((reporte.ganancia / total) * 100).toFixed(1)}%`, centerX + Math.cos(gMid) * (radius * 0.65), centerY + Math.sin(gMid) * (radius * 0.65) + 8);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#2d3748'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Distribución de Ingresos', centerX, 30);
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-primario').trim() || '#667eea';
        ctx.fillText(`Total: $${total.toFixed(2)}`, centerX, height - 20);
    }

    // === LIMPIAR FORMULARIO ===
    limpiarFormulario(formulario) {
        if (formulario) formulario.reset();
    }
}