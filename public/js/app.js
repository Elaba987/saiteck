// app.js - Módulo principal de la aplicación

import { ProductosManager }    from './modules/productos.js';
import { VentasManager }       from './modules/ventas.js';
import { ProveedoresManager }  from './modules/proveedores.js';
import { ReportesManager }     from './modules/reportes.js';
import { DashboardManager }    from './modules/dashboard.js';
import { UIManager }           from './modules/ui.js';
import { ConfiguracionManager } from './modules/configuracion.js';
import { UsuariosManager }     from './modules/usuarios.js';
import { EscanerManager }      from './modules/escaner.js';
import { AuditoriaManager }    from './modules/auditoria.js';
import { AdminPanelManager }   from './modules/adminPanel.js';
import { TerminalesManager }   from './modules/terminales.js';
import { MercadoPagoManager }  from './modules/mercadopago.js';

// Detectar si estamos en modo prueba (Access Token empieza con APP_USR o TEST)
const MP_IS_TEST_MODE = true; // Cambiar a false en producción

class TiendaApp {
    constructor() {
        this.productosManager    = new ProductosManager();
        this.ventasManager       = new VentasManager();
        this.proveedoresManager  = new ProveedoresManager();
        this.reportesManager     = new ReportesManager(this.ventasManager);
        this.dashboardManager    = new DashboardManager(
            this.productosManager,
            this.proveedoresManager,
            this.ventasManager
        );
        this.uiManager            = new UIManager();
        this.configuracionManager = new ConfiguracionManager();
        this.usuariosManager      = new UsuariosManager();
        this.escanerManager       = new EscanerManager();
        this.auditoriaManager     = new AuditoriaManager();
        this.terminalesManager    = new TerminalesManager();
        this.mercadoPagoManager   = new MercadoPagoManager();
        this.adminPanelManager    = null;

        this.productoSeleccionado = null;
        this.datosInicializados   = false;

        // Estado del flujo de cobro con tarjeta
        this._pagoTarjetaActivo    = false;
        this._terminalSeleccionada = null;  // { id (Firestore), terminalId (MP), nombre }

        this.init();
    }

    init() {
        window.appInstance = this;
        this.renderizarMenu();
        this.inicializarEventListeners();
        this.inicializarModales();
        this.inicializarMenuMobile();
        this.inicializarGestionUsuarios();
        this.inicializarModalNIP();
        this.inicializarEscaner();
        this.inicializarFormulariosColapsables();

        setTimeout(() => {
            this.configuracionManager.inicializar(this.auditoriaManager);
        }, 500);
    }

    // ============================================================
    // FORMULARIOS COLAPSABLES
    // ============================================================
    inicializarFormulariosColapsables() {
        this._bindCollapsible('headerRegistrarProducto',  'bodyRegistrarProducto');
        this._bindCollapsible('headerRegistrarProveedor', 'bodyRegistrarProveedor');
    }

    _bindCollapsible(headerId, bodyId) {
        const header = document.getElementById(headerId);
        const body   = document.getElementById(bodyId);
        if (!header || !body) return;
        const icon = header.querySelector('.collapsible-toggle-icon');
        header.addEventListener('click', () => {
            const isOpen = body.classList.contains('open');
            if (isOpen) {
                body.classList.remove('open');
                header.classList.remove('open');
                icon?.classList.remove('open');
            } else {
                body.classList.add('open');
                header.classList.add('open');
                icon?.classList.add('open');
            }
        });
    }

