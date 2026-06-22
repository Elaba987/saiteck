// configuracion.js - Módulo para gestión de configuración y colores
// ACTUALIZADO: Soporta configuración por sucursal

export class ConfiguracionManager {
    constructor() {
        this.coloresDefault = {
            primario:    '#667eea',
            secundario:  '#764ba2',
            sidebar:     '#2d3748',
            exito:       '#48bb78',
            peligro:     '#f56565',
            advertencia: '#ed8936'
        };

        this.metaVentasDiaria = 0;
        this._auditoria       = null;
        window.configuracionManager = this;
    }

    // ─── RUTA DE CONFIGURACIÓN ───────────────────────────────────────────
    // Si hay sucursal activa → users/{uid}/sucursales/{sid}/configuracion/{doc}
    // Si no                  → users/{uid}/configuracion/{doc}

    _configRef(docName) {
        if (!window.currentUser) return null;
        const uid = window.currentUser.uid;
        const sid = window.sucursalActualId;

        if (sid) {
            return window.db
                .collection('users').doc(uid)
                .collection('sucursales').doc(sid)
                .collection('configuracion').doc(docName);
        }
        return window.db
            .collection('users').doc(uid)
            .collection('configuracion').doc(docName);
    }

    // ─── COLORES ─────────────────────────────────────────────────────────

    async cargarColoresDesdeFirestore() {
        if (!window.currentUser) { this.aplicarColores(this.coloresDefault); return; }

        try {
            const ref = this._configRef('colores');
            if (!ref) { this.aplicarColores(this.coloresDefault); return; }

            const doc = await ref.get();
            if (doc.exists) {
                const colores = doc.data();
                this.aplicarColores(colores);
                this.actualizarInputsColores(colores);
            } else {
                this.aplicarColores(this.coloresDefault);
                this.actualizarInputsColores(this.coloresDefault);
            }
        } catch (error) {
            console.error('Error al cargar colores:', error);
            this.aplicarColores(this.coloresDefault);
        }
    }

    aplicarColores(colores) {
        const root = document.documentElement;
        root.style.setProperty('--color-primario',    colores.primario);
        root.style.setProperty('--color-secundario',  colores.secundario);
        root.style.setProperty('--color-sidebar',     colores.sidebar);
        root.style.setProperty('--color-exito',       colores.exito);
        root.style.setProperty('--color-peligro',     colores.peligro);
        root.style.setProperty('--color-advertencia', colores.advertencia);
        document.body.style.background =
            `linear-gradient(135deg, ${colores.primario} 0%, ${colores.secundario} 100%)`;
    }

    actualizarInputsColores(colores) {
        setTimeout(() => {
            const inputs = {
                'colorPrimario':    colores.primario,
                'colorSecundario':  colores.secundario,
                'colorSidebar':     colores.sidebar,
                'colorExito':       colores.exito,
                'colorPeligro':     colores.peligro,
                'colorAdvertencia': colores.advertencia
            };
            for (const [id, valor] of Object.entries(inputs)) {
                const input = document.getElementById(id);
                if (input) input.value = valor;
            }
            this.actualizarTextosColores();
        }, 100);
    }

