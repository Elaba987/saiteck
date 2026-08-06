// ui.js - Módulo para manejo de la interfaz de usuario

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
                </div>
            `;
        }
    }

    ocultarCargando() {
        // Se eliminará automáticamente al actualizar el contenido
    }

    // === NAVEGACIÓN ===
    mostrarSeccion(seccionId) {
        // La sección de administración no requiere permiso granular, se controla en app.js
        if (seccionId !== 'administracion') {
            if (window.appInstance && window.appInstance.usuariosManager) {
                const usuarioActual = window.appInstance.usuariosManager.obtenerUsuarioActual();
                if (usuarioActual && !window.appInstance.usuariosManager.tienePermiso(seccionId)) {
                    window.appInstance.uiManager.alerta('No tienes permiso para acceder a esta sección');
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

        // Auto-focus en clave al entrar a ventas (soporte lector de código de barras)
        if (seccionId === 'ventas') {
            setTimeout(() => {
                const claveInput = document.getElementById('buscarClaveVenta');
                if (claveInput) claveInput.focus();
            }, 100);
        }

        // Si se accede a configuración, actualizar datos
        if (seccionId === 'configuracion' && window.configuracionManager) {
            window.configuracionManager.actualizarEmailUsuario();
            window.configuracionManager.cargarColoresDesdeFirestore();

            if (window.appInstance && window.appInstance.actualizarInfoUsuarioEnConfiguracion) {
                window.appInstance.actualizarInfoUsuarioEnConfiguracion();
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
        setTimeout(() => {
            contenedor.innerHTML = '';
        }, 3000);
    }

    confirmar(mensaje) {
        return window.confirm(mensaje);
    }

    prompt(mensaje, valorDefault = '') {
        return window.prompt(mensaje, valorDefault);
    }

    alerta(mensaje) {
        window.alert(mensaje);
    }

    // === RENDERIZADO DE MENÚ ===
    // NOTA: "Pedidos" ya NO es una sección propia del sidebar — vive
    // embebido dentro de la sección "Proveedores" (ver app.js/index.html).
    renderizarMenu(contenedor) {
        const menuItems = [
            { id: 'dashboard',      icono: '📊', texto: 'Dashboard' },
            { id: 'productos',      icono: '📦', texto: 'Productos' },
            { id: 'ventas',         icono: '💰', texto: 'Realizar Venta' },
            { id: 'proveedores',    icono: '🚚', texto: 'Proveedores y Pedidos' },
            { id: 'reportes',       icono: '📈', texto: 'Reportes' },
            { id: 'administracion', icono: '🛡️', texto: 'Administración' },
            { id: 'configuracion',  icono: '⚙️', texto: 'Configuración' }
        ];
        const html = menuItems.map(item => `
            <div class="menu-item ${item.id === 'dashboard' ? 'active' : ''}" data-section="${item.id}">
                ${item.icono} ${item.texto}
            </div>
        `).join('');
        contenedor.innerHTML = html;
    }

    // === RENDERIZADO DE PRODUCTOS ===
    renderizarTablaProductos(productos, tbody) {
        if (!tbody) return;

        const tienePermisoEditar   = window.appInstance?.usuariosManager.tienePermiso('productos_editar')   || false;
        const tienePermisoEliminar = window.appInstance?.usuariosManager.tienePermiso('productos_eliminar') || false;

        tbody.innerHTML = productos.map((producto) => {
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
                </tr>
            `;
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
            const kgEnCarrito     = stockEnCarrito / 1000;
            const kgDisponible    = producto.stock - kgEnCarrito;
            const stockBajo       = kgDisponible < 0.5;

            contenedor.innerHTML = `
                <div style="background:#f0f4ff;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #667eea;">
                    <strong>⚖ ${producto.nombre}</strong>
                    <span style="background:#667eea;color:white;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px;">GRANEL</span><br>
                    Precio: <strong>$${producto.precioVenta.toFixed(2)}/kg</strong><br>
                    Stock disponible: <span class="${stockBajo ? 'low-stock' : ''}">${kgDisponible.toFixed(3)} kg</span>
                    ${kgEnCarrito > 0 ? `<br><small>(${(kgEnCarrito * 1000).toFixed(0)}g ya en carrito)</small>` : ''}
                </div>
            `;
        } else {
            const stockDisponible = producto.stock - stockEnCarrito;
            contenedor.innerHTML = `
                <div style="background:#f7fafc;padding:15px;border-radius:8px;margin:15px 0;">
                    <strong>${producto.nombre}</strong><br>
                    Precio: $${producto.precioVenta.toFixed(2)}<br>
                    Stock disponible: <span class="${stockDisponible < 5 ? 'low-stock' : ''}">${stockDisponible}</span>
                    ${stockEnCarrito > 0 ? `<br><small>(${stockEnCarrito} ya en carrito)</small>` : ''}
                </div>
            `;
        }
    }

    // === RENDERIZADO DE LISTA DE VENTA ACTUAL ===
    renderizarListaVenta(items, contenedor) {
        if (!contenedor) return;
        if (items.length === 0) {
            contenedor.innerHTML = '';
            return;
        }

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
                    </div>
                `;
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
                </div>
            `;
        }).join('');

        contenedor.innerHTML = html;
    }

    // === ACTUALIZAR TOTAL DE VENTA ===
    actualizarTotalVenta(total, elemento) {
        if (elemento) {
            elemento.textContent = total.toFixed(2);
        }
    }

    // === RENDERIZADO DE PROVEEDORES ===
    // NUEVO: muestra una insignia + botón de acceso rápido cuando el
    // proveedor tiene Lista Frecuente Y una fecha de visita asignada.
    renderizarTablaProveedores(proveedores, tbody, proveedoresManager) {
        if (!tbody) return;

        const tienePermisoEditar   = window.appInstance?.usuariosManager.tienePermiso('proveedores_editar')   || false;
        const tienePermisoEliminar = window.appInstance?.usuariosManager.tienePermiso('proveedores_eliminar') || false;
        const puedeGestionarPedidos = window.appInstance?.usuariosManager.tienePermiso('pedidos_gestionar')   || false;

        tbody.innerHTML = proveedores.map((proveedor) => {
            const esHoy = proveedoresManager.esVisitaHoy(proveedor.fechaVisita);
            const [año, mes, dia] = proveedor.fechaVisita.split('-').map(Number);
            const fecha = new Date(año, mes - 1, dia);
            const estiloFecha = esHoy ? 'font-weight:bold;color:var(--color-primario);' : '';
            let infoReparto = '';
            if (proveedor.tipoReparto === 'constante' && proveedor.diasReparto && proveedor.diasReparto.length > 0) {
                const nombresDias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                const diasTexto = proveedor.diasReparto.sort((a,b)=>a-b).map(d=>nombresDias[d]).join(', ');
                const frecuencia = proveedor.frecuenciaReparto || 1;
                let textoFrecuencia = 'Semanal';
                if (frecuencia === 2) textoFrecuencia = 'Quincenal';
                else if (frecuencia === 3) textoFrecuencia = 'Cada 3 semanas';
                infoReparto = `<div style="background:#e6f0ff;padding:5px 10px;border-radius:5px;margin-top:5px;font-size:12px;">
                    🔄 <strong>${textoFrecuencia}:</strong> ${diasTexto}
                </div>`;
            } else {
                infoReparto = `<div style="background:#f0f0f0;padding:5px 10px;border-radius:5px;margin-top:5px;font-size:12px;">
                    📅 <strong>Fecha fija</strong>
                </div>`;
            }
            const cantidadCatalogo = (proveedor.productosAsociados || []).length;
            const catalogoBadge = cantidadCatalogo > 0
                ? `<div style="background:#faf5ff;color:#6b46c1;padding:4px 10px;border-radius:5px;margin-top:5px;font-size:11px;display:inline-block;">
                       📋 ${cantidadCatalogo} producto(s) en catálogo
                   </div>`
                : '';

            // ── NUEVO: Lista Frecuente disponible + fecha de visita asignada ──
            const tieneListaFrecuente = (proveedor.listaFrecuente || []).length > 0;
            const listaFrecuenteBloque = (tieneListaFrecuente && proveedor.fechaVisita && puedeGestionarPedidos)
                ? `<div style="margin-top:6px;">
                       <button class="btn btn-success" style="padding:6px 12px;font-size:12px;"
                           data-accion="pedido-frecuente-rapido" data-id="${proveedor.id}">
                           ⭐ Pedido Frecuente Disponible
                       </button>
                   </div>`
                : '';

            return `
                <tr ${proveedor.visitaRealizada ? 'style="opacity:0.6;"' : ''}>
                    <td>
                        <strong>${proveedor.nombre}</strong>
                        ${infoReparto}
                        ${catalogoBadge}
                        ${listaFrecuenteBloque}
                    </td>
                    <td>${proveedor.telefono || '-'}</td>
                    <td>${proveedor.email || '-'}</td>
                    <td style="${estiloFecha}">
                        ${esHoy ? '<strong style="color:var(--color-primario);">🔵 Hoy</strong>' : fecha.toLocaleDateString('es-ES')}
                    </td>
                    <td>
                        ${!proveedor.visitaRealizada
                            ? `<button class="btn btn-success" data-accion="marcar-visita" data-id="${proveedor.id}">✓ Marcar</button>`
                            : '<span style="color:#48bb78;font-weight:bold;">✓ Visitado</span>'
                        }
                        ${tienePermisoEditar   ? `<button class="btn btn-primary"  data-accion="editar-proveedor"   data-id="${proveedor.id}">✏️ Editar</button>`   : ''}
                        <button class="btn btn-secondary" data-accion="ver-detalle-proveedor" data-id="${proveedor.id}">📋 Ver Detalle</button>
                        ${tienePermisoEliminar ? `<button class="btn btn-danger"   data-accion="eliminar-proveedor" data-id="${proveedor.id}">🗑️ Eliminar</button>` : ''}
                        ${!tienePermisoEditar && !tienePermisoEliminar && proveedor.visitaRealizada ? '<span style="color:#718096;font-size:13px;">Sin permisos</span>' : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // === RENDERIZADO DE REPORTES DE VENTAS ===
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
            </div>
        `;

        const htmlGrafico = puedeGenerarRep && reporte.ventas.length > 0 ? `
            <div style="background:white;padding:25px;border-radius:12px;margin:20px 0;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                <div style="margin-bottom:20px;display:flex;gap:10px;justify-content:center;">
                    <button id="btnGraficoBarras" class="btn btn-primary">📊 Gráfico de Barras</button>
                    <button id="btnGraficoPastel" class="btn btn-secondary">🥧 Gráfico de Pastel</button>
                </div>
                <div id="contenedorGrafico" style="min-height:300px;display:flex;align-items:center;justify-content:center;">
                    <canvas id="graficoComparativo"></canvas>
                </div>
            </div>
        ` : !puedeGenerarRep ? `
            <div class="alert alert-danger" style="margin:20px 0;">
                🔒 No tienes permiso para generar reportes estadísticos.
            </div>
        ` : '';

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
            </div>
        ` : '';

        const htmlTickets = puedeVerVentas ? `
            <div id="seccionTickets">
                <h4>${reporte.titulo}</h4>
                ${reporte.ventas.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Ticket</th>
                                <th>Fecha</th>
                                <th>Usuario</th>
                                <th>Productos</th>
                                <th>Total</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reporte.ventas.map((venta) => {
                                const numeroTicket = ventas.indexOf(venta) + 1;
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
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                ` : '<p style="text-align:center;padding:20px;">No hay ventas para mostrar</p>'}
            </div>
        ` : `
            <div class="alert alert-danger" style="margin:20px 0;">
                🔒 No tienes permiso para ver el historial de ventas y tickets.
            </div>
        `;

        contenedor.innerHTML = htmlStats + htmlGrafico + htmlRanking + htmlTickets;

        if (puedeGenerarRep && reporte.ventas.length > 0) {
            this.dibujarGraficoComparativo(reporte, 'barras');
        }
    }

    // === RENDERIZAR RANKING DE PRODUCTOS ===
    renderizarRankingProductos(productos, contenedor) {
        if (!contenedor) return;
        if (productos.length === 0) {
            contenedor.innerHTML = '<p style="text-align:center;padding:20px;">No hay datos de productos vendidos</p>';
            return;
        }
        const html = `
            <table style="margin-top:15px;">
                <thead>
                    <tr>
                        <th>Posición</th>
                        <th>Producto</th>
                        <th>Cantidad Vendida</th>
                        <th>Total Ventas</th>
                        <th>Total Costos</th>
                        <th>Ganancia</th>
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
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        contenedor.innerHTML = html;
    }

    // === DIBUJAR GRÁFICO COMPARATIVO ===
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
            canvas.width  = size;
            canvas.height = size;
            this.dibujarGraficoPastel(canvas, reporte);
        }
    }

    dibujarGraficoBarrasHorizontal(canvas, reporte) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width, height = canvas.height;
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
        const ctx = canvas.getContext('2d');
        const width = canvas.width, height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        const centerX = width / 2, centerY = height / 2;
        const radius = Math.min(width, height) / 2.8;
        const total = reporte.totalVentas;

        if (total === 0 || !isFinite(total)) {
            ctx.fillStyle = '#718096'; ctx.font = '18px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No hay datos para mostrar', centerX, centerY);
            return;
        }

        const costoAngulo    = (reporte.totalCostos / total) * 2 * Math.PI;
        const gananciaAngulo = (reporte.ganancia    / total) * 2 * Math.PI;
        let currentAngle = -Math.PI / 2;

        ctx.beginPath(); ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + costoAngulo); ctx.closePath();
        const gradC = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradC.addColorStop(0, '#ff8a80'); gradC.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue('--color-peligro').trim() || '#f56565');
        ctx.fillStyle = gradC; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        const cMid = currentAngle + costoAngulo / 2;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
        ctx.fillText('Costos', centerX + Math.cos(cMid) * (radius * 0.65), centerY + Math.sin(cMid) * (radius * 0.65) - 10);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${((reporte.totalCostos / total) * 100).toFixed(1)}%`, centerX + Math.cos(cMid) * (radius * 0.65), centerY + Math.sin(cMid) * (radius * 0.65) + 8);
        ctx.font = '12px Arial';
        ctx.fillText(`$${reporte.totalCostos.toFixed(2)}`, centerX + Math.cos(cMid) * (radius * 0.65), centerY + Math.sin(cMid) * (radius * 0.65) + 24);
        ctx.shadowBlur = 0; currentAngle += costoAngulo;

        ctx.beginPath(); ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + gananciaAngulo); ctx.closePath();
        const gradG = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradG.addColorStop(0, '#81e6d9'); gradG.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue('--color-exito').trim() || '#48bb78');
        ctx.fillStyle = gradG; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        const gMid = currentAngle + gananciaAngulo / 2;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
        ctx.fillText('Ganancia', centerX + Math.cos(gMid) * (radius * 0.65), centerY + Math.sin(gMid) * (radius * 0.65) - 10);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${((reporte.ganancia / total) * 100).toFixed(1)}%`, centerX + Math.cos(gMid) * (radius * 0.65), centerY + Math.sin(gMid) * (radius * 0.65) + 8);
        ctx.font = '12px Arial';
        ctx.fillText(`$${reporte.ganancia.toFixed(2)}`, centerX + Math.cos(gMid) * (radius * 0.65), centerY + Math.sin(gMid) * (radius * 0.65) + 24);
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

    // ═══════════════════════════════════════════════════════════════
    // CATÁLOGO DE PRODUCTOS DEL PROVEEDOR
    //
    // `itemsResueltos` viene YA resuelto por app.js contra ProductosManager:
    // [{ productoClave, productoNombre, precioCompra, existe }]
    // No hay edición de precio local — el precio siempre es el de Productos.
    // ═══════════════════════════════════════════════════════════════

    renderizarCatalogoProveedor(itemsResueltos, contenedor) {
        if (!contenedor) return;

        if (!itemsResueltos || itemsResueltos.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:24px;color:#718096;background:#f7fafc;border-radius:10px;">
                    <span style="font-size:32px;">📋</span>
                    <p style="margin-top:8px;">Aún no hay productos vinculados a este proveedor.</p>
                    <p style="font-size:13px;margin-top:4px;">Agrega productos para armar pedidos con un solo toque.</p>
                </div>`;
            return;
        }

        contenedor.innerHTML = `
            <p style="font-size:12px;color:#a0aec0;margin-bottom:8px;">
                💡 El precio de compra siempre es el mismo registrado en <strong>Productos</strong> —
                si lo actualizas ahí, se refleja aquí automáticamente.
            </p>
            <table style="margin-top:6px;">
                <thead>
                    <tr>
                        <th>Clave</th>
                        <th>Producto</th>
                        <th>Precio Compra (Productos)</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsResueltos.map(p => `
                        <tr ${!p.existe ? 'style="opacity:0.55;"' : ''}>
                            <td>${p.productoClave}</td>
                            <td>${p.existe ? p.productoNombre : `${p.productoNombre} <small style="color:#f56565;">(eliminado de Productos)</small>`}</td>
                            <td>${p.existe ? `$${p.precioCompra.toFixed(2)}` : '-'}</td>
                            <td>
                                <button class="btn btn-danger" data-accion="quitar-producto-catalogo" data-clave="${p.productoClave}">🗑️ Quitar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // === Selector de productos para armar un pedido (o Lista Frecuente) desde el catálogo ===
    // `itemsResueltos`: [{ productoClave, productoNombre, precioCompra, existe, cantidadInicial }]
    renderizarSelectorPedidoDesdeCatalogo(itemsResueltos, contenedor) {
        if (!contenedor) return;

        const disponibles = (itemsResueltos || []).filter(p => p.existe);

        if (disponibles.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:20px;color:#718096;">
                    Este proveedor todavía no tiene productos disponibles en su catálogo.
                </div>`;
            return;
        }

        contenedor.innerHTML = `
            <div style="max-height:340px;overflow-y:auto;">
                ${disponibles.map(p => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;
                                background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;
                                padding:10px 14px;margin-bottom:8px;">
                        <div style="flex:1;">
                            <strong>${p.productoNombre}</strong>
                            <br><small style="color:#718096;">Clave: ${p.productoClave} — $${p.precioCompra.toFixed(2)} c/u (precio de Productos)</small>
                        </div>
                        <input type="number" min="0" value="${p.cantidadInicial || 0}" style="width:90px;padding:8px;"
                               data-clave-catalogo="${p.productoClave}"
                               data-nombre-catalogo="${p.productoNombre}"
                               data-precio-catalogo="${p.precioCompra}"
                               class="input-cantidad-catalogo">
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // NUEVO — LISTA FRECUENTE (plantilla persistente por proveedor)
    // ═══════════════════════════════════════════════════════════════

    renderizarListaFrecuente(itemsResueltos, contenedor) {
        if (!contenedor) return;

        if (!itemsResueltos || itemsResueltos.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:24px;color:#718096;">
                    <span style="font-size:32px;">⭐</span>
                    <p style="margin-top:8px;">Este proveedor no tiene una lista frecuente guardada.</p>
                    <p style="font-size:13px;margin-top:4px;">
                        Crea un pedido y usa "Guardar como Lista Frecuente" para que quede disponible
                        cada vez que este proveedor tenga una visita programada.
                    </p>
                </div>`;
            return;
        }

        contenedor.innerHTML = `
            <p style="font-size:13px;color:#718096;margin-bottom:10px;">
                Esta es la lista que se usa cada vez que tocas <strong>"⭐ Pedido Frecuente Disponible"</strong>.
            </p>
            <div style="max-height:280px;overflow-y:auto;margin-bottom:14px;">
                ${itemsResueltos.map(p => `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                                background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;
                                padding:10px 14px;margin-bottom:6px;">
                        <span>${p.existe ? p.productoNombre : `${p.productoNombre} <small style="color:#f56565;">(eliminado)</small>`}</span>
                        <strong>${p.cantidad}</strong>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary" id="btnEditarListaFrecuente">✏️ Editar Lista</button>
                <button class="btn btn-danger" id="btnEliminarListaFrecuente">🗑️ Eliminar Lista</button>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // NUEVO — HISTORIAL DE VISITAS
    // ═══════════════════════════════════════════════════════════════

    renderizarHistorialVisitas(visitas, contenedor) {
        if (!contenedor) return;

        if (!visitas || visitas.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:24px;color:#718096;">
                    <span style="font-size:32px;">📭</span>
                    <p style="margin-top:8px;">Todavía no hay visitas registradas para este proveedor.</p>
                </div>`;
            return;
        }

        contenedor.innerHTML = `
            <div style="max-height:320px;overflow-y:auto;">
                ${visitas.map(v => {
                    const fecha = new Date(v.fechaRealizada);
                    return `
                        <div style="display:flex;align-items:center;justify-content:space-between;
                                    background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;
                                    padding:10px 14px;margin-bottom:8px;">
                            <div>
                                <strong>✅ Visita realizada</strong>
                                ${v.fechaProgramada ? `<br><small style="color:#718096;">Programada: ${v.fechaProgramada}</small>` : ''}
                            </div>
                            <div style="text-align:right;">
                                <div style="font-weight:600;color:#2d3748;">${fecha.toLocaleDateString()}</div>
                                <small style="color:#718096;">${fecha.toLocaleTimeString()}</small>
                            </div>
                        </div>`;
                }).join('')}
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // PEDIDOS (lista de pendientes) — ahora muestra la descripción de
    // productos de cada pedido y permite Editar / Guardar como Frecuente.
    // ═══════════════════════════════════════════════════════════════

    renderizarTablaPedidos(pedidos, contenedor) {
        if (!contenedor) return;

        if (!pedidos || pedidos.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:30px;color:#718096;">
                    <span style="font-size:40px;">🛒</span>
                    <p style="margin-top:10px;">No hay pedidos pendientes.</p>
                </div>`;
            return;
        }

        contenedor.innerHTML = pedidos.map(p => {
            const fecha = new Date(p.fechaCreacion);
            const descripcionItems = p.items
                .map(i => `${i.productoNombre} ×${i.cantidad}`)
                .join(', ');
            return `
                <div style="background:white;border:2px solid #e2e8f0;border-radius:12px;
                            padding:16px 20px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
                        <div>
                            <strong style="font-size:16px;">${p.proveedorNombre}</strong>
                            <br><small style="color:#718096;">${fecha.toLocaleDateString()} — ${p.items.length} producto(s)</small>
                        </div>
                        <div style="text-align:right;">
                            <strong style="font-size:18px;color:var(--color-primario);">$${p.total.toFixed(2)}</strong>
                        </div>
                    </div>
                    <div style="font-size:13px;color:#4a5568;margin-top:8px;background:#f7fafc;border-radius:6px;padding:8px 10px;">
                        📝 ${descripcionItems}
                    </div>
                    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-success" data-accion="completar-pedido" data-id="${p.id}">✅ Recibir Pedido</button>
                        <button class="btn btn-primary" data-accion="editar-pedido" data-id="${p.id}">✏️ Editar</button>
                        <button class="btn btn-secondary" data-accion="descargar-pedido" data-id="${p.id}">📥 Descargar</button>
                        <button class="btn btn-secondary" data-accion="guardar-frecuente-pedido" data-id="${p.id}">⭐ Guardar como Frecuente</button>
                        <button class="btn btn-danger" data-accion="eliminar-pedido" data-id="${p.id}">🗑️ Eliminar</button>
                    </div>
                </div>`;
        }).join('');
    }

    // ═══════════════════════════════════════════════════════════════
    // NUEVO — CHECKLIST DE RECEPCIÓN DE PEDIDO
    // Cada item: checkbox recibido, cantidad recibida, precio de compra real.
    // ═══════════════════════════════════════════════════════════════

    renderizarChecklistRecepcion(pedido, contenedor) {
        if (!contenedor) return;

        contenedor.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer;">
                    <input type="checkbox" id="chkMarcarTodoRecibido" checked style="width:20px;height:20px;">
                    Marcar todo como recibido
                </label>
            </div>
            <div style="max-height:360px;overflow-y:auto;">
                ${pedido.items.map((item, index) => `
                    <div class="recepcion-item-row"
                         data-index="${index}"
                         style="background:#f7fafc;border:2px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                            <input type="checkbox" class="chk-item-recibido" checked style="width:20px;height:20px;flex-shrink:0;">
                            <strong style="flex:1;">${item.productoNombre}</strong>
                        </div>
                        <div class="form-row" style="margin-bottom:0;">
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="font-size:12px;">Cantidad recibida</label>
                                <input type="number" min="0" class="input-cantidad-recibida"
                                       value="${item.cantidad}" data-clave="${item.productoClave}"
                                       data-nombre="${item.productoNombre}">
                            </div>
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="font-size:12px;">Precio de compra real</label>
                                <input type="number" step="0.01" min="0" class="input-precio-recibido"
                                       value="${item.precioCompra}">
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // HISTORIAL DE COMPRAS POR PROVEEDOR (pedidos completados)
    // ═══════════════════════════════════════════════════════════════

    renderizarHistorialComprasProveedor(pedidos, contenedor) {
        if (!contenedor) return;

        if (!pedidos || pedidos.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:24px;color:#718096;">
                    <span style="font-size:32px;">🧾</span>
                    <p style="margin-top:8px;">Sin compras registradas con este proveedor todavía.</p>
                </div>`;
            return;
        }

        const totalGastado = pedidos.reduce((sum, p) => sum + p.total, 0);

        contenedor.innerHTML = `
            <div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
                <strong>Total histórico con este proveedor:</strong>
                <span style="font-size:18px;color:#276749;font-weight:700;margin-left:8px;">$${totalGastado.toFixed(2)}</span>
            </div>
            <div style="max-height:360px;overflow-y:auto;">
                ${pedidos.map(p => {
                    const fecha = new Date(p.fechaCompletado || p.fechaCreacion);
                    return `
                        <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <small style="color:#718096;">${fecha.toLocaleDateString()}</small>
                                <strong style="color:var(--color-primario);">$${p.total.toFixed(2)}</strong>
                            </div>
                            <div style="font-size:13px;color:#4a5568;margin-top:4px;">
                                ${p.items.map(i => `${i.productoNombre} ×${i.cantidad}`).join(', ')}
                            </div>
                        </div>`;
                }).join('')}
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // REPORTE DE COMPRAS A PROVEEDORES
    // ═══════════════════════════════════════════════════════════════

    renderizarReporteCompras(reporte, contenedor) {
        if (!contenedor) return;

        const htmlStats = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h4>Pedidos</h4>
                    <div class="stat-value">${reporte.cantidadPedidos}</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#009ee3 0%,#0066cc 100%);">
                    <h4>Productos Comprados</h4>
                    <div class="stat-value">${reporte.cantidadProductos}</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#ed8936 0%,#dd6b20 100%);">
                    <h4>Total Gastado</h4>
                    <div class="stat-value">$${reporte.totalCompras.toFixed(2)}</div>
                </div>
            </div>
        `;

        const htmlLista = reporte.pedidos.length > 0 ? `
            <h4 style="margin-top:20px;">${reporte.titulo}</h4>
            <table style="margin-top:10px;">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Proveedor</th>
                        <th>Productos</th>
                        <th>Total</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${reporte.pedidos.map((p, index) => {
                        const fecha = new Date(p.fechaCompletado || p.fechaCreacion);
                        return `
                            <tr>
                                <td>${fecha.toLocaleDateString()}</td>
                                <td>${p.proveedorNombre}</td>
                                <td>${p.items.length} producto(s)</td>
                                <td>$${p.total.toFixed(2)}</td>
                                <td>
                                    <button class="btn btn-secondary" data-accion="descargar-pedido-reporte" data-index="${index}">
                                        📥 Ticket
                                    </button>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        ` : '<p style="text-align:center;padding:20px;">No hay compras para este periodo</p>';

        contenedor.innerHTML = htmlStats + htmlLista;
    }

    // ═══════════════════════════════════════════════════════════════
    // NUEVO — REPORTE DE ENTRADAS Y SALIDAS (flujo de caja)
    // ═══════════════════════════════════════════════════════════════

    renderizarReporteFlujo(reporte, contenedor) {
        if (!contenedor) return;

        const netoColor = reporte.neto >= 0 ? '#48bb78' : '#f56565';

        contenedor.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card" style="background:linear-gradient(135deg,#48bb78 0%,#38a169 100%);">
                    <h4>🟢 Entradas (Ventas)</h4>
                    <div class="stat-value">$${reporte.entradas.toFixed(2)}</div>
                    <small>${reporte.cantidadVentas} venta(s)</small>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#f56565 0%,#c53030 100%);">
                    <h4>🔴 Salidas (Proveedores)</h4>
                    <div class="stat-value">$${reporte.salidasProveedor.toFixed(2)}</div>
                    <small>${reporte.cantidadCompras} compra(s)</small>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,#ed8936 0%,#dd6b20 100%);">
                    <h4>🔴 Salidas (Cambio a clientes)</h4>
                    <div class="stat-value">$${reporte.salidasCambio.toFixed(2)}</div>
                </div>
                <div class="stat-card" style="background:linear-gradient(135deg,${netoColor} 0%,${netoColor}cc 100%);">
                    <h4>${reporte.neto >= 0 ? '📈' : '📉'} Flujo Neto</h4>
                    <div class="stat-value">$${reporte.neto.toFixed(2)}</div>
                </div>
            </div>

            <div style="background:white;padding:20px;border-radius:12px;margin-top:20px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                <h4 style="margin-bottom:14px;">Resumen — ${reporte.titulo}</h4>
                <table>
                    <tbody>
                        <tr><td><strong>Total Entradas</strong></td><td style="text-align:right;color:#276749;font-weight:700;">$${reporte.entradas.toFixed(2)}</td></tr>
                        <tr><td>&nbsp;&nbsp;— Pagos a proveedores</td><td style="text-align:right;color:#c53030;">-$${reporte.salidasProveedor.toFixed(2)}</td></tr>
                        <tr><td>&nbsp;&nbsp;— Cambio entregado a clientes</td><td style="text-align:right;color:#c53030;">-$${reporte.salidasCambio.toFixed(2)}</td></tr>
                        <tr style="border-top:2px solid #e2e8f0;"><td><strong>Flujo Neto</strong></td><td style="text-align:right;font-weight:800;color:${netoColor};">$${reporte.neto.toFixed(2)}</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }
}