    // ============================================================
    // MENÚ MOBILE
    // ============================================================
    inicializarMenuMobile() {
        const menuToggle  = document.getElementById('menuToggle');
        const sidebar     = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');

        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
            mainContent?.addEventListener('click', () => {
                if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                }
            });
            sidebar.addEventListener('click', (e) => {
                if (e.target.closest('.menu-item') && window.innerWidth <= 768) {
                    setTimeout(() => sidebar.classList.remove('active'), 300);
                }
            });
        }
    }

    // ============================================================
    // AUTENTICACIÓN / CARGA DE DATOS
    // ============================================================
    async onUserAuthenticated() {
        if (this.datosInicializados) return;

        try {
            this.uiManager.mostrarCargando();
            await this.usuariosManager.inicializar();

            this.productosManager.setAuditoriaManager(this.auditoriaManager);
            this.ventasManager.setAuditoriaManager(this.auditoriaManager);
            this.proveedoresManager.setAuditoriaManager(this.auditoriaManager);
            this.terminalesManager.setAuditoriaManager(this.auditoriaManager);

            this.adminPanelManager = new AdminPanelManager(
                this.auditoriaManager,
                this.usuariosManager
            );

            if (window.configuracionManager) {
                await Promise.all([
                    window.configuracionManager.cargarColoresDesdeFirestore(),
                    window.configuracionManager.cargarMetaVentasDiaria()
                ]);
            }

            await Promise.all([
                this.productosManager.cargarProductos(),
                this.ventasManager.cargarVentas(),
                this.proveedoresManager.cargarProveedores(),
                this.terminalesManager.cargarTerminales()
            ]);

            this.productosManager.iniciarEscucha(() => {
                this.actualizarVistaProductos();
                this.actualizarSelectVentas();
                this.actualizarDashboard();
            });
            this.proveedoresManager.iniciarEscucha(() => {
                this.actualizarVistaProveedores();
                this.actualizarDashboard();
            });
            this.ventasManager.iniciarEscucha(() => {
                this.actualizarDashboard();
            });
            this.terminalesManager.iniciarEscucha(() => {
                this._actualizarVistaTerminales();
            });

            this.actualizarDashboard();
            this.actualizarVistaProductos();
            this.actualizarVistaProveedores();
            this.actualizarSelectVentas();
            this.actualizarMenuSegunPermisos();
            this.actualizarInfoUsuarioEnConfiguracion();
            this.datosInicializados = true;
            this.uiManager.ocultarCargando();
        } catch (error) {
            console.error('Error al inicializar datos:', error);
            this.uiManager.alerta('Error al cargar los datos. Por favor recarga la página.');
        }
    }

    // ============================================================
    // MODAL NIP
    // ============================================================
    inicializarModalNIP() {
        const modal = document.getElementById('modalNIP');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.cerrarModalNIP();
        });
    }

    cerrarModalNIP() {
        const modal = document.getElementById('modalNIP');
        if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    }

    // ============================================================
    // ESCÁNER
    // ============================================================
    inicializarEscaner() {
        const btnVenta = document.getElementById('btnEscanerVenta');
        if (btnVenta) {
            btnVenta.addEventListener('click', () => {
                this.escanerManager.abrir((codigo) => {
                    const campo = document.getElementById('buscarClaveVenta');
                    if (!campo) return;
                    campo.value = codigo;
                    campo.dispatchEvent(new Event('input'));
                    setTimeout(() => {
                        campo.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
                        }));
                    }, 80);
                });
            });
        }

        const btnProducto = document.getElementById('btnEscanerProducto');
        if (btnProducto) {
            btnProducto.addEventListener('click', () => {
                this.escanerManager.abrir((codigo) => {
                    const campo = document.getElementById('clave');
                    if (campo) {
                        campo.value = codigo;
                        document.getElementById('nombre')?.focus();
                    }
                });
            });
        }

        const btnCerrar = document.getElementById('btnCerrarEscaner');
        if (btnCerrar) btnCerrar.addEventListener('click', () => this.escanerManager.cerrar());

        const overlay = document.getElementById('modalEscaner');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.escanerManager.cerrar();
            });
        }
    }

    // ============================================================
    // NIP — SELECCIONAR PERFIL
    // ============================================================
    async solicitarNIP(perfilId) {
        return new Promise((resolve) => {
            const perfil = this.usuariosManager.obtenerPorId(perfilId);
            if (!perfil) { this.uiManager.alerta('Perfil no encontrado'); resolve(false); return; }

            const modal         = document.getElementById('modalNIP');
            const nombreElement = document.getElementById('nipUsuarioNombre');
            const inputs        = [1,2,3,4].map(i => document.getElementById(`nip${i}`));
            const errorElement  = document.getElementById('nipError');

            nombreElement.textContent = perfil.nombre;
            errorElement.textContent  = '';
            let nipActual = '';
            inputs.forEach(inp => inp.value = '');

            const actualizarDisplay = () => {
                inputs.forEach((inp, index) => { inp.value = nipActual[index] ? '•' : ''; });
                inputs[Math.min(nipActual.length, 3)].focus();
            };

            const verificarNIP = async () => {
                if (nipActual.length === 4) {
                    const esValido = await this.usuariosManager.verificarNIP(perfilId, nipActual);
                    if (esValido) {
                        modal.classList.add('hidden');
                        modal.style.display = 'none';
                        resolve(true);
                    } else {
                        errorElement.textContent = '❌ NIP incorrecto';
                        nipActual = '';
                        actualizarDisplay();
                        const content = modal.querySelector('.nip-modal-content');
                        content.style.animation = 'none';
                        setTimeout(() => { content.style.animation = 'slideUp 0.3s ease-out, shake 0.5s ease-in-out'; }, 10);
                    }
                }
            };

            modal.querySelectorAll('.nip-key').forEach(tecla => {
                const nuevo = tecla.cloneNode(true);
                tecla.parentNode.replaceChild(nuevo, tecla);
            });

            modal.querySelectorAll('.nip-key').forEach(tecla => {
                tecla.addEventListener('click', () => {
                    const digit = tecla.dataset.digit;
                    if (digit === 'clear') {
                        if (nipActual.length > 0) { nipActual = nipActual.slice(0,-1); actualizarDisplay(); errorElement.textContent = ''; }
                    } else if (digit === 'cancel') {
                        modal.classList.add('hidden'); modal.style.display = 'none'; resolve(false);
                    } else if (nipActual.length < 4) {
                        nipActual += digit; actualizarDisplay(); verificarNIP();
                    }
                });
            });

            const handleKeyPress = (e) => {
                if (e.key >= '0' && e.key <= '9') {
                    if (nipActual.length < 4) { nipActual += e.key; actualizarDisplay(); errorElement.textContent = ''; verificarNIP(); }
                } else if (e.key === 'Backspace') {
                    if (nipActual.length > 0) { nipActual = nipActual.slice(0,-1); actualizarDisplay(); errorElement.textContent = ''; }
                } else if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleKeyPress);
                    modal.classList.add('hidden'); modal.style.display = 'none'; resolve(false);
                } else if (e.key === 'Enter' && nipActual.length === 4) {
                    verificarNIP();
                }
            };

            document.addEventListener('keydown', handleKeyPress);
            const originalResolve = resolve;
            resolve = (value) => {
                document.removeEventListener('keydown', handleKeyPress);
                originalResolve(value);
            };

            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            actualizarDisplay();
        });
    }

    // ============================================================
    // GESTIÓN DE PERFILES
    // ============================================================
    async cargarPantallaPerfil() {
        await this.usuariosManager.inicializar();
        const perfiles   = this.usuariosManager.obtenerTodos();
        const contenedor = document.getElementById('profilesList');

        const emailElement = document.getElementById('profileUserEmail');
        if (emailElement && window.currentUser) emailElement.textContent = window.currentUser.email;

        if (perfiles.length === 0) {
            contenedor.innerHTML = '<p style="text-align:center;color:#718096;grid-column:1/-1;">No hay perfiles disponibles</p>';
            return;
        }

        contenedor.innerHTML = perfiles.map(perfil => {
            const icono    = perfil.rol === 'administrador' ? '👑' : '👤';
            const clase    = perfil.rol === 'administrador' ? 'admin' : 'employee';
            const rolTexto = perfil.rol === 'administrador' ? 'Administrador' : 'Empleado';
            return `
                <div class="profile-card-item ${clase}" data-id="${perfil.id}">
                    <span class="profile-card-icon">${icono}</span>
                    <div class="profile-card-name">${perfil.nombre}</div>
                    <div class="profile-card-role">${rolTexto}</div>
                </div>
            `;
        }).join('');

        contenedor.querySelectorAll('.profile-card-item').forEach(item => {
            item.addEventListener('click', () => this.seleccionarPerfil(item.dataset.id));
        });
    }

    async seleccionarPerfil(perfilId) {
        const perfil = this.usuariosManager.obtenerPorId(perfilId);
        if (!perfil) { this.uiManager.alerta('Perfil no encontrado'); return; }

        const nipValido = await this.solicitarNIP(perfilId);
        if (!nipValido) return;

        this.usuariosManager.establecerUsuarioActual(perfil);
        this.auditoriaManager.registrar('SESION_INICIO', { perfil: perfil.nombre, rol: perfil.rol }, perfil);

        if (this.datosInicializados) {
            this.datosInicializados = false;
            this.ventasManager.ventaActual = [];
            this.uiManager.mostrarSeccion('dashboard');
        }

        window.mostrarApp();
    }

    actualizarMenuSegunPermisos() {
        document.querySelectorAll('.menu-item').forEach(item => {
            const seccion = item.dataset.section;
            item.style.display = this.usuariosManager.tienePermiso(seccion) ? 'flex' : 'none';
        });
    }

    // ============================================================
    // MODALES GENERALES
    // ============================================================
    inicializarModales() {
        const modales = [
            { id: 'modalEditarProducto',  cerrarId: 'cerrarModalEditarProducto' },
            { id: 'modalEditarProveedor', cerrarId: 'cerrarModalEditarProveedor' },
            { id: 'modalSiguienteVisita', cerrarId: 'cerrarModalSiguienteVisita' },
            { id: 'modalTerminal',        cerrarId: 'cerrarModalTerminal' },
            { id: 'modalCobrarTarjeta',   cerrarId: 'cerrarModalCobrarTarjeta' }
        ];
        modales.forEach(({ id, cerrarId }) => {
            const modal     = document.getElementById(id);
            const btnCerrar = document.getElementById(cerrarId);
            if (btnCerrar) btnCerrar.addEventListener('click', () => this.cerrarModal(id));
            if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) this.cerrarModal(id); });
        });

        document.getElementById('btnCancelarSiguienteVisita')
            ?.addEventListener('click', () => this.cerrarModal('modalSiguienteVisita'));
    }

    cerrarModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    }

    abrirModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
    }

    // ============================================================
    // MENÚ PRINCIPAL
    // ============================================================
    renderizarMenu() {
        const menuContainer = document.getElementById('mainMenu');
        this.uiManager.renderizarMenu(menuContainer);
        menuContainer.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                const seccion = menuItem.dataset.section;
                this.uiManager.mostrarSeccion(seccion);
                if (seccion === 'dashboard')      this.actualizarDashboard();
                if (seccion === 'reportes')       this.mostrarOpcionesReporte();
                if (seccion === 'administracion') this._activarAdminPanel();
                if (seccion === 'configuracion')  this._actualizarVistaTerminales();
            }
        });
        document.getElementById('statsGrid').addEventListener('click', (e) => {
            const statCard = e.target.closest('.stat-card');
            if (statCard?.dataset.section) this.uiManager.mostrarSeccion(statCard.dataset.section);
        });
    }

    async _activarAdminPanel() {
        if (!this.usuariosManager.tienePermiso('administracion')) return;
        if (!this.adminPanelManager) {
            this.adminPanelManager = new AdminPanelManager(this.auditoriaManager, this.usuariosManager);
        }
        await this.adminPanelManager.activar();
    }

    inicializarEventListeners() {
        this.inicializarProductos();
        this.inicializarVentas();
        this.inicializarProveedores();
        this.inicializarReportes();
        this.inicializarTerminales();
    }

    // ============================================================
    // PRODUCTOS
    // ============================================================
    inicializarProductos() {
        document.getElementById('formProducto').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarProducto();
        });

        document.getElementById('esGranel')?.addEventListener('change', () => this._toggleCamposGranel());
        document.getElementById('editEsGranel')?.addEventListener('change', () => this._toggleCamposEditarGranel());
        document.getElementById('buscarProducto').addEventListener('input', () => this.actualizarVistaProductos());
        document.getElementById('ordenarStock').addEventListener('change',  () => this.actualizarVistaProductos());
        document.getElementById('btnDescargarAlmacen').addEventListener('click', () => this.productosManager.descargarArchivoAlmacen());

        document.getElementById('tablaProductos').addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const { accion, id } = btn.dataset;
            if (accion === 'editar')   this.mostrarModalEditarProducto(id);
            if (accion === 'eliminar') this.eliminarProducto(id);
        });

        document.getElementById('formEditarProducto').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarEdicionProducto();
        });
    }

    _toggleCamposGranel() {
        const esGranel     = document.getElementById('esGranel').checked;
        const grupoKilos   = document.getElementById('grupoKilos');
        const grupoKilosPV = document.getElementById('grupoPrecioVentaKilo');
        const labelStock   = document.getElementById('labelStock');
        const labelPrecioV = document.getElementById('labelPrecioVenta');

        if (esGranel) {
            grupoKilos?.classList.remove('hidden');
            grupoKilosPV?.classList.remove('hidden');
            if (labelStock)   labelStock.textContent   = 'Kilos disponibles';
            if (labelPrecioV) labelPrecioV.textContent = 'Precio por kilo (Venta)';
        } else {
            grupoKilos?.classList.add('hidden');
            grupoKilosPV?.classList.add('hidden');
            if (labelStock)   labelStock.textContent   = 'Stock';
            if (labelPrecioV) labelPrecioV.textContent = 'Precio de Venta';
        }
    }

    _toggleCamposEditarGranel() {
        const esGranel        = document.getElementById('editEsGranel').checked;
        const labelEditStock  = document.getElementById('labelEditStock');
        const labelEditPrecioV = document.getElementById('labelEditPrecioVenta');
        if (esGranel) {
            if (labelEditStock)   labelEditStock.textContent   = 'Kilos disponibles';
            if (labelEditPrecioV) labelEditPrecioV.textContent = 'Precio por kilo (Venta)';
        } else {
            if (labelEditStock)   labelEditStock.textContent   = 'Stock';
            if (labelEditPrecioV) labelEditPrecioV.textContent = 'Precio de Venta';
        }
    }

    async registrarProducto() {
        if (!this.usuariosManager.tienePermiso('productos_crear')) {
            this.uiManager.alerta('❌ No tienes permiso para crear productos');
            return;
        }
        const esGranel = document.getElementById('esGranel')?.checked || false;
        const producto = {
            clave:        document.getElementById('clave').value,
            nombre:       document.getElementById('nombre').value,
            precioCompra: document.getElementById('precioCompra').value,
            precioVenta:  document.getElementById('precioVenta').value,
            stock:        document.getElementById('stock').value,
            esGranel
        };
        const resultado = await this.productosManager.agregar(producto);
        if (resultado.success) {
            this.uiManager.mostrarMensaje('mensajeProductos', `✓ ${resultado.message}`, 'success');
            this.uiManager.limpiarFormulario(document.getElementById('formProducto'));
            if (document.getElementById('esGranel')) document.getElementById('esGranel').checked = false;
            this._toggleCamposGranel();
            const body   = document.getElementById('bodyRegistrarProducto');
            const header = document.getElementById('headerRegistrarProducto');
            const icon   = header?.querySelector('.collapsible-toggle-icon');
            body?.classList.remove('open');
            header?.classList.remove('open');
            icon?.classList.remove('open');
        } else {
            this.uiManager.mostrarMensaje('mensajeProductos', `⚠️ ${resultado.message}`, 'error');
        }
    }

    mostrarModalEditarProducto(id) {
        if (!this.usuariosManager.tienePermiso('productos_editar')) {
            this.uiManager.alerta('❌ No tienes permiso para editar productos');
            return;
        }
        const producto = this.productosManager.obtenerPorId(id);
        if (!producto) return;
        document.getElementById('editProductoId').value   = producto.id;
        document.getElementById('editClave').value        = producto.clave;
        document.getElementById('editNombre').value       = producto.nombre;
        document.getElementById('editPrecioCompra').value = producto.precioCompra;
        document.getElementById('editPrecioVenta').value  = producto.precioVenta;
        document.getElementById('editStock').value        = producto.stock;
        const chkEditGranel = document.getElementById('editEsGranel');
        if (chkEditGranel) {
            chkEditGranel.checked = producto.esGranel || false;
            this._toggleCamposEditarGranel();
        }
        this.abrirModal('modalEditarProducto');
    }

    async guardarEdicionProducto() {
        const productoId = document.getElementById('editProductoId').value;
        const esGranel   = document.getElementById('editEsGranel')?.checked || false;
        const datos = {
            clave:        document.getElementById('editClave').value,
            nombre:       document.getElementById('editNombre').value,
            precioCompra: document.getElementById('editPrecioCompra').value,
            precioVenta:  document.getElementById('editPrecioVenta').value,
            stock:        document.getElementById('editStock').value,
            esGranel
        };
        const resultado = await this.productosManager.actualizar(productoId, datos);
        if (resultado.success) {
            this.cerrarModal('modalEditarProducto');
            this.uiManager.alerta('Producto actualizado exitosamente');
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    async eliminarProducto(id) {
        if (!this.usuariosManager.tienePermiso('productos_eliminar')) {
            this.uiManager.alerta('❌ No tienes permiso para eliminar productos');
            return;
        }
        if (this.uiManager.confirmar('¿Eliminar este producto?')) {
            await this.productosManager.eliminar(id);
        }
    }

    actualizarVistaProductos() {
        const busqueda = document.getElementById('buscarProducto').value;
        const ordenar  = document.getElementById('ordenarStock').value;
        let productos  = this.productosManager.buscar(busqueda);
        productos      = ordenar ? this.productosManager.ordenar(ordenar) : productos;
        const tbody    = document.querySelector('#tablaProductos tbody');
        this.uiManager.renderizarTablaProductos(productos, tbody);
    }

    // ============================================================
    // VENTAS
    // ============================================================
    inicializarVentas() {
        const buscarClave = document.getElementById('buscarClaveVenta');
        buscarClave.addEventListener('input', () => this.buscarProductoPorClave());
        buscarClave.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.productoSeleccionado) {
                    if (this.productoSeleccionado.esGranel) {
                        document.getElementById('granelGramos')?.focus();
                    } else {
                        this.agregarAVenta();
                    }
                }
            }
        });

        document.getElementById('buscarNombreVenta').addEventListener('input', () => this.buscarProductoPorNombre());
        document.getElementById('selectProductoVenta').addEventListener('change', () => this.seleccionarProductoPorNombre());
        document.getElementById('btnAgregarVenta').addEventListener('click',   () => this.agregarAVenta());
        document.getElementById('pagoCliente').addEventListener('input',       () => this.calcularCambio());
        document.getElementById('btnPagoExacto').addEventListener('click',     () => this.establecerPagoExacto());
        document.getElementById('btnFinalizarVenta').addEventListener('click', () => this.finalizarVenta());

        // Botón cobrar con tarjeta
        document.getElementById('btnCobrarTarjeta')?.addEventListener('click', () => this.abrirModalCobrarTarjeta());

        this._inicializarGranelListeners();
    }

    _inicializarGranelListeners() {
        const granelPrecio = document.getElementById('granelPrecio');
        const granelGramos = document.getElementById('granelGramos');

        if (granelPrecio) {
            granelPrecio.addEventListener('input', () => {
                if (!this.productoSeleccionado?.esGranel) return;
                const precio     = parseFloat(granelPrecio.value) || 0;
                const precioKilo = this.productoSeleccionado.precioVenta;
                const gramos     = precioKilo > 0 ? (precio / precioKilo) * 1000 : 0;
                if (precio > 0 && granelGramos) granelGramos.value = gramos.toFixed(1);
            });
            granelPrecio.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.agregarAVenta(); }
            });
        }

        if (granelGramos) {
            granelGramos.addEventListener('input', () => {
                if (!this.productoSeleccionado?.esGranel) return;
                const gramos     = parseFloat(granelGramos.value) || 0;
                const precioKilo = this.productoSeleccionado.precioVenta;
                const precio     = (gramos / 1000) * precioKilo;
                if (gramos > 0 && granelPrecio) granelPrecio.value = precio.toFixed(2);
            });
            granelGramos.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.agregarAVenta(); }
            });
        }
    }

    actualizarSelectVentas() {
        const select = document.getElementById('selectProductoVenta');
        this._productosEnSelect = this.productosManager.obtenerTodos();
        this.uiManager.actualizarSelectProductos(this._productosEnSelect, select);
    }

    buscarProductoPorClave() {
        const clave = document.getElementById('buscarClaveVenta').value;
        if (!clave) {
            this.productoSeleccionado = null;
            document.getElementById('infoProductoVenta').innerHTML = '';
            this._ocultarGranel();
            return;
        }
        const producto = this.productosManager.obtenerPorClave(clave);
        if (producto) {
            this.productoSeleccionado = producto;
            document.getElementById('buscarNombreVenta').value   = '';
            document.getElementById('selectProductoVenta').value = '';
            this.mostrarInfoProductoVenta();
        } else {
            this.productoSeleccionado = null;
            document.getElementById('infoProductoVenta').innerHTML = '';
            this._ocultarGranel();
        }
    }

    buscarProductoPorNombre() {
        const termino = document.getElementById('buscarNombreVenta').value;
        if (!termino) { this.actualizarSelectVentas(); return; }
        const productos = this.productosManager.buscar(termino);
        this._productosEnSelect = productos;
        if (productos.length === 1) {
            this.productoSeleccionado = productos[0];
            this.mostrarInfoProductoVenta();
        }
        this.uiManager.actualizarSelectProductos(productos, document.getElementById('selectProductoVenta'));
    }

    seleccionarProductoPorNombre() {
        const select = document.getElementById('selectProductoVenta');
        const idx    = select.value;
        if (idx === '' || idx === null || idx === undefined) {
            this.productoSeleccionado = null;
            document.getElementById('infoProductoVenta').innerHTML = '';
            this._ocultarGranel();
            return;
        }
        const lista    = this._productosEnSelect || this.productosManager.obtenerTodos();
        const producto = lista[parseInt(idx)];
        if (producto) {
            this.productoSeleccionado = producto;
            document.getElementById('buscarClaveVenta').value  = producto.clave;
            document.getElementById('buscarNombreVenta').value = producto.nombre;
            this.mostrarInfoProductoVenta();
        }
    }

    mostrarInfoProductoVenta() {
        const producto   = this.productoSeleccionado;
        const contenedor = document.getElementById('infoProductoVenta');
        if (!producto || !contenedor) return;

        const stockTexto  = producto.esGranel ? `${producto.stock.toFixed(3)} kg` : producto.stock;
        const precioTexto = producto.esGranel ? `$${producto.precioVenta.toFixed(2)}/kg` : `$${producto.precioVenta.toFixed(2)}`;

        contenedor.innerHTML = `
            <div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:8px;padding:12px;margin:10px 0;">
                <strong>${producto.nombre}</strong>
                ${producto.esGranel ? '<span style="background:#e6f0ff;color:#667eea;font-size:11px;padding:2px 7px;border-radius:10px;margin-left:5px;">⚖ Granel</span>' : ''}
                <br>
                <small>Precio: ${precioTexto} | Stock disponible: ${stockTexto}</small>
            </div>
        `;

        if (producto.esGranel) {
            this._mostrarGranel();
        } else {
            this._ocultarGranel();
            const cantInput = document.getElementById('cantidadVenta');
            if (cantInput) { cantInput.value = 1; cantInput.focus(); }
        }
    }

    _mostrarGranel() {
        const grupoGranel   = document.getElementById('granelVentaGroup');
        const cantidadGroup = document.getElementById('cantidadVentaGroup');
        if (grupoGranel)   grupoGranel.style.display = 'block';
        if (cantidadGroup) cantidadGroup.style.display = 'none';
        const granelGramos = document.getElementById('granelGramos');
        document.getElementById('granelPrecio').value = '';
        if (granelGramos) { granelGramos.value = ''; granelGramos.focus(); }
    }

    _ocultarGranel() {
        const grupoGranel   = document.getElementById('granelVentaGroup');
        const cantidadGroup = document.getElementById('cantidadVentaGroup');
        if (grupoGranel)   grupoGranel.style.display = 'none';
        if (cantidadGroup) cantidadGroup.style.display = 'block';
    }

    agregarAVenta() {
        if (!this.productoSeleccionado) { this.uiManager.alerta('Seleccione un producto'); return; }

        if (this.productoSeleccionado.esGranel) {
            const gramosInput = parseFloat(document.getElementById('granelGramos').value) || 0;
            const precioInput = parseFloat(document.getElementById('granelPrecio').value) || 0;

            if (gramosInput <= 0 && precioInput <= 0) {
                this.uiManager.alerta('Ingrese los gramos o el precio a cobrar');
                return;
            }

            const precioKilo   = this.productoSeleccionado.precioVenta;
            const gramos       = gramosInput > 0 ? gramosInput : (precioInput / precioKilo) * 1000;
            const precio       = precioInput > 0 ? precioInput : (gramos / 1000) * precioKilo;
            const kgEnCarrito  = this.ventasManager.obtenerStockEnCarrito(this.productoSeleccionado.clave) / 1000;
            const kgDisponible = this.productoSeleccionado.stock - kgEnCarrito;

            if (gramos / 1000 > kgDisponible) {
                this.uiManager.alerta(`Stock insuficiente. Solo quedan ${(kgDisponible * 1000).toFixed(0)} g disponibles.`);
                return;
            }
            this.ventasManager.agregarItemGranel(this.productoSeleccionado, gramos, precio);

        } else {
            const cantidad        = parseInt(document.getElementById('cantidadVenta').value) || 1;
            const stockEnCarrito  = this.ventasManager.obtenerStockEnCarrito(this.productoSeleccionado.clave);
            const stockDisponible = this.productoSeleccionado.stock - stockEnCarrito;

            if (cantidad > stockDisponible) {
                this.uiManager.alerta(`Stock insuficiente. Solo quedan ${stockDisponible} unidades disponibles.`);
                return;
            }
            this.ventasManager.agregarItemVenta(this.productoSeleccionado, cantidad);
        }

        document.getElementById('cantidadVenta').value         = '';
        document.getElementById('buscarClaveVenta').value      = '';
        document.getElementById('buscarNombreVenta').value     = '';
        document.getElementById('selectProductoVenta').value   = '';
        document.getElementById('infoProductoVenta').innerHTML = '';
        this.productoSeleccionado = null;
        this._ocultarGranel();
        this.actualizarVistaVentaActual();
        setTimeout(() => { document.getElementById('buscarClaveVenta')?.focus(); }, 50);
    }

    actualizarVistaVentaActual() {
        const items         = this.ventasManager.obtenerVentaActual();
        const contenedor    = document.getElementById('listaVenta');
        const totalElemento = document.getElementById('totalVenta');
        this.uiManager.renderizarListaVenta(items, contenedor);
        this.uiManager.actualizarTotalVenta(this.ventasManager.calcularTotal(), totalElemento);
        this.calcularCambio();
    }

    modificarCantidadCarrito(index, nuevaCantidad) {
        const item = this.ventasManager.obtenerVentaActual()[index];
        if (!item) return;
        if (nuevaCantidad > item.producto.stock) {
            this.uiManager.alerta(`Stock insuficiente. Máximo: ${item.producto.stock}`);
            return;
        }
        const cambio = nuevaCantidad - item.cantidad;
        if (cambio !== 0) { this.ventasManager.modificarCantidadItem(index, cambio); this.actualizarVistaVentaActual(); }
    }

    aumentarCantidadCarrito(index) {
        const item = this.ventasManager.obtenerVentaActual()[index];
        if (!item) return;
        const stockEnCarrito  = this.ventasManager.obtenerStockEnCarrito(item.producto.clave);
        const stockDisponible = item.producto.stock - (stockEnCarrito - item.cantidad);
        if (item.cantidad >= stockDisponible) {
            this.uiManager.alerta(`Stock insuficiente. Máximo disponible: ${stockDisponible}`);
            return;
        }
        this.ventasManager.modificarCantidadItem(index, 1);
        this.actualizarVistaVentaActual();
    }

    disminuirCantidadCarrito(index) {
        const item = this.ventasManager.obtenerVentaActual()[index];
        if (!item) return;
        if (item.cantidad <= 1) {
            if (this.uiManager.confirmar('¿Eliminar este producto del carrito?')) {
                this.ventasManager.quitarItemVenta(index);
                this.actualizarVistaVentaActual();
            }
            return;
        }
        this.ventasManager.modificarCantidadItem(index, -1);
        this.actualizarVistaVentaActual();
    }

    eliminarDelCarrito(index) {
        if (this.uiManager.confirmar('¿Eliminar este producto del carrito?')) {
            this.ventasManager.quitarItemVenta(index);
            this.actualizarVistaVentaActual();
        }
    }

    calcularCambio() {
        const total       = this.ventasManager.calcularTotal();
        const pago        = parseFloat(document.getElementById('pagoCliente').value) || 0;
        const cambio      = pago - total;
        const cambioInput = document.getElementById('cambioVenta');
        if (pago >= total && total > 0) {
            cambioInput.value       = `$${cambio.toFixed(2)}`;
            cambioInput.style.color = '#48bb78';
        } else if (pago > 0) {
            cambioInput.value       = 'Insuficiente';
            cambioInput.style.color = '#f56565';
        } else {
            cambioInput.value = '';
        }
    }

    establecerPagoExacto() {
        const total = this.ventasManager.calcularTotal();
        document.getElementById('pagoCliente').value = total.toFixed(2);
        this.calcularCambio();
    }

    async finalizarVenta(opcionesPago = {}) {
        const items = this.ventasManager.obtenerVentaActual();
        if (items.length === 0) { this.uiManager.alerta('No hay productos en la venta'); return; }

        const total      = this.ventasManager.calcularTotal();
        const metodoPago = opcionesPago.metodoPago || 'efectivo';

        if (metodoPago === 'efectivo') {
            const pago = parseFloat(document.getElementById('pagoCliente').value) || 0;
            if (pago < total) { this.uiManager.alerta('El pago es insuficiente'); return; }
            opcionesPago.pago   = pago;
            opcionesPago.cambio = pago - total;
        }

        const resultado = await this.ventasManager.finalizarVenta(opcionesPago);
        if (!resultado.success) { this.uiManager.alerta(resultado.message); return; }

        if (metodoPago === 'efectivo') {
            resultado.venta.pago   = opcionesPago.pago;
            resultado.venta.cambio = opcionesPago.cambio;
        } else {
            resultado.venta.pago   = total;
            resultado.venta.cambio = 0;
        }

        for (const item of resultado.venta.items) {
            const cantidadReducir = item.esGranel ? item.gramos : item.cantidad;
            await this.productosManager.reducirStock(item.producto.clave, cantidadReducir);
        }

        const usuarioNombre  = resultado.venta.usuario?.nombre || 'Sistema';
        const metodoPagoText = metodoPago === 'tarjeta'
            ? `Tarjeta MP — ${opcionesPago.infoTarjeta?.terminalNombre || 'terminal'}`
            : 'Efectivo';

        this.uiManager.alerta(
            `✅ Venta realizada exitosamente.\nAtendido por: ${usuarioNombre}\nMétodo: ${metodoPagoText}\nTotal: $${total.toFixed(2)}`
            + (metodoPago === 'efectivo' ? `\nPago: $${opcionesPago.pago.toFixed(2)}\nCambio: $${opcionesPago.cambio.toFixed(2)}` : '')
        );

        if (this.uiManager.confirmar('¿Descargar ticket de venta?')) {
            this.ventasManager.descargarTicket(resultado.venta, resultado.venta.numeroTicket);
        }

        document.getElementById('pagoCliente').value = '';
        document.getElementById('cambioVenta').value = '';
        this.actualizarVistaVentaActual();
        setTimeout(() => { document.getElementById('buscarClaveVenta')?.focus(); }, 50);
    }

    // ============================================================
    // COBRO CON TARJETA — MERCADO PAGO (Orders API v1)
    // ============================================================

    abrirModalCobrarTarjeta() {
        const items = this.ventasManager.obtenerVentaActual();
        if (items.length === 0) {
            this.uiManager.alerta('Agrega productos a la venta antes de cobrar con tarjeta');
            return;
        }

        const terminales = this.terminalesManager.obtenerActivas();
        if (terminales.length === 0) {
            this.uiManager.alerta('No hay terminales registradas. Ve a Configuración → Terminales para agregar una.');
            return;
        }

        const total      = this.ventasManager.calcularTotal();
        const contenedor = document.getElementById('cobrarTarjetaContenido');
        if (!contenedor) return;

        // Limpiar estado anterior
        this.mercadoPagoManager.limpiarOrderActual();
        this._pagoTarjetaActivo    = false;
        this._terminalSeleccionada = null;

        const testBadge = MP_IS_TEST_MODE
            ? '<span class="mp-test-badge">🧪 Modo prueba</span>'
            : '';

        contenedor.innerHTML = `
            <!-- Paso 1: Selección de terminal y monto -->
            <div id="mpPaso1">
                <div class="mp-total-badge">
                    <span class="mp-total-label">Total a cobrar ${testBadge}</span>
                    <span class="mp-total-amount">$${total.toFixed(2)}</span>
                </div>

                <div class="form-group">
                    <label style="font-weight:700;color:#2d3748;margin-bottom:8px;display:block;">
                        🖥️ Seleccionar terminal
                    </label>
                    <select id="mpSelectTerminal" class="mp-terminal-select">
                        <option value="">-- Elige una terminal --</option>
                        ${terminales.map(t => `
                            <option value="${t.id}"
                                    data-terminal-id="${t.terminalId}"
                                    data-nombre="${t.nombre}">
                                ${t.nombre}
                                <small style="color:#718096;">(${t.terminalId})</small>
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">
                    <button id="btnMPEnviar" class="btn-mp-confirmar" style="flex:1;">
                        💳 Enviar cobro a terminal
                    </button>
                    <button id="btnMPCancelarPaso1" class="btn-mp-cancelar">
                        Cancelar
                    </button>
                </div>
            </div>

            <!-- Paso 2: Estado de la order / esperando pago -->
            <div id="mpPaso2" class="hidden">
                <div class="mp-estado-container" id="mpEstadoContenedor">
                    <span id="mpEstadoIcono" class="mp-estado-icono">📡</span>
                    <p id="mpEstadoTexto" class="mp-estado-texto">Enviando a terminal...</p>
                    <p id="mpEstadoSub" class="mp-estado-sub"></p>
                    <div id="mpOrderIdBadge" class="mp-order-id-badge hidden"></div>
                </div>

                <div class="mp-progress-bar" id="mpProgressBar">
                    <div class="mp-progress-fill"></div>
                </div>

                <div class="mp-actions">
                    <button id="btnMPConfirmar" class="btn-mp-confirmar hidden">
                        ✅ Confirmar pago recibido
                    </button>
                    <button id="btnMPCancelarIntent" class="btn-mp-cancelar">
                        ❌ Cancelar cobro
                    </button>
                </div>

                ${MP_IS_TEST_MODE ? `
                <!-- Simulador solo en modo prueba -->
                <div class="mp-simulator-section" id="mpSimulador">
                    <div class="mp-simulator-title">
                        Simulador de pago (solo en modo prueba)
                    </div>
                    <p style="font-size:12px;color:#92400e;margin-bottom:10px;">
                        Como no hay terminal física, simula el resultado del pago:
                    </p>
                    <div class="mp-simulator-btns">
                        <button id="btnSimulateApproved" class="btn-simulate btn-simulate-approved">
                            ✅ Simular pago aprobado
                        </button>
                        <button id="btnSimulateRejected" class="btn-simulate btn-simulate-rejected">
                            ❌ Simular pago rechazado
                        </button>
                        <button id="btnSimulateCancel" class="btn-simulate btn-simulate-cancel">
                            🚫 Simular cancelación
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        // Eventos del modal
        document.getElementById('btnMPEnviar')?.addEventListener('click',       () => this._enviarCobroATerminal());
        document.getElementById('btnMPCancelarPaso1')?.addEventListener('click', () => this.cerrarModal('modalCobrarTarjeta'));
        document.getElementById('btnMPCancelarIntent')?.addEventListener('click', () => this._cancelarCobroTarjeta());
        document.getElementById('btnMPConfirmar')?.addEventListener('click',     () => this._confirmarPagoTarjeta());

        // Botones del simulador (solo modo prueba)
        if (MP_IS_TEST_MODE) {
            document.getElementById('btnSimulateApproved')?.addEventListener('click', () => this._simularEstado('processed'));
            document.getElementById('btnSimulateRejected')?.addEventListener('click', () => this._simularEstado('failed'));
            document.getElementById('btnSimulateCancel')?.addEventListener('click',   () => this._simularEstado('canceled'));
        }

        this.abrirModal('modalCobrarTarjeta');
    }

    async _enviarCobroATerminal() {
        const select    = document.getElementById('mpSelectTerminal');
        const option    = select?.selectedOptions[0];
        const firestoreId = select?.value;
        const terminalId  = option?.dataset.terminalId;
        const nombre      = option?.dataset.nombre;

        if (!firestoreId || !terminalId) {
            this.uiManager.alerta('Selecciona una terminal');
            return;
        }

        this._terminalSeleccionada = { id: firestoreId, terminalId, nombre };

        const total       = this.ventasManager.calcularTotal();
        const items       = this.ventasManager.obtenerVentaActual();
        const descripcion = items.length === 1
            ? items[0].producto.nombre
            : `Venta de ${items.length} productos`;

        // Pasar al paso 2
        document.getElementById('mpPaso1').classList.add('hidden');
        document.getElementById('mpPaso2').classList.remove('hidden');

        // Ocultar simulador hasta tener la order
        if (MP_IS_TEST_MODE) {
            document.getElementById('mpSimulador')?.classList.add('hidden');
        }

        this._actualizarEstadoMP('created');

        // Crear order con la Orders API
        const resultado = await this.mercadoPagoManager.crearOrder(terminalId, total, descripcion);

        if (!resultado.success) {
            // Volver al paso 1
            document.getElementById('mpPaso2').classList.add('hidden');
            document.getElementById('mpPaso1').classList.remove('hidden');
            this.uiManager.alerta(`❌ No se pudo crear la order:\n${resultado.mensaje}`);
            return;
        }

        this._pagoTarjetaActivo = true;

        // Mostrar Order ID
        const orderBadge = document.getElementById('mpOrderIdBadge');
        if (orderBadge) {
            orderBadge.textContent = `Order ID: ${resultado.orderId}`;
            orderBadge.classList.remove('hidden');
        }

        // Mostrar simulador una vez creada la order
        if (MP_IS_TEST_MODE) {
            document.getElementById('mpSimulador')?.classList.remove('hidden');
        }

        // Auditoría
        this.auditoriaManager.registrar('PAGO_TARJETA_INICIADO', {
            terminal: nombre,
            terminalId,
            orderId:  resultado.orderId,
            monto:    `$${total.toFixed(2)}`
        });

        // Iniciar polling para detectar cambios de estado automáticamente
        this.mercadoPagoManager.setOnEstadoCambia((estado) => {
            this._actualizarEstadoMP(estado);
        });
        this.mercadoPagoManager.iniciarPolling(resultado.orderId);
    }

    _actualizarEstadoMP(estado) {
        const info = this.mercadoPagoManager.describirEstado(estado);

        const iconoEl    = document.getElementById('mpEstadoIcono');
        const textoEl    = document.getElementById('mpEstadoTexto');
        const subEl      = document.getElementById('mpEstadoSub');
        const barEl      = document.getElementById('mpProgressBar');
        const btnConf    = document.getElementById('btnMPConfirmar');
        const btnCancel  = document.getElementById('btnMPCancelarIntent');

        if (iconoEl) {
            iconoEl.textContent = info.icono;
            // Detener animación en estados terminales
            if (['processed', 'canceled', 'expired', 'failed'].includes(estado)) {
                iconoEl.classList.add('static');
            } else {
                iconoEl.classList.remove('static');
            }
        }
        if (textoEl) { textoEl.textContent = info.texto; textoEl.style.color = info.color; }

        const subs = {
            'created':         'La order fue enviada. La terminal debería mostrar la pantalla de pago en breve.',
            'at_terminal':     'La terminal recibió la solicitud. Pide al cliente que acerque o inserte su tarjeta.',
            'processed':       '¡El pago fue aprobado! Confirma para registrar la venta en el sistema.',
            'canceled':        'El pago fue cancelado. Puedes intentar de nuevo o cobrar en efectivo.',
            'expired':         'La order expiró sin ser procesada (15 min). Intenta de nuevo.',
            'failed':          'El pago fue rechazado. Intenta de nuevo o cobra en efectivo.',
            'action_required': 'La terminal requiere una acción del cliente o del cajero.'
        };
        if (subEl) subEl.textContent = subs[estado] || '';

        // Mostrar botón confirmar solo cuando el pago fue procesado
        if (btnConf) {
            if (estado === 'processed') {
                btnConf.classList.remove('hidden');
            } else {
                btnConf.classList.add('hidden');
            }
        }

        // Deshabilitar cancelar en estados terminales
        if (btnCancel) {
            if (['processed', 'canceled', 'expired', 'failed'].includes(estado)) {
                btnCancel.disabled    = true;
                btnCancel.textContent = estado === 'processed' ? '✅ Pago exitoso' : '❌ Finalizado';
            }
        }

        // Ocultar barra de progreso en estados terminales
        if (['processed', 'canceled', 'expired', 'failed'].includes(estado)) {
            if (barEl) barEl.style.display = 'none';
        }
    }

    /**
     * Simula un cambio de estado de la order (solo modo prueba).
     * En producción, el estado cambia automáticamente via polling.
     */
    _simularEstado(estado) {
        this.mercadoPagoManager.detenerPolling();
        const order = this.mercadoPagoManager.obtenerOrderActual();
        if (order) order.status = estado;
        this._actualizarEstadoMP(estado);

        if (estado === 'failed' || estado === 'canceled' || estado === 'expired') {
            const tipo = estado === 'canceled' ? 'PAGO_TARJETA_CANCELADO'
                       : estado === 'expired'  ? 'PAGO_TARJETA_EXPIRADO'
                       : 'PAGO_TARJETA_FALLIDO';
            this.auditoriaManager.registrar(tipo, {
                terminal: this._terminalSeleccionada?.nombre || '-',
                motivo:   `Simulado: ${estado}`
            });
        }
    }

    async _cancelarCobroTarjeta() {
        if (!this._pagoTarjetaActivo) {
            this.cerrarModal('modalCobrarTarjeta');
            return;
        }

        const order = this.mercadoPagoManager.obtenerOrderActual();

        if (order?.id) {
            const resultado = await this.mercadoPagoManager.cancelarOrder(order.id);

            this.auditoriaManager.registrar('PAGO_TARJETA_CANCELADO', {
                terminal: this._terminalSeleccionada?.nombre || '-',
                orderId:  order.id,
                monto:    `$${order.monto?.toFixed(2) || '0.00'}`
            });

            if (!resultado.success) {
                // Si no se pudo cancelar por API (ej: ya está at_terminal), avisar
                this.uiManager.alerta(`ℹ️ ${resultado.mensaje}`);
            }
        }

        this.mercadoPagoManager.limpiarOrderActual();
        this._pagoTarjetaActivo    = false;
        this._terminalSeleccionada = null;
        this.cerrarModal('modalCobrarTarjeta');
    }

    async _confirmarPagoTarjeta() {
        if (!this._terminalSeleccionada) return;

        const total = this.ventasManager.calcularTotal();
        const order = this.mercadoPagoManager.obtenerOrderActual();

        this.auditoriaManager.registrar('PAGO_TARJETA_CONFIRMADO', {
            terminal: this._terminalSeleccionada.nombre,
            orderId:  order?.id || '-',
            monto:    `$${total.toFixed(2)}`
        });

        this.mercadoPagoManager.limpiarOrderActual();
        this._pagoTarjetaActivo = false;
        this.cerrarModal('modalCobrarTarjeta');

        await this.finalizarVenta({
            metodoPago: 'tarjeta',
            infoTarjeta: {
                terminalNombre: this._terminalSeleccionada.nombre,
                terminalId:     this._terminalSeleccionada.terminalId,
                orderId:        order?.id || ''
            }
        });

        this._terminalSeleccionada = null;
    }

    // ============================================================
    // PROVEEDORES
    // ============================================================
    inicializarProveedores() {
        document.getElementById('formProveedor').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarProveedor();
        });
        document.getElementById('tipoReparto').addEventListener('change', () => this.toggleTipoReparto());
        this.establecerFechasMinimas();
        document.getElementById('buscarProveedor').addEventListener('input', () => this.actualizarVistaProveedores());

        const ordenarProv = document.getElementById('ordenarProveedores');
        if (ordenarProv) ordenarProv.addEventListener('change', () => this.actualizarVistaProveedores());

        document.getElementById('tablaProveedores').addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const { accion, id } = btn.dataset;
            if (accion === 'eliminar-proveedor') this.eliminarProveedor(id);
            if (accion === 'marcar-visita')       this.marcarVisita(id);
            if (accion === 'editar-proveedor')    this.mostrarModalEditarProveedor(id);
        });

        document.getElementById('formEditarProveedor').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarEdicionProveedor();
        });
        document.getElementById('btnConfirmarSiguienteVisita').addEventListener('click', () => this.confirmarSiguienteVisita());
    }

    establecerFechasMinimas() {
        const hoy      = new Date();
        const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        ['fechaVisita','editFechaVisita','siguienteVisitaFecha'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.setAttribute('min', fechaHoy);
        });
    }

    toggleTipoReparto() {
        const tipo = document.getElementById('tipoReparto').value;
        if (tipo === 'manual') {
            document.getElementById('grupoFechaManual')?.classList.remove('hidden');
            document.getElementById('grupoDiasConstantes')?.classList.add('hidden');
        } else {
            document.getElementById('grupoFechaManual')?.classList.add('hidden');
            document.getElementById('grupoDiasConstantes')?.classList.remove('hidden');
        }
    }

    async registrarProveedor() {
        if (!this.usuariosManager.tienePermiso('proveedores_crear')) {
            this.uiManager.alerta('❌ No tienes permiso para crear proveedores');
            return;
        }
        const tipoReparto = document.getElementById('tipoReparto').value;
        const proveedor   = {
            nombre:   document.getElementById('nombreProveedor').value,
            telefono: document.getElementById('telefonoProveedor').value,
            email:    document.getElementById('emailProveedor').value,
            tipoReparto
        };

        if (tipoReparto === 'manual') {
            proveedor.fechaVisita = document.getElementById('fechaVisita').value;
            if (!proveedor.fechaVisita) { this.uiManager.alerta('Seleccione una fecha de visita'); return; }
            proveedor.diasReparto       = [];
            proveedor.frecuenciaReparto = 1;
        } else {
            const checkboxes = document.querySelectorAll('input[name="diasReparto"]:checked');
            proveedor.diasReparto = Array.from(checkboxes).map(cb => parseInt(cb.value));
            if (proveedor.diasReparto.length === 0) { this.uiManager.alerta('Seleccione al menos un día de reparto'); return; }
            proveedor.frecuenciaReparto = parseInt(document.getElementById('frecuenciaReparto').value) || 1;
            proveedor.fechaVisita = this.proveedoresManager.calcularProximaFechaConstante(proveedor.diasReparto, proveedor.frecuenciaReparto);
        }

        const resultado = await this.proveedoresManager.agregar(proveedor);
        if (resultado.success) {
            this.uiManager.alerta(resultado.message);
            document.getElementById('formProveedor').reset();
            document.querySelectorAll('input[name="diasReparto"]').forEach(cb => cb.checked = false);
            document.getElementById('grupoFechaManual')?.classList.remove('hidden');
            document.getElementById('grupoDiasConstantes')?.classList.add('hidden');
            const body   = document.getElementById('bodyRegistrarProveedor');
            const header = document.getElementById('headerRegistrarProveedor');
            const icon   = header?.querySelector('.collapsible-toggle-icon');
            body?.classList.remove('open');
            header?.classList.remove('open');
            icon?.classList.remove('open');
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    async marcarVisita(id) {
        const proveedor = this.proveedoresManager.obtenerPorId(id);
        if (!proveedor) { this.uiManager.alerta('Error: Proveedor no encontrado'); return; }
        if (this.uiManager.confirmar(`¿Marcar visita de "${proveedor.nombre}" como realizada?`)) {
            const resultado = await this.proveedoresManager.marcarVisitaRealizada(id);
            if (resultado.success) {
                if (proveedor.tipoReparto === 'constante' && proveedor.diasReparto?.length > 0) {
                    await this.proveedoresManager.programarSiguienteVisita(id, null);
                    this.uiManager.alerta('Visita marcada. Próxima visita programada automáticamente.');
                } else {
                    document.getElementById('siguienteVisitaId').value = id;
                    const manana = new Date();
                    manana.setDate(manana.getDate() + 1);
                    document.getElementById('siguienteVisitaFecha').value = manana.toISOString().split('T')[0];
                    this.abrirModal('modalSiguienteVisita');
                }
            }
        }
    }

    async confirmarSiguienteVisita() {
        const proveedorId = document.getElementById('siguienteVisitaId').value;
        const nuevaFecha  = document.getElementById('siguienteVisitaFecha').value;
        if (nuevaFecha) await this.proveedoresManager.programarSiguienteVisita(proveedorId, nuevaFecha);
        this.cerrarModal('modalSiguienteVisita');
    }

    mostrarModalEditarProveedor(id) {
        if (!this.usuariosManager.tienePermiso('proveedores_editar')) {
            this.uiManager.alerta('❌ No tienes permiso para editar proveedores');
            return;
        }
        const proveedor = this.proveedoresManager.obtenerPorId(id);
        if (!proveedor) { this.uiManager.alerta('Error: Proveedor no encontrado'); return; }

        document.getElementById('editProveedorId').value          = proveedor.id;
        document.getElementById('editTipoRepartoProveedor').value = proveedor.tipoReparto;
        document.getElementById('editNombreProveedor').value      = proveedor.nombre;
        document.getElementById('editTelefonoProveedor').value    = proveedor.telefono || '';
        document.getElementById('editEmailProveedor').value       = proveedor.email    || '';

        if (proveedor.tipoReparto === 'constante') {
            document.getElementById('editGrupoFechaManual').classList.add('hidden');
            document.getElementById('editGrupoDiasConstantes').classList.remove('hidden');
            document.querySelectorAll('input[name="editDiasReparto"]').forEach(cb => {
                cb.checked = proveedor.diasReparto?.includes(parseInt(cb.value)) || false;
            });
            document.getElementById('editFrecuenciaReparto').value = proveedor.frecuenciaReparto || 1;
        } else {
            document.getElementById('editGrupoFechaManual').classList.remove('hidden');
            document.getElementById('editGrupoDiasConstantes').classList.add('hidden');
            document.getElementById('editFechaVisita').value = proveedor.fechaVisita || '';
        }
        this.abrirModal('modalEditarProveedor');
    }

    async guardarEdicionProveedor() {
        const proveedorId = document.getElementById('editProveedorId').value;
        const tipoReparto = document.getElementById('editTipoRepartoProveedor').value;
        const datos = {
            nombre:   document.getElementById('editNombreProveedor').value,
            telefono: document.getElementById('editTelefonoProveedor').value,
            email:    document.getElementById('editEmailProveedor').value,
            tipoReparto
        };
        if (tipoReparto === 'constante') {
            const checkboxes = document.querySelectorAll('input[name="editDiasReparto"]:checked');
            datos.diasReparto = Array.from(checkboxes).map(cb => parseInt(cb.value));
            if (datos.diasReparto.length === 0) { this.uiManager.alerta('Seleccione al menos un día de reparto'); return; }
            datos.frecuenciaReparto = parseInt(document.getElementById('editFrecuenciaReparto').value) || 1;
        } else {
            datos.fechaVisita = document.getElementById('editFechaVisita').value;
        }
        const resultado = await this.proveedoresManager.actualizar(proveedorId, datos);
        if (resultado.success) {
            this.cerrarModal('modalEditarProveedor');
            this.uiManager.alerta('Proveedor actualizado exitosamente');
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    async eliminarProveedor(id) {
        if (!this.usuariosManager.tienePermiso('proveedores_eliminar')) {
            this.uiManager.alerta('❌ No tienes permiso para eliminar proveedores');
            return;
        }
        if (this.uiManager.confirmar('¿Eliminar este proveedor?')) {
            await this.proveedoresManager.eliminar(id);
        }
    }

    actualizarVistaProveedores() {
        const busqueda  = document.getElementById('buscarProveedor').value;
        let proveedores = busqueda ? this.proveedoresManager.buscar(busqueda) : this.proveedoresManager.obtenerTodos();
        const tbody     = document.querySelector('#tablaProveedores tbody');
        this.uiManager.renderizarTablaProveedores(proveedores, tbody, this.proveedoresManager);
    }

    // ============================================================
    // REPORTES
    // ============================================================
    inicializarReportes() {
        document.getElementById('tipoReporte').addEventListener('change', () => this.mostrarOpcionesReporte());
        document.getElementById('btnGenerarReporte').addEventListener('click', () => this.generarReporte());
    }

    mostrarOpcionesReporte() {
        const tipo          = document.getElementById('tipoReporte').value;
        const opcionesFecha = document.getElementById('opcionesFecha');
        ['opcionFechaEspecifica','opcionRangoFechas','opcionMesEspecifico','opcionAñoEspecifico']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));

        const mapeo = {
            'fecha':          'opcionFechaEspecifica',
            'rango':          'opcionRangoFechas',
            'mes-especifico': 'opcionMesEspecifico',
            'año-especifico': 'opcionAñoEspecifico'
        };
        if (mapeo[tipo]) {
            opcionesFecha.classList.remove('hidden');
            document.getElementById(mapeo[tipo])?.classList.remove('hidden');
        } else {
            opcionesFecha.classList.add('hidden');
            this.generarReporte();
        }
    }

    generarReporte() {
        if (!this.usuariosManager.tienePermiso('reportes_generar') &&
            !this.usuariosManager.tienePermiso('reportes_ventas')) {
            this.uiManager.alerta('❌ No tienes permisos para ver reportes');
            return;
        }

        const tipo       = document.getElementById('tipoReporte').value;
        const parametros = {};

        if (tipo === 'fecha') {
            parametros.fecha = document.getElementById('fechaEspecifica').value;
            if (!parametros.fecha) { this.uiManager.alerta('Seleccione una fecha'); return; }
        } else if (tipo === 'rango') {
            parametros.fechaInicio = document.getElementById('fechaInicio').value;
            parametros.fechaFin    = document.getElementById('fechaFin').value;
            if (!parametros.fechaInicio || !parametros.fechaFin) { this.uiManager.alerta('Seleccione ambas fechas'); return; }
        } else if (tipo === 'mes-especifico') {
            parametros.mes = document.getElementById('mesEspecifico').value;
            parametros.año = document.getElementById('añoMesEspecifico').value;
        } else if (tipo === 'año-especifico') {
            parametros.año = document.getElementById('añoEspecifico').value;
        }

        const reporte = this.reportesManager.generarReporte(tipo, parametros);
        if (reporte) {
            const contenedor  = document.getElementById('contenidoReporte');
            const todasVentas = this.ventasManager.obtenerTodas();
            this.uiManager.renderizarReporte(reporte, contenedor, todasVentas, this.reportesManager);
            this.inicializarEventListenersReporte(reporte, todasVentas);
        }
    }

    inicializarEventListenersReporte(reporte, todasVentas) {
        const contenedor = document.getElementById('contenidoReporte');
        contenedor.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            if (btn.dataset.accion === 'descargar-ticket') {
                const index = parseInt(btn.dataset.index);
                const venta = todasVentas[index];
                this.ventasManager.descargarTicket(venta, index + 1);
            }
        });

        const btnBarras = document.getElementById('btnGraficoBarras');
        const btnPastel = document.getElementById('btnGraficoPastel');
        if (btnBarras) {
            btnBarras.addEventListener('click', () => {
                this.uiManager.dibujarGraficoComparativo(reporte, 'barras');
                btnBarras.style.background = '#667eea';
                if (btnPastel) btnPastel.style.background = '#718096';
            });
        }
        if (btnPastel) {
            btnPastel.addEventListener('click', () => {
                this.uiManager.dibujarGraficoComparativo(reporte, 'pastel');
                btnPastel.style.background = '#667eea';
                if (btnBarras) btnBarras.style.background = '#718096';
            });
        }

        const btnMostrarRanking = document.getElementById('btnMostrarRankingProductos');
        if (btnMostrarRanking) {
            btnMostrarRanking.addEventListener('click', () => {
                const seccionRanking = document.getElementById('seccionRankingProductos');
                const seccionTickets = document.getElementById('seccionTickets');
                if (seccionRanking.classList.contains('hidden')) {
                    this.mostrarRankingProductos(reporte);
                    seccionRanking.classList.remove('hidden');
                    seccionTickets.classList.add('hidden');
                    btnMostrarRanking.textContent = '🎫 Ver Tickets';
                    btnMostrarRanking.classList.replace('btn-primary','btn-secondary');
                } else {
                    seccionRanking.classList.add('hidden');
                    seccionTickets.classList.remove('hidden');
                    btnMostrarRanking.textContent = '📋 Ver Ranking de Productos';
                    btnMostrarRanking.classList.replace('btn-secondary','btn-primary');
                }
            });
        }

        const statTotalVentas = document.getElementById('statTotalVentas');
        if (statTotalVentas) {
            statTotalVentas.addEventListener('click', () => {
                document.getElementById('seccionRankingProductos')?.classList.add('hidden');
                document.getElementById('seccionTickets')?.classList.remove('hidden');
                const btnRanking = document.getElementById('btnMostrarRankingProductos');
                if (btnRanking) {
                    btnRanking.textContent = '📋 Ver Ranking de Productos';
                    btnRanking.classList.replace('btn-secondary','btn-primary');
                }
            });
        }

        const ordenRanking = document.getElementById('ordenRankingProductos');
        if (ordenRanking) {
            ordenRanking.addEventListener('change', () => this.mostrarRankingProductos(reporte));
        }
    }

    mostrarRankingProductos(reporte) {
        const orden      = document.getElementById('ordenRankingProductos')?.value || 'mayor';
        const productos  = this.reportesManager.ordenarProductosPorVentas(reporte.ventas, orden);
        const contenedor = document.getElementById('tablaRankingProductos');
        this.uiManager.renderizarRankingProductos(productos, contenedor);
    }

    actualizarDashboard() {
        const contenedor = document.getElementById('statsGrid');
        this.dashboardManager.renderizar(contenedor);
    }

    // ============================================================
    // TERMINALES MERCADO PAGO — GESTIÓN (con Terminal ID de la API de MP)
    // ============================================================
    inicializarTerminales() {
        // El form se bindea en actualizarInfoUsuarioEnConfiguracion()
    }

    /**
     * Renderiza la sección de terminales en Configuración.
     * Ahora el campo es "Terminal ID" (obtenido desde la app MP o el panel de desarrolladores).
     */
    _actualizarVistaTerminales() {
        const contenedor = document.getElementById('seccionTerminalesContenido');
        if (!contenedor) return;

        if (!this.usuariosManager.esAdministrador()) {
            contenedor.innerHTML = '<p style="color:#718096;font-size:14px;">Solo el administrador puede gestionar las terminales.</p>';
            return;
        }

        const terminales = this.terminalesManager.obtenerTodas();

        contenedor.innerHTML = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
                <button id="btnAgregarTerminal" class="btn-mp-add">
                    ➕ Agregar Terminal
                </button>
                <button id="btnVerTerminalesMP" class="btn-mp-sync">
                    🔄 Ver terminales en mi cuenta MP
                </button>
            </div>

            <!-- Lista de terminales de MP (se carga al pulsar el botón) -->
            <div id="mpApiTerminalsList" class="hidden"></div>

            <!-- Terminales registradas en el sistema -->
            ${terminales.length === 0 ? `
                <div style="text-align:center;padding:30px;color:#718096;background:#f7fafc;border-radius:10px;border:2px dashed #bee3f8;">
                    <p style="font-size:32px;">🖥️</p>
                    <p style="margin-top:8px;font-weight:600;">No hay terminales registradas.</p>
                    <p style="font-size:13px;margin-top:5px;max-width:400px;margin-left:auto;margin-right:auto;">
                        Registra el <strong>Terminal ID</strong> de tu dispositivo Mercado Pago Point
                        (lo encuentras en la app MP → Cobrar con Point → tu dispositivo → Ajustes).
                    </p>
                </div>
            ` : terminales.map(t => `
                <div style="
                    background:white;border:2px solid ${t.activa ? '#e2e8f0' : '#fed7d7'};
                    border-radius:12px;padding:18px 20px;margin-bottom:12px;
                    display:flex;align-items:center;justify-content:space-between;
                    flex-wrap:wrap;gap:12px;transition:border-color .2s;">
                    <div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <span style="font-size:24px;">🖥️</span>
                            <div>
                                <strong style="font-size:16px;color:#2d3748;">${t.nombre}</strong>
                                <span style="
                                    display:inline-block;margin-left:8px;padding:2px 8px;
                                    border-radius:10px;font-size:11px;font-weight:700;
                                    background:${t.activa ? '#edf7ed' : '#fee2e2'};
                                    color:${t.activa ? '#276749' : '#c53030'};">
                                    ${t.activa ? '● Activa' : '● Inactiva'}
                                </span>
                            </div>
                        </div>
                        <p style="font-size:12px;color:#718096;margin-top:6px;font-family:monospace;word-break:break-all;">
                            Terminal ID: ${t.terminalId}
                        </p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-primary btn-sm"   data-accion="editar-terminal"   data-id="${t.id}">✏️ Editar</button>
                        <button class="btn btn-secondary btn-sm" data-accion="toggle-terminal"   data-id="${t.id}">
                            ${t.activa ? '⏸ Desactivar' : '▶ Activar'}
                        </button>
                        <button class="btn btn-danger btn-sm"    data-accion="eliminar-terminal" data-id="${t.id}">🗑️ Eliminar</button>
                    </div>
                </div>
            `).join('')}
        `;

        document.getElementById('btnAgregarTerminal')?.addEventListener('click', () => this.abrirModalTerminal());
        document.getElementById('btnVerTerminalesMP')?.addEventListener('click', () => this._cargarTerminalesDeMP());

        contenedor.querySelectorAll('button[data-accion]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const { accion, id } = btn.dataset;
                if (accion === 'editar-terminal')   this.abrirModalTerminal(id);
                if (accion === 'toggle-terminal')   await this._toggleTerminal(id);
                if (accion === 'eliminar-terminal') await this._eliminarTerminal(id);
            });
        });
    }

    /**
     * Carga la lista de terminales desde la API de Mercado Pago y la muestra.
     */
    async _cargarTerminalesDeMP() {
        const btn = document.getElementById('btnVerTerminalesMP');
        if (btn) { btn.disabled = true; btn.textContent = '🔄 Cargando...'; }

        const listDiv = document.getElementById('mpApiTerminalsList');

        try {
            const terminalesMP = await this.terminalesManager.obtenerTerminalesDeMP(this.mercadoPagoManager);

            if (!listDiv) return;

            if (terminalesMP.length === 0) {
                listDiv.innerHTML = `
                    <div style="background:#fffbeb;border:1px solid #f6ad55;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <p style="color:#92400e;font-size:14px;margin:0;">
                            ⚠️ No se encontraron terminales en tu cuenta de Mercado Pago, o el Access Token
                            no tiene los permisos necesarios (<em>point:read</em>).
                        </p>
                    </div>`;
            } else {
                listDiv.innerHTML = `
                    <div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <p style="font-weight:700;color:#276749;margin-bottom:12px;">
                            ✅ Terminales encontradas en tu cuenta MP (${terminalesMP.length}):
                        </p>
                        <div class="mp-api-terminals-list">
                            ${terminalesMP.map(t => `
                                <div class="mp-api-terminal-item">
                                    <div>
                                        <div class="mp-api-terminal-id">${t.id}</div>
                                        <div style="font-size:11px;color:#718096;margin-top:2px;">
                                            Modo: <span class="mp-api-terminal-mode ${t.operating_mode === 'PDV' ? 'pdv' : 'standalone'}">
                                                ${t.operating_mode || 'STANDALONE'}
                                            </span>
                                            ${t.store_id ? ` | Tienda: ${t.store_id}` : ''}
                                        </div>
                                    </div>
                                    <button class="btn-mp-add" style="padding:7px 14px;font-size:12px;"
                                        data-accion="usar-terminal-id" data-terminal-id="${t.id}">
                                        ➕ Usar este ID
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <p style="font-size:12px;color:#718096;margin-top:10px;">
                            Haz clic en "Usar este ID" para pre-rellenar el formulario de registro.
                        </p>
                    </div>`;

                // Botones para usar el ID directamente
                listDiv.querySelectorAll('button[data-accion="usar-terminal-id"]').forEach(btn2 => {
                    btn2.addEventListener('click', () => {
                        const tid = btn2.dataset.terminalId;
                        this.abrirModalTerminal(null, tid);
                    });
                });
            }

            listDiv.classList.remove('hidden');
        } catch (err) {
            console.error('[TerminalesMP]', err);
            if (listDiv) {
                listDiv.innerHTML = `
                    <div style="background:#fff5f5;border:1px solid #fed7d7;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <p style="color:#c53030;font-size:14px;margin:0;">❌ Error al consultar la API de MP: ${err.message}</p>
                    </div>`;
                listDiv.classList.remove('hidden');
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Ver terminales en mi cuenta MP'; }
        }
    }

    /**
     * Abre el modal para agregar/editar una terminal.
     * @param {string|null} id          - ID Firestore de la terminal (null = nueva)
     * @param {string|null} terminalId  - Terminal ID de MP a pre-rellenar (opcional)
     */
    abrirModalTerminal(id = null, terminalId = null) {
        const terminal = id ? this.terminalesManager.obtenerPorId(id) : null;
        const titulo   = document.getElementById('tituloModalTerminal');
        const form     = document.getElementById('formTerminal');

        if (!form) return;
        form.reset();
        document.getElementById('terminalId').value = id || '';

        if (titulo) titulo.textContent = terminal ? 'Editar Terminal' : 'Registrar Terminal';

        if (terminal) {
            document.getElementById('terminalNombre').value   = terminal.nombre;
            document.getElementById('terminalDeviceId').value = terminal.terminalId;
        } else if (terminalId) {
            // Pre-rellenar desde la lista de MP
            document.getElementById('terminalDeviceId').value = terminalId;
            setTimeout(() => document.getElementById('terminalNombre')?.focus(), 100);
        }

        this.abrirModal('modalTerminal');
    }

    async _guardarTerminal() {
        const id         = document.getElementById('terminalId').value;
        const nombre     = document.getElementById('terminalNombre').value;
        const terminalId = document.getElementById('terminalDeviceId').value;

        const datos     = { nombre, terminalId };
        const resultado = id
            ? await this.terminalesManager.actualizar(id, datos)
            : await this.terminalesManager.agregar(datos);

        if (resultado.success) {
            this.cerrarModal('modalTerminal');
            this._actualizarVistaTerminales();
            this.uiManager.alerta(resultado.message);
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    async _toggleTerminal(id) {
        const resultado = await this.terminalesManager.toggleActiva(id);
        if (resultado.success) {
            this._actualizarVistaTerminales();
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    async _eliminarTerminal(id) {
        if (!this.uiManager.confirmar('¿Eliminar esta terminal? Esta acción no se puede deshacer.')) return;
        const resultado = await this.terminalesManager.eliminar(id);
        if (resultado.success) {
            this._actualizarVistaTerminales();
            this.uiManager.alerta('Terminal eliminada');
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    // ============================================================
    // CONFIGURACIÓN — INFO DE USUARIO Y PLAN
    // ============================================================
    actualizarInfoUsuarioEnConfiguracion() {
        const usuario = this.usuariosManager.obtenerUsuarioActual();
        if (!usuario) return;

        const configEmail       = document.getElementById('configUserEmail');
        const configProfileName = document.getElementById('configProfileName');
        const configProfileRole = document.getElementById('configProfileRole');
        const configPlanBadge   = document.getElementById('configPlanBadge');

        if (configEmail && window.currentUser) configEmail.textContent = window.currentUser.email;
        if (configProfileName) configProfileName.textContent = usuario.nombre;
        if (configProfileRole) configProfileRole.textContent =
            usuario.rol === 'administrador' ? '👑 Administrador' : '👤 Empleado';

        if (configPlanBadge) {
            const esPlanTotal = this.usuariosManager.cuentaTieneAccesoTotal();
            const limite      = this.usuariosManager.obtenerLimiteUsuarios();
            if (esPlanTotal) {
                configPlanBadge.innerHTML = `
                    <span class="acceso-badge total">🟢 Plan Pro — Acceso Total</span>
                    <p style="font-size:12px;color:#718096;margin-top:6px;">
                        Máximo de usuarios secundarios: <strong>${limite}</strong>
                    </p>`;
            } else {
                configPlanBadge.innerHTML = `
                    <span class="acceso-badge basico">🔵 Plan Basic — Inventario, Ventas y Configuración</span>
                    <p style="font-size:12px;color:#718096;margin-top:6px;">
                        Máximo de usuarios secundarios: <strong>${limite}</strong>
                    </p>
                    <a href="https://elaba987.github.io/pagina_inventario/" target="_blank"
                       style="display:inline-block;margin-top:10px;padding:8px 18px;
                              background:linear-gradient(135deg,#667eea,#764ba2);
                              color:white;border-radius:8px;font-weight:700;font-size:13px;
                              text-decoration:none;box-shadow:0 2px 8px rgba(102,126,234,0.4);">
                        ⚡ Actualizar a Pro
                    </a>`;
            }
        }

        this.configuracionManager.actualizarInputMeta();

        const seccionGestion = document.getElementById('seccionGestionUsuarios');
        if (seccionGestion) {
            if (this.usuariosManager.esAdministrador()) {
                const limite   = this.usuariosManager.obtenerLimiteUsuarios();
                const actuales = this.usuariosManager.contarUsuariosSecundarios();
                const descEl   = seccionGestion.querySelector('.desc-limite-usuarios');
                if (descEl) descEl.textContent = `Puedes crear hasta ${limite} usuarios (${actuales}/${limite} usados).`;
                seccionGestion.classList.remove('hidden');
                this.cargarListaUsuarios();
            } else {
                seccionGestion.classList.add('hidden');
            }
        }

        // Renderizar sección de terminales
        this._actualizarVistaTerminales();

        // Bindear el form de terminal (solo una vez)
        const formTerminal = document.getElementById('formTerminal');
        if (formTerminal && !formTerminal.dataset.bound) {
            formTerminal.dataset.bound = 'true';
            formTerminal.addEventListener('submit', (e) => {
                e.preventDefault();
                this._guardarTerminal();
            });
        }
    }

    // ============================================================
    // GESTIÓN DE USUARIOS
    // ============================================================
    inicializarGestionUsuarios() {
        const btnChangeProfile = document.getElementById('btnChangeProfile');
        if (btnChangeProfile) {
            btnChangeProfile.addEventListener('click', async () => {
                if (this.uiManager.confirmar('¿Cambiar de perfil? Los datos no guardados se perderán.')) {
                    await this.cambiarPerfil();
                }
            });
        }

        const btnCrearUsuario = document.getElementById('btnCrearUsuario');
        if (btnCrearUsuario) {
            btnCrearUsuario.addEventListener('click', () => this.mostrarModalUsuario());
        }

        const btnCerrar   = document.getElementById('cerrarModalUsuario');
        const btnCancelar = document.getElementById('btnCancelarUsuario');
        if (btnCerrar)   btnCerrar.addEventListener('click',   () => this.cerrarModalUsuario());
        if (btnCancelar) btnCancelar.addEventListener('click', () => this.cerrarModalUsuario());

        const formUsuario = document.getElementById('formUsuario');
        if (formUsuario) {
            formUsuario.addEventListener('submit', (e) => { e.preventDefault(); this.guardarUsuario(); });
        }

        const rolUsuario = document.getElementById('rolUsuario');
        if (rolUsuario) {
            rolUsuario.addEventListener('change', () => this.toggleSeccionPermisos());
        }
    }

    async cambiarPerfil() {
        const usuarioSaliente = this.usuariosManager.obtenerUsuarioActual();
        if (usuarioSaliente) {
            await this.auditoriaManager.registrar('SESION_CIERRE', {
                perfil: usuarioSaliente.nombre,
                rol:    usuarioSaliente.rol
            }, usuarioSaliente);
        }
        this.ventasManager.ventaActual = [];
        this.actualizarVistaVentaActual();
        this.usuariosManager.cerrarSesionPerfil();
        this.datosInicializados = false;
        window.mostrarSeleccionPerfil();
    }

    cerrarModalUsuario()  { this.cerrarModal('modalUsuario'); }

    mostrarModalUsuario(usuarioId = null) {
        const modal  = document.getElementById('modalUsuario');
        const titulo = document.getElementById('tituloModalUsuario');
        const form   = document.getElementById('formUsuario');

        form.reset();
        document.getElementById('usuarioId').value = '';

        const displayNIP = document.getElementById('displayNIP');
        let inputNIP     = document.getElementById('inputNIP');
        let nipVisible   = false;

        const toggleNIP     = document.getElementById('toggleNIP');
        const btnGenerarNIP = document.getElementById('btnGenerarNIP');

        const newToggle  = toggleNIP.cloneNode(true);
        toggleNIP.parentNode.replaceChild(newToggle, toggleNIP);
        const newGenerar = btnGenerarNIP.cloneNode(true);
        btnGenerarNIP.parentNode.replaceChild(newGenerar, btnGenerarNIP);
        const newInputNIP = inputNIP.cloneNode(true);
        inputNIP.parentNode.replaceChild(newInputNIP, inputNIP);
        inputNIP = newInputNIP;

        this.cargarPermisosEnModal();

        if (usuarioId) {
            const usuario = this.usuariosManager.obtenerPorId(usuarioId);
            if (!usuario) return;
            titulo.textContent = 'Editar Usuario';
            document.getElementById('usuarioId').value     = usuario.id;
            document.getElementById('nombreUsuario').value = usuario.nombre;
            document.getElementById('rolUsuario').value    = usuario.rol;
            inputNIP.value = usuario.nip || '0000';
            displayNIP.textContent = '••••';
            displayNIP.classList.add('hidden-nip');
            if (usuario.rol === 'empleado' && usuario.permisos) {
                usuario.permisos.forEach(permiso => {
                    const cb = document.querySelector(`input[name="permisos"][value="${permiso}"]`);
                    if (cb && !cb.disabled) cb.checked = true;
                });
            }
        } else {
            titulo.textContent = 'Crear Usuario';
            const nipGenerado = this.usuariosManager.generarNIPAleatorio();
            inputNIP.value = nipGenerado;
            displayNIP.textContent = nipGenerado;
            displayNIP.classList.remove('hidden-nip');
            nipVisible = true;
        }

        document.getElementById('toggleNIP').addEventListener('click', () => {
            nipVisible = !nipVisible;
            const btn = document.getElementById('toggleNIP');
            if (nipVisible) {
                displayNIP.classList.remove('hidden-nip');
                displayNIP.textContent = document.getElementById('inputNIP').value || '0000';
                if (btn) btn.textContent = '🙈';
            } else {
                displayNIP.classList.add('hidden-nip');
                displayNIP.textContent = '••••';
                if (btn) btn.textContent = '👁';
            }
        });

        document.getElementById('btnGenerarNIP').addEventListener('click', () => {
            const nuevoNIP = this.usuariosManager.generarNIPAleatorio();
            document.getElementById('inputNIP').value = nuevoNIP;
            if (nipVisible) displayNIP.textContent = nuevoNIP;
        });

        document.getElementById('inputNIP').addEventListener('input', (e) => {
            if (nipVisible) displayNIP.textContent = e.target.value || '0000';
        });

        this.toggleSeccionPermisos();
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }

    cargarPermisosEnModal() {
        const contenedor        = document.getElementById('listadoPermisos');
        if (!contenedor) return;
        const permisosAgrupados = this.usuariosManager.obtenerPermisosAgrupados();
        const cuentaEsTotal     = this.usuariosManager.cuentaTieneAccesoTotal();
        const gruposBloqueados  = cuentaEsTotal ? [] : ['Proveedores', 'Reportes'];

        let html = '';
        for (const [grupo, permisos] of Object.entries(permisosAgrupados)) {
            const bloqueado = gruposBloqueados.includes(grupo);
            html += `
                <div class="permission-group">
                    <div class="permission-group-title">
                        ${grupo}
                        ${bloqueado ? '<span style="font-size:11px;color:#c05621;font-weight:400;margin-left:6px;">(requiere Plan Pro)</span>' : ''}
                    </div>`;
            for (const [key, descripcion] of Object.entries(permisos)) {
                html += `
                    <div class="permission-checkbox" ${bloqueado ? 'style="opacity:0.45;"' : ''}>
                        <input type="checkbox" name="permisos" value="${key}" id="perm_${key}"
                            ${bloqueado ? 'disabled title="No disponible en tu plan actual"' : ''}>
                        <label for="perm_${key}">${descripcion}</label>
                    </div>`;
            }
            html += '</div>';
        }
        contenedor.innerHTML = html;
    }

    toggleSeccionPermisos() {
        const rol             = document.getElementById('rolUsuario').value;
        const seccionPermisos = document.getElementById('seccionPermisos');
        if (seccionPermisos) seccionPermisos.style.display = rol === 'empleado' ? 'block' : 'none';
    }

    async guardarUsuario() {
        const usuarioId = document.getElementById('usuarioId').value;
        const nombre    = document.getElementById('nombreUsuario').value.trim();
        const rol       = document.getElementById('rolUsuario').value;
        const nip       = document.getElementById('inputNIP').value;

        if (!nombre)               { this.uiManager.alerta('Ingrese un nombre para el usuario'); return; }
        if (!/^\d{4}$/.test(nip)) { this.uiManager.alerta('El NIP debe tener exactamente 4 dígitos'); return; }

        let permisos = [];
        if (rol === 'empleado') {
            const checkboxes = document.querySelectorAll('input[name="permisos"]:checked');
            permisos = Array.from(checkboxes).map(cb => cb.value);
            if (permisos.length === 0) {
                this.uiManager.alerta('Debe seleccionar al menos un permiso para el empleado');
                return;
            }
        }

        const datos     = { nombre, rol, permisos, nip };
        const resultado = usuarioId
            ? await this.usuariosManager.actualizarUsuario(usuarioId, datos)
            : await this.usuariosManager.crearUsuario(datos);

        if (resultado.success) {
            if (usuarioId) {
                this.auditoriaManager.registrar('USUARIO_EDITAR', { nombre, rol, permisos: permisos.length > 0 ? `${permisos.length} permiso(s)` : 'Acceso total' });
            } else {
                this.auditoriaManager.registrar('USUARIO_CREAR', { nombre, rol, permisos: permisos.length > 0 ? `${permisos.length} permiso(s)` : 'Acceso total' });
            }
            this.cerrarModalUsuario();
            this.cargarListaUsuarios();
            this.uiManager.alerta(usuarioId ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente');
        } else {
            this.uiManager.alerta(resultado.message);
        }
    }

    cargarListaUsuarios() {
        const contenedor = document.getElementById('listaUsuarios');
        if (!contenedor) return;

        const usuarios            = this.usuariosManager.obtenerTodos();
        const usuariosSecundarios = usuarios.filter(u => !u.esPrincipal);

        if (usuariosSecundarios.length === 0) {
            contenedor.innerHTML = `
                <div style="text-align:center;padding:40px;color:#718096;">
                    <p>No hay usuarios secundarios creados</p>
                    <p style="font-size:14px;margin-top:10px;">Puedes crear hasta 5 usuarios con diferentes permisos</p>
                </div>`;
            return;
        }

        const permisosMap   = this.usuariosManager.obtenerPermisos();
        const cuentaEsTotal = this.usuariosManager.cuentaTieneAccesoTotal();

        contenedor.innerHTML = usuariosSecundarios.map(usuario => {
            const esAdmin   = usuario.rol === 'administrador';
            const rolTexto  = esAdmin ? '👑 Administrador' : '👤 Empleado';
            const rolClase  = esAdmin ? 'administrador' : 'empleado';
            const efectivos = this.usuariosManager._resolverPermisosEfectivos(usuario);

            let permisosHtml = '';
            if (esAdmin) {
                permisosHtml = `<span style="color:#48bb78;font-size:13px;">✅ Acceso completo al plan ${cuentaEsTotal ? 'Pro' : 'Basic'}</span>`;
            } else if (efectivos.length === 0) {
                permisosHtml = '<span style="color:#f56565;font-size:13px;">Sin permisos asignados</span>';
            } else {
                permisosHtml = efectivos
                    .map(p => `<span style="background:#eef0ff;color:#4a5568;font-size:11px;padding:2px 8px;border-radius:10px;margin:2px;display:inline-block;">${permisosMap[p] || p}</span>`)
                    .join('');
            }

            return `
                <div class="user-card">
                    <div class="user-card-header">
                        <div class="user-card-info">
                            <h4>${usuario.nombre}</h4>
                            <span class="user-card-role ${rolClase}">${rolTexto}</span>
                        </div>
                        <div class="user-card-actions">
                            <button class="btn btn-primary btn-sm" data-accion="editar-usuario"   data-id="${usuario.id}">✏️ Editar</button>
                            <button class="btn btn-danger  btn-sm" data-accion="eliminar-usuario" data-id="${usuario.id}">🗑️ Eliminar</button>
                        </div>
                    </div>
                    <div style="margin-top:10px;flex-wrap:wrap;gap:4px;">${permisosHtml}</div>
                    <div style="margin-top:8px;padding:8px 10px;background:#f7fafc;border-radius:6px;font-size:13px;color:#718096;">
                        🔒 NIP: ${usuario.nip || '????'}
                    </div>
                </div>
            `;
        }).join('');

        contenedor.querySelectorAll('button[data-accion]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const { accion, id } = btn.dataset;
                if (accion === 'editar-usuario') {
                    this.mostrarModalUsuario(id);
                } else if (accion === 'eliminar-usuario') {
                    if (this.uiManager.confirmar('¿Eliminar este usuario? Esta acción no se puede deshacer.')) {
                        const usuario   = this.usuariosManager.obtenerPorId(id);
                        const resultado = await this.usuariosManager.eliminarUsuario(id);
                        if (resultado.success) {
                            if (usuario) {
                                this.auditoriaManager.registrar('USUARIO_ELIMINAR', { nombre: usuario.nombre, rol: usuario.rol });
                            }
                            this.cargarListaUsuarios();
                            this.uiManager.alerta('Usuario eliminado correctamente');
                        } else {
                            this.uiManager.alerta(resultado.message);
                        }
                    }
                }
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TiendaApp();
});