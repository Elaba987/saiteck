// usuarios.js - Módulo para gestión de usuarios y perfiles

// ─────────────────────────────────────────────────────────────
// CONJUNTOS DE PERMISOS POR NIVEL
//
// BASICOS  → lo que puede hacer cualquier cuenta (suscripción Basic)
//            Inventario (productos), Ventas, Dashboard, Configuración
//
// TOTALES  → lo que puede hacer una cuenta con suscripción Pro
//            Todo lo anterior + Proveedores + Pedidos + Reportes
// ─────────────────────────────────────────────────────────────
const PERMISOS_BASICOS = [
    'dashboard',
    'productos',
    'productos_crear',
    'productos_editar',
    'productos_eliminar',
    'ventas',
    'configuracion',
    'configuracion_colores'
];

const PERMISOS_TOTALES = [
    'dashboard',
    'productos',
    'productos_crear',
    'productos_editar',
    'productos_eliminar',
    'ventas',
    'proveedores',
    'proveedores_crear',
    'proveedores_editar',
    'proveedores_eliminar',
    'reportes',
    'reportes_ventas',
    'reportes_generar',
    'pedidos',
    'pedidos_gestionar',
    'pedidos_reportes',
    'configuracion',
    'configuracion_colores'
];

export class UsuariosManager {
    constructor() {
        this.usuarios      = [];
        this.usuarioActual = null;

        // Mapa descriptivo de permisos (para UI)
        this.permisos = {
            'dashboard':              'Ver Panel de Control',
            'productos':              'Acceder a Productos',
            'productos_crear':        'Crear Productos',
            'productos_editar':       'Editar Productos',
            'productos_eliminar':     'Eliminar Productos',
            'ventas':                 'Realizar Ventas',
            'proveedores':            'Acceder a Proveedores',
            'proveedores_crear':      'Crear Proveedores',
            'proveedores_editar':     'Editar Proveedores',
            'proveedores_eliminar':   'Eliminar Proveedores',
            'reportes':               'Acceder a Reportes',
            'reportes_ventas':        'Ver Historial de Ventas y Tickets',
            'reportes_generar':       'Generar Reportes',
            'pedidos':                'Acceder a Pedidos a Proveedores',
            'pedidos_gestionar':      'Crear, Editar y Recibir Pedidos',
            'pedidos_reportes':       'Ver y Exportar Reportes de Compras',
            'configuracion':          'Acceder a Configuración',
            'configuracion_colores':  'Personalizar Colores'
        };

        // Mapa sección → sub-permisos que habilitan el acceso a esa sección
        this._seccionSubPermisos = {
            'dashboard':     ['dashboard'],
            'productos':     ['productos', 'productos_crear', 'productos_editar', 'productos_eliminar'],
            'ventas':        ['ventas'],
            'proveedores':   ['proveedores', 'proveedores_crear', 'proveedores_editar', 'proveedores_eliminar', 'pedidos', 'pedidos_gestionar', 'pedidos_reportes'],
            'reportes':      ['reportes', 'reportes_ventas', 'reportes_generar', 'pedidos_reportes'],
            'pedidos':       ['pedidos', 'pedidos_gestionar', 'pedidos_reportes'],
            'configuracion': ['configuracion', 'configuracion_colores']
        };
    }

    // ─────────────────────────────────────────────────────────
    // SUSCRIPCIÓN DE CUENTA
    // Devuelve los permisos máximos que permite el plan contratado.
    // window.cuentaAccesoTotal lo carga firebase-config.js al autenticar.
    // TÚ lo controlas en Firestore Console: users/{uid} → accesoTotal: true/false
    // ─────────────────────────────────────────────────────────
    _permisosMaximosCuenta() {
        return window.cuentaAccesoTotal === true ? PERMISOS_TOTALES : PERMISOS_BASICOS;
    }

