// configuracion.js - Modulo para gestion de configuracion y colores

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

        // Meta de ventas diaria en memoria (se carga desde Firestore)
        this.metaVentasDiaria = 0;

        // Referencia al manager de auditoría (se inyecta desde app.js)
        this._auditoria = null;

        // Hacer instancia global
        window.configuracionManager = this;
    }

    // === GESTIÓN DE COLORES EN FIRESTORE ===
    async cargarColoresDesdeFirestore() {
        if (!window.currentUser) {
            this.aplicarColores(this.coloresDefault);
            return;
        }

        try {
            const doc = await window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('configuracion')
                .doc('colores')
                .get();

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
        if (!window.currentUser) {
            alert('No hay usuario autenticado');
            return false;
        }

        try {
            await window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('configuracion')
                .doc('colores')
                .set({
                    ...colores,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            this.aplicarColores(colores);

            // ── Auditoría ──
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

            // ── Auditoría ──
            this._auditoria?.registrar('CONFIG_COLORES_RESET', {
                accion: 'Colores restablecidos a valores predeterminados'
            });

            return true;
        }
        return false;
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
            const textElement  = document.getElementById(textId);
            const inputElement = document.getElementById(inputId);
            if (textElement && inputElement) {
                textElement.textContent = inputElement.value;
            }
        }
    }

    // =============================================
    // META DE VENTAS DIARIA
    // =============================================

    async cargarMetaVentasDiaria() {
        if (!window.currentUser) return 0;
        try {
            const doc = await window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('configuracion')
                .doc('metas')
                .get();

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
            await window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('configuracion')
                .doc('metas')
                .set({
                    metaDiaria: valor,
                    updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            this.metaVentasDiaria = valor;

            // ── Auditoría ──
            this._auditoria?.registrar('CONFIG_META_VENTAS', {
                meta:    `$${valor.toFixed(2)}`,
                accion:  valor > 0 ? 'Meta actualizada' : 'Meta desactivada'
            });

            return true;
        } catch (error) {
            console.error('Error al guardar meta de ventas:', error);
            return false;
        }
    }

    obtenerMetaVentasDiaria() {
        return this.metaVentasDiaria;
    }

    // =============================================
    // INICIALIZACIÓN DE LA UI DE CONFIGURACIÓN
    // =============================================

    /**
     * @param {AuditoriaManager} [auditoriaManager] - Opcional, se inyecta desde app.js
     */
    inicializar(auditoriaManager = null) {
        if (auditoriaManager) this._auditoria = auditoriaManager;

        // Event listeners para cambio de colores en tiempo real
        const colorInputs = [
            'colorPrimario', 'colorSecundario', 'colorSidebar',
            'colorExito', 'colorPeligro', 'colorAdvertencia'
        ];
        colorInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.actualizarTextosColores();
                });
            }
        });

        // Botón aplicar colores
        const btnAplicar = document.getElementById('btnAplicarColores');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', async () => {
                if (window.appInstance && !window.appInstance.usuariosManager.tienePermiso('configuracion_colores')) {
                    alert('No tienes permiso para modificar colores');
                    return;
                }

                const colores = {
                    primario:    document.getElementById('colorPrimario').value,
                    secundario:  document.getElementById('colorSecundario').value,
                    sidebar:     document.getElementById('colorSidebar').value,
                    exito:       document.getElementById('colorExito').value,
                    peligro:     document.getElementById('colorPeligro').value,
                    advertencia: document.getElementById('colorAdvertencia').value
                };

                btnAplicar.disabled     = true;
                btnAplicar.textContent  = 'Guardando...';

                const success = await this.guardarColoresEnFirestore(colores);

                btnAplicar.disabled    = false;
                btnAplicar.textContent = 'Aplicar Colores';

                if (success) {
                    alert('Colores aplicados y guardados correctamente.\nSe sincronizarán en todos tus dispositivos.');
                }
            });
        }

        // Botón restablecer colores
        const btnReset = document.getElementById('btnResetColores');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (confirm('¿Restablecer los colores predeterminados?')) {
                    btnReset.disabled    = true;
                    btnReset.textContent = 'Restableciendo...';

                    const success = await this.restablecerColores();

                    btnReset.disabled    = false;
                    btnReset.textContent = 'Restablecer Predeterminados';

                    if (success) alert('Colores restablecidos correctamente');
                }
            });
        }

        // Botón cerrar sesión en configuración
        const btnConfigLogout = document.getElementById('btnConfigLogout');
        if (btnConfigLogout) {
            btnConfigLogout.addEventListener('click', async () => {
                if (confirm('¿Cerrar sesión?')) {
                    try {
                        await window.auth.signOut();
                    } catch (error) {
                        console.error('Error al cerrar sesión:', error);
                        alert('Error al cerrar sesión');
                    }
                }
            });
        }

        // ── Meta de ventas diaria ──
        const btnGuardarMeta = document.getElementById('btnGuardarMetaVentas');
        if (btnGuardarMeta) {
            btnGuardarMeta.addEventListener('click', async () => {
                const inputMeta = document.getElementById('inputMetaVentas');
                const valor     = parseFloat(inputMeta?.value) || 0;

                btnGuardarMeta.disabled    = true;
                btnGuardarMeta.textContent = 'Guardando...';

                const ok = await this.guardarMetaVentasDiaria(valor);

                btnGuardarMeta.disabled    = false;
                btnGuardarMeta.textContent = 'Guardar Meta';

                if (ok) {
                    alert(`Meta diaria de $${valor.toFixed(2)} guardada correctamente.`);
                    if (window.appInstance) window.appInstance.actualizarDashboard();
                } else {
                    alert('Error al guardar la meta.');
                }
            });
        }

        // Actualizar email del usuario en configuración
        if (window.currentUser) {
            const configEmail = document.getElementById('configUserEmail');
            if (configEmail) configEmail.textContent = window.currentUser.email;
        }
    }

    actualizarEmailUsuario() {
        if (window.currentUser) {
            const configEmail = document.getElementById('configUserEmail');
            if (configEmail) configEmail.textContent = window.currentUser.email;
        }
    }

    actualizarInputMeta() {
        const input = document.getElementById('inputMetaVentas');
        if (input) {
            input.value = this.metaVentasDiaria > 0 ? this.metaVentasDiaria : '';
        }
    }
}