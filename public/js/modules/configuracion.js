// configuracion.js - Modulo para gestion de configuracion y colores

export class ConfiguracionManager {
    constructor() {
        this.coloresDefault = {
            primario: '#667eea',
            secundario: '#764ba2',
            sidebar: '#2d3748',
            exito: '#48bb78',
            peligro: '#f56565',
            advertencia: '#ed8936'
        };
        
        // Hacer instancia global
        window.configuracionManager = this;
    }

    // === GESTION DE COLORES EN FIRESTORE ===
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
        root.style.setProperty('--color-primario', colores.primario);
        root.style.setProperty('--color-secundario', colores.secundario);
        root.style.setProperty('--color-sidebar', colores.sidebar);
        root.style.setProperty('--color-exito', colores.exito);
        root.style.setProperty('--color-peligro', colores.peligro);
        root.style.setProperty('--color-advertencia', colores.advertencia);
        
        // Actualizar el gradiente del body
        document.body.style.background = `linear-gradient(135deg, ${colores.primario} 0%, ${colores.secundario} 100%)`;
    }

    actualizarInputsColores(colores) {
        setTimeout(() => {
            const inputs = {
                'colorPrimario': colores.primario,
                'colorSecundario': colores.secundario,
                'colorSidebar': colores.sidebar,
                'colorExito': colores.exito,
                'colorPeligro': colores.peligro,
                'colorAdvertencia': colores.advertencia
            };

            for (const [id, valor] of Object.entries(inputs)) {
                const input = document.getElementById(id);
                if (input) {
                    input.value = valor;
                }
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
            return true;
        }
        return false;
    }

    actualizarTextosColores() {
        const textos = {
            'colorPrimarioText': 'colorPrimario',
            'colorSecundarioText': 'colorSecundario',
            'colorSidebarText': 'colorSidebar',
            'colorExitoText': 'colorExito',
            'colorPeligroText': 'colorPeligro',
            'colorAdvertenciaText': 'colorAdvertencia'
        };

        for (const [textId, inputId] of Object.entries(textos)) {
            const textElement = document.getElementById(textId);
            const inputElement = document.getElementById(inputId);
            if (textElement && inputElement) {
                textElement.textContent = inputElement.value;
            }
        }
    }

    inicializar() {
        // Event listeners para cambio de colores en tiempo real
        const colorInputs = ['colorPrimario', 'colorSecundario', 'colorSidebar', 'colorExito', 'colorPeligro', 'colorAdvertencia'];
        colorInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.actualizarTextosColores();
                });
            }
        });

        // Boton aplicar colores
        const btnAplicar = document.getElementById('btnAplicarColores');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', async () => {
                // Validar permiso
                if (window.appInstance && !window.appInstance.usuariosManager.tienePermiso('configuracion_colores')) {
                    alert('No tienes permiso para modificar colores');
                    return;
                }
                
                const colores = {
                    primario: document.getElementById('colorPrimario').value,
                    secundario: document.getElementById('colorSecundario').value,
                    sidebar: document.getElementById('colorSidebar').value,
                    exito: document.getElementById('colorExito').value,
                    peligro: document.getElementById('colorPeligro').value,
                    advertencia: document.getElementById('colorAdvertencia').value
                };
                
                btnAplicar.disabled = true;
                btnAplicar.textContent = 'Guardando...';
                
                const success = await this.guardarColoresEnFirestore(colores);
                
                btnAplicar.disabled = false;
                btnAplicar.textContent = 'Aplicar Colores';
                
                if (success) {
                    alert('Colores aplicados y guardados correctamente.\nSe sincronizaran en todos tus dispositivos.');
                }
            });
        }

        // Boton restablecer colores
        const btnReset = document.getElementById('btnResetColores');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (confirm('Restablecer los colores predeterminados?')) {
                    btnReset.disabled = true;
                    btnReset.textContent = 'Restableciendo...';
                    
                    const success = await this.restablecerColores();
                    
                    btnReset.disabled = false;
                    btnReset.textContent = 'Restablecer Predeterminados';
                    
                    if (success) {
                        alert('Colores restablecidos correctamente');
                    }
                }
            });
        }

        // Boton cerrar sesion en configuracion
        const btnConfigLogout = document.getElementById('btnConfigLogout');
        if (btnConfigLogout) {
            btnConfigLogout.addEventListener('click', async () => {
                if (confirm('Cerrar sesion?')) {
                    try {
                        await window.auth.signOut();
                    } catch (error) {
                        console.error('Error al cerrar sesion:', error);
                        alert('Error al cerrar sesion');
                    }
                }
            });
        }

        // Actualizar email del usuario en configuracion
        if (window.currentUser) {
            const configEmail = document.getElementById('configUserEmail');
            if (configEmail) {
                configEmail.textContent = window.currentUser.email;
            }
        }
    }

    // Metodo para actualizar el email cuando se accede a configuracion
    actualizarEmailUsuario() {
        if (window.currentUser) {
            const configEmail = document.getElementById('configUserEmail');
            if (configEmail) {
                configEmail.textContent = window.currentUser.email;
            }
        }
    }
}