    // ─────────────────────────────────────────────────────────
    // PERMISOS EFECTIVOS DE UN PERFIL
    // Intersecta lo que el perfil tiene asignado con el techo de la cuenta.
    // Incluso el Administrador queda limitado por la suscripción.
    // ─────────────────────────────────────────────────────────
    _resolverPermisosEfectivos(usuario) {
        const techo = this._permisosMaximosCuenta();

        // Administrador / esPrincipal → recibe el techo completo de la cuenta
        if (usuario.rol === 'administrador' || usuario.esPrincipal) {
            return techo;
        }

        // Empleado: usa el array de permisos asignados, acotado al techo
        let permisosEmpleado = [];

        if (Array.isArray(usuario.permisos) && usuario.permisos.length > 0) {
            // Sistema actual: array granular de permisos
            permisosEmpleado = usuario.permisos;
        } else if (typeof usuario.accesoTotal === 'boolean') {
            // Compatibilidad con campo booleano legacy
            permisosEmpleado = usuario.accesoTotal ? PERMISOS_TOTALES : PERMISOS_BASICOS;
        }

        // Intersección con el techo de la cuenta
        return permisosEmpleado.filter(p => techo.includes(p));
    }

    // ─────────────────────────────────────────────────────────
    // VERIFICAR PERMISO
    // Punto de entrada que usa toda la app para validar acceso.
    // ─────────────────────────────────────────────────────────
    tienePermiso(permiso) {
        if (!this.usuarioActual) return false;

        // Configuración siempre accesible (cambiar perfil / logout)
        if (permiso === 'configuracion') return true;

        const efectivos = this._resolverPermisosEfectivos(this.usuarioActual);

        // Permiso directo
        if (efectivos.includes(permiso)) return true;

        // Auto-acceso a sección si tiene algún sub-permiso de esa sección
        if (this._seccionSubPermisos[permiso]) {
            return this._seccionSubPermisos[permiso].some(p => efectivos.includes(p));
        }

        return false;
    }

    // ─────────────────────────────────────────────────────────
    // HELPERS PARA LA UI
    // ─────────────────────────────────────────────────────────

    esAdministrador() {
        return this.usuarioActual && (
            this.usuarioActual.rol === 'administrador' ||
            this.usuarioActual.esPrincipal
        );
    }

    /**
     * Indica si el plan de la cuenta incluye acceso total.
     * Usado en app.js para deshabilitar la opción "Acceso Total"
     * en el modal de usuarios cuando la cuenta es básica.
     */
    cuentaTieneAccesoTotal() {
        return window.cuentaAccesoTotal === true;
    }

    /** Límite de usuarios secundarios para esta cuenta (configurable en Firestore) */
    obtenerLimiteUsuarios() {
        return typeof window.cuentaMaxUsuarios === 'number' ? window.cuentaMaxUsuarios : 5;
    }

    /** Cuántos usuarios secundarios existen actualmente */
    contarUsuariosSecundarios() {
        return this.usuarios.filter(u => !u.esPrincipal).length;
    }

    /**
     * Indica si un perfil tiene acceso a módulos avanzados
     * (ya aplicando el techo de la cuenta).
     */
    perfilTieneAccesoTotal(usuario) {
        if (!usuario) return false;
        const efectivos = this._resolverPermisosEfectivos(usuario);
        return efectivos.some(p => ['proveedores', 'reportes', 'pedidos'].includes(p));
    }

    // ─────────────────────────────────────────────────────────
    // GESTIÓN DE NIP
    // ─────────────────────────────────────────────────────────
    generarNIPAleatorio() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    async verificarNIP(usuarioId, nip) {
        const usuario = this.obtenerPorId(usuarioId);
        if (!usuario) return false;
        return usuario.nip === nip.toString();
    }