    async guardarColoresEnFirestore(colores) {
        if (!window.currentUser) { alert('No hay usuario autenticado'); return false; }

        try {
            const ref = this._configRef('colores');
            if (!ref) return false;

            await ref.set({
                ...colores,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.aplicarColores(colores);
            this._auditoria?.registrar('CONFIG_COLORES', {
                primario:   colores.primario,
                secundario: colores.secundario,
                sidebar:    colores.sidebar
            });
            return true;
        } catch (error) {
            console.error('Error al guardar colores:', error);
            alert('Error al guardar los colores');
            return false;
        }
    }

    async restablecerColores() {
        const success = await this.guardarColoresEnFirestore(this.coloresDefault);
        if (success) {
            this.actualizarInputsColores(this.coloresDefault);
            this._auditoria?.registrar('CONFIG_COLORES_RESET', {
                accion: 'Colores restablecidos a valores predeterminados'
            });
        }
        return success;
    }

    actualizarTextosColores() {
        const textos = {
            'colorPrimarioText':    'colorPrimario',
            'colorSecundarioText':  'colorSecundario',
            'colorSidebarText':     'colorSidebar',
            'colorExitoText':       'colorExito',
            'colorPeligroText':     'colorPeligro',
            'colorAdvertenciaText': 'colorAdvertencia'
        };
        for (const [textId, inputId] of Object.entries(textos)) {
            const te = document.getElementById(textId);
            const ie = document.getElementById(inputId);
            if (te && ie) te.textContent = ie.value;
        }
    }

    // ─── META DE VENTAS ───────────────────────────────────────────────────

    async cargarMetaVentasDiaria() {
        if (!window.currentUser) return 0;
        try {
            const ref = this._configRef('metas');
            if (!ref) return 0;
            const doc = await ref.get();
            this.metaVentasDiaria = doc.exists ? (doc.data().metaDiaria || 0) : 0;
        } catch (error) {
            console.error('Error al cargar meta de ventas:', error);
            this.metaVentasDiaria = 0;
        }
        return this.metaVentasDiaria;
    }

    async guardarMetaVentasDiaria(meta) {
        if (!window.currentUser) return false;
        const valor = parseFloat(meta) || 0;
        if (valor < 0) return false;

        try {
            const ref = this._configRef('metas');
            if (!ref) return false;
            await ref.set({
                metaDiaria: valor,
                updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            this.metaVentasDiaria = valor;
            this._auditoria?.registrar('CONFIG_META_VENTAS', {
                meta:   `$${valor.toFixed(2)}`,
                accion: valor > 0 ? 'Meta actualizada' : 'Meta desactivada'
            });
            return true;
        } catch (error) {
            console.error('Error al guardar meta de ventas:', error);
            return false;
        }
    }

    obtenerMetaVentasDiaria() { return this.metaVentasDiaria; }

    // ─── NOMBRE DE SUCURSAL ───────────────────────────────────────────────

    async guardarNombreSucursal(nombre) {
        if (!window.currentUser || !window.sucursalActualId) return false;
        try {
            await window.db
                .collection('users').doc(window.currentUser.uid)
                .collection('sucursales').doc(window.sucursalActualId)
                .update({
                    nombre:    nombre.trim(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            window.sucursalActualNombre = nombre.trim();
            // Actualizar badge en sidebar
            const badge = document.getElementById('sucursalNombreBadge');
            if (badge) badge.textContent = nombre.trim();
            return true;
        } catch (err) {
            console.error('Error al guardar nombre sucursal:', err);
            return false;
        }
    }

    // ─── INICIALIZACIÓN UI ────────────────────────────────────────────────

    inicializar(auditoriaManager = null) {
        if (auditoriaManager) this._auditoria = auditoriaManager;

        // Listeners color pickers
        ['colorPrimario','colorSecundario','colorSidebar','colorExito','colorPeligro','colorAdvertencia']
            .forEach(id => {
                document.getElementById(id)?.addEventListener('input', () => this.actualizarTextosColores());
            });

        // Botón aplicar colores
        document.getElementById('btnAplicarColores')?.addEventListener('click', async () => {
            if (window.appInstance && !window.appInstance.usuariosManager.tienePermiso('configuracion_colores')) {
                alert('No tienes permiso para modificar colores'); return;
            }
            const colores = {
                primario:    document.getElementById('colorPrimario').value,
                secundario:  document.getElementById('colorSecundario').value,
                sidebar:     document.getElementById('colorSidebar').value,
                exito:       document.getElementById('colorExito').value,
                peligro:     document.getElementById('colorPeligro').value,
                advertencia: document.getElementById('colorAdvertencia').value
            };
            const btn = document.getElementById('btnAplicarColores');
            btn.disabled = true; btn.textContent = 'Guardando...';
            const success = await this.guardarColoresEnFirestore(colores);
            btn.disabled = false; btn.textContent = 'Aplicar Colores';
            if (success) alert('Colores aplicados y guardados correctamente.');
        });

        // Botón restablecer
        document.getElementById('btnResetColores')?.addEventListener('click', async () => {
            if (confirm('¿Restablecer los colores predeterminados?')) {
                const btn = document.getElementById('btnResetColores');
                btn.disabled = true; btn.textContent = 'Restableciendo...';
                const success = await this.restablecerColores();
                btn.disabled = false; btn.textContent = 'Restablecer Predeterminados';
                if (success) alert('Colores restablecidos correctamente');
            }
        });

        // Logout
        document.getElementById('btnConfigLogout')?.addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                try { await window.auth.signOut(); }
                catch (error) { console.error('Error al cerrar sesión:', error); }
            }
        });

        // Nombre de sucursal
        document.getElementById('btnGuardarNombreSucursal')?.addEventListener('click', async () => {
            const input = document.getElementById('inputNombreSucursal');
            const nombre = input?.value?.trim();
            if (!nombre) { alert('El nombre no puede estar vacío'); return; }
            const btn = document.getElementById('btnGuardarNombreSucursal');
            btn.disabled = true; btn.textContent = 'Guardando...';
            const ok = await this.guardarNombreSucursal(nombre);
            btn.disabled = false; btn.textContent = 'Guardar Nombre';
            if (ok) {
                alert('Nombre de sucursal actualizado.');
                // Actualizar también en el manager
                if (window.appInstance?.sucursalesManager) {
                    const suc = window.appInstance.sucursalesManager.obtenerPorId(window.sucursalActualId);
                    if (suc) suc.nombre = nombre;
                }
            }
        });

        // Meta de ventas
        document.getElementById('btnGuardarMetaVentas')?.addEventListener('click', async () => {
            const inputMeta = document.getElementById('inputMetaVentas');
            const valor     = parseFloat(inputMeta?.value) || 0;
            const btn       = document.getElementById('btnGuardarMetaVentas');
            btn.disabled = true; btn.textContent = 'Guardando...';
            const ok = await this.guardarMetaVentasDiaria(valor);
            btn.disabled = false; btn.textContent = 'Guardar Meta';
            if (ok) {
                alert(`Meta diaria de $${valor.toFixed(2)} guardada correctamente.`);
                if (window.appInstance) window.appInstance.actualizarDashboard();
            } else {
                alert('Error al guardar la meta.');
            }
        });

        // Email usuario
        if (window.currentUser) {
            const el = document.getElementById('configUserEmail');
            if (el) el.textContent = window.currentUser.email;
        }
    }

    actualizarEmailUsuario() {
        if (window.currentUser) {
            const el = document.getElementById('configUserEmail');
            if (el) el.textContent = window.currentUser.email;
        }
    }

    actualizarInputMeta() {
        const input = document.getElementById('inputMetaVentas');
        if (input) input.value = this.metaVentasDiaria > 0 ? this.metaVentasDiaria : '';
    }

    actualizarInputNombreSucursal() {
        const input = document.getElementById('inputNombreSucursal');
        if (input && window.sucursalActualNombre) input.value = window.sucursalActualNombre;
    }
}