    async actualizarNIP(usuarioId, nuevoNIP) {
        if (!window.currentUser) {
            return { success: false, message: 'No hay usuario autenticado' };
        }
        if (!/^\d{4}$/.test(nuevoNIP)) {
            return { success: false, message: 'El NIP debe tener exactamente 4 dígitos' };
        }

        try {
            await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('perfiles').doc(usuarioId)
                .update({
                    nip: nuevoNIP,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            const index = this.usuarios.findIndex(u => u.id === usuarioId);
            if (index !== -1) this.usuarios[index].nip = nuevoNIP;

            return { success: true };
        } catch (error) {
            console.error('Error al actualizar NIP:', error);
            return { success: false, message: 'Error al actualizar NIP' };
        }
    }

    // ─────────────────────────────────────────────────────────
    // INICIALIZACIÓN
    // ─────────────────────────────────────────────────────────
    async inicializar() {
        if (!window.currentUser) return;
        await this.cargarUsuarios();
        if (this.usuarios.length === 0) {
            await this.crearAdministradorPrincipal();
        }
        return true;
    }

    async cargarUsuarios() {
        if (!window.currentUser) return [];
        try {
            const snapshot = await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('perfiles').get();

            this.usuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return this.usuarios;
        } catch (error) {
            console.error('Error al cargar usuarios:', error);
            return [];
        }
    }

    async crearAdministradorPrincipal() {
        if (!window.currentUser) return;

        const adminPrincipal = {
            nombre:      'Administrador Principal',
            rol:         'administrador',
            email:       window.currentUser.email,
            accesoTotal: true,   // el admin del negocio ve todo lo que su plan permite
            esPrincipal: true,
            nip:         this.generarNIPAleatorio(),
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('perfiles').add(adminPrincipal);

            adminPrincipal.id = docRef.id;
            this.usuarios.push(adminPrincipal);
            return { success: true, usuario: adminPrincipal };
        } catch (error) {
            console.error('Error al crear administrador:', error);
            return { success: false, message: 'Error al crear administrador principal' };
        }
    }

    // ─────────────────────────────────────────────────────────
    // CRUD DE PERFILES
    // ─────────────────────────────────────────────────────────
    obtenerTodos()         { return this.usuarios; }
    obtenerPorId(id)       { return this.usuarios.find(u => u.id === id); }
    obtenerUsuarioActual() { return this.usuarioActual; }

    establecerUsuarioActual(usuario) {
        this.usuarioActual = usuario;
        sessionStorage.setItem('usuarioActual', JSON.stringify(usuario));
    }

    cargarUsuarioActualDeSession() {
        const guardado = sessionStorage.getItem('usuarioActual');
        if (guardado) this.usuarioActual = JSON.parse(guardado);
        return this.usuarioActual;
    }

    async crearUsuario(datos) {
        if (!window.currentUser) {
            return { success: false, message: 'No hay usuario autenticado' };
        }

        const secundarios = this.usuarios.filter(u => !u.esPrincipal);
        const limiteUsuarios = typeof window.cuentaMaxUsuarios === 'number' ? window.cuentaMaxUsuarios : 5;
        if (secundarios.length >= limiteUsuarios) {
            return { success: false, message: `Límite de ${limiteUsuarios} usuarios alcanzado para tu plan` };
        }

        if (this.usuarios.some(u => u.nombre.toLowerCase() === datos.nombre.toLowerCase())) {
            return { success: false, message: 'Ya existe un usuario con ese nombre' };
        }

        // Respetar techo de cuenta: filtrar permisos que no estén en el plan
        const techo    = this._permisosMaximosCuenta();
        const permisos = Array.isArray(datos.permisos)
            ? datos.permisos.filter(p => techo.includes(p))
            : [];

        const nuevoUsuario = {
            nombre:      datos.nombre,
            rol:         datos.rol || 'empleado',
            permisos:    permisos,
            esPrincipal: false,
            nip:         datos.nip || this.generarNIPAleatorio(),
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('perfiles').add(nuevoUsuario);

            nuevoUsuario.id = docRef.id;
            this.usuarios.push(nuevoUsuario);
            return { success: true, usuario: nuevoUsuario };
        } catch (error) {
            console.error('Error al crear usuario:', error);
            return { success: false, message: 'Error al crear usuario' };
        }
    }

    async actualizarUsuario(id, datos) {
        if (!window.currentUser) {
            return { success: false, message: 'No hay usuario autenticado' };
        }

        const usuario = this.obtenerPorId(id);
        if (!usuario)            return { success: false, message: 'Usuario no encontrado' };
        if (usuario.esPrincipal) return { success: false, message: 'No se puede modificar el administrador principal' };

        if (datos.nombre) {
            const duplicado = this.usuarios.some(u =>
                u.id !== id && u.nombre.toLowerCase() === datos.nombre.toLowerCase()
            );
            if (duplicado) return { success: false, message: 'Ya existe un usuario con ese nombre' };
        }

        if (datos.nip && !/^\d{4}$/.test(datos.nip)) {
            return { success: false, message: 'El NIP debe tener exactamente 4 dígitos' };
        }

        const datosActualizados = { ...datos };

        // Filtrar permisos por techo de cuenta antes de guardar
        if (Array.isArray(datosActualizados.permisos)) {
            const techo = this._permisosMaximosCuenta();
            datosActualizados.permisos = datosActualizados.permisos.filter(p => techo.includes(p));
        }

        // Limpiar campo booleano legacy si aún existe
        datosActualizados.accesoTotal = firebase.firestore.FieldValue.delete();
        datosActualizados.updatedAt   = firebase.firestore.FieldValue.serverTimestamp();

        try {
            await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('perfiles').doc(id)
                .update(datosActualizados);

            const index = this.usuarios.findIndex(u => u.id === id);
            if (index !== -1) {
                const { accesoTotal: _drop, ...resto } = datosActualizados;
                this.usuarios[index] = { ...this.usuarios[index], ...resto };
            }

            return { success: true };
        } catch (error) {
            console.error('Error al actualizar usuario:', error);
            return { success: false, message: 'Error al actualizar usuario' };
        }
    }

    async eliminarUsuario(id) {
        if (!window.currentUser) {
            return { success: false, message: 'No hay usuario autenticado' };
        }

        const usuario = this.obtenerPorId(id);
        if (!usuario)            return { success: false, message: 'Usuario no encontrado' };
        if (usuario.esPrincipal) return { success: false, message: 'No se puede eliminar el administrador principal' };

        try {
            await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('perfiles').doc(id)
                .delete();

            this.usuarios = this.usuarios.filter(u => u.id !== id);
            return { success: true };
        } catch (error) {
            console.error('Error al eliminar usuario:', error);
            return { success: false, message: 'Error al eliminar usuario' };
        }
    }

    // ─────────────────────────────────────────────────────────
    // HELPERS RETROCOMPATIBLES
    // ─────────────────────────────────────────────────────────
    obtenerPermisos() { return this.permisos; }

    obtenerPermisosAgrupados() {
        return {
            'General': {
                'dashboard': 'Ver Panel de Control'
            },
            'Productos / Inventario': {
                'productos':          'Acceder a Productos',
                'productos_crear':    'Crear Productos',
                'productos_editar':   'Editar Productos',
                'productos_eliminar': 'Eliminar Productos'
            },
            'Ventas': {
                'ventas': 'Realizar Ventas'
            },
            'Proveedores': {
                'proveedores':          'Acceder a Proveedores',
                'proveedores_crear':    'Crear Proveedores',
                'proveedores_editar':   'Editar Proveedores',
                'proveedores_eliminar': 'Eliminar Proveedores'
            },
            'Pedidos': {
                'pedidos':           'Acceder a Pedidos a Proveedores',
                'pedidos_gestionar': 'Crear, Editar y Recibir Pedidos',
                'pedidos_reportes':  'Ver y Exportar Reportes de Compras'
            },
            'Reportes': {
                'reportes':         'Acceder a Reportes',
                'reportes_ventas':  'Ver Historial de Ventas y Tickets',
                'reportes_generar': 'Generar Reportes'
            },
            'Configuración': {
                'configuracion':         'Acceder a Configuración',
                'configuracion_colores': 'Personalizar Colores'
            }
        };
    }

    // ─────────────────────────────────────────────────────────
    // CERRAR SESIÓN DE PERFIL (no cierra Firebase Auth)
    // ─────────────────────────────────────────────────────────
    cerrarSesionPerfil() {
        this.usuarioActual = null;
        sessionStorage.removeItem('usuarioActual');
    }
}