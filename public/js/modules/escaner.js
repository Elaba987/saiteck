// escaner.js - Módulo de escaneo de códigos de barras via cámara
// Incluye controles avanzados: zoom, enfoque y linterna (flash)

export class EscanerManager {
    constructor() {
        this.codeReader   = null;
        this.isScanning   = false;
        this.scanCallback = null;

        // Estado de controles avanzados
        this._track       = null;   // MediaStreamTrack activo
        this._flashOn     = false;
        this._zoomActual  = 1;
        this._zoomMin     = 1;
        this._zoomMax     = 1;
        this._soportaZoom  = false;
        this._soportaFlash = false;
        this._soportaFoco  = false;
    }

    // ─── API PÚBLICA ────────────────────────────────────────────────────

    /** Abre el modal del escáner y llama a callback(codigo) cuando detecta uno */
    async abrir(callback) {
        this.scanCallback = callback;
        this._mostrarModal();
        await this._iniciarCamara();
    }

    /** Cierra el escáner y libera la cámara */
    cerrar() {
        this._detenerCamara();
        this._ocultarModal();
        this._resetControles();
    }

    // ─── MODAL ──────────────────────────────────────────────────────────

    _mostrarModal() {
        const modal = document.getElementById('modalEscaner');
        if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
    }

    _ocultarModal() {
        const modal = document.getElementById('modalEscaner');
        if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    }

    // ─── CÁMARA ─────────────────────────────────────────────────────────

    async _iniciarCamara() {
        if (!window.ZXing) {
            this._setStatus('❌ Librería de escaneo no disponible', true);
            return;
        }

        try {
            this._setStatus('🔍 Iniciando cámara...');

            this.codeReader = new ZXing.BrowserMultiFormatReader();
            const devices   = await this.codeReader.listVideoInputDevices();

            if (devices.length === 0) {
                this._setStatus('❌ No se encontró ninguna cámara', true);
                return;
            }

            // Preferir cámara trasera (environment)
            const trasera = devices.find(d => /back|rear|environment/i.test(d.label));
            const deviceId = trasera?.deviceId ?? devices[devices.length - 1]?.deviceId;

            this.isScanning = true;
            this._setStatus('📷 Apunta al código de barras');

            await this.codeReader.decodeFromVideoDevice(
                deviceId,
                document.getElementById('escanerVideo'),
                (result, error) => {
                    if (result && this.isScanning) {
                        this._alEscanear(result.getText());
                    }
                    // NotFoundException es normal cuando no hay código en el frame; ignorar
                    if (error && !(error instanceof ZXing.NotFoundException)) {
                        console.warn('[Escáner]', error.message);
                    }
                }
            );

            // Obtener el track activo para los controles avanzados
            const video = document.getElementById('escanerVideo');
            if (video?.srcObject) {
                const tracks = video.srcObject.getVideoTracks();
                if (tracks.length > 0) {
                    this._track = tracks[0];
                    await this._detectarCapacidades();
                    this._renderizarControlesAvanzados();
                }
            }

        } catch (err) {
            console.error('[Escáner] Error al abrir cámara:', err);
            const mensajes = {
                'NotAllowedError' : '❌ Permiso de cámara denegado. Habilítalo en tu navegador.',
                'NotFoundError'   : '❌ No se encontró ninguna cámara en este dispositivo.',
                'NotReadableError': '❌ La cámara está siendo usada por otra aplicación.',
            };
            this._setStatus(mensajes[err.name] ?? '❌ Error al acceder a la cámara.', true);
        }
    }

    _detenerCamara() {
        this.isScanning = false;

        // Apagar flash si estaba encendido
        if (this._flashOn && this._track) {
            try { this._track.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
        }
        this._flashOn = false;

        if (this.codeReader) {
            try { this.codeReader.reset(); } catch (_) {}
            this.codeReader = null;
        }

        // Asegurarnos de apagar el stream aunque reset() falle
        const video = document.getElementById('escanerVideo');
        if (video?.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
            video.srcObject = null;
        }

        this._track = null;
    }

    // ─── CAPACIDADES DE LA CÁMARA ────────────────────────────────────────

    async _detectarCapacidades() {
        if (!this._track) return;

        try {
            const caps = this._track.getCapabilities?.() || {};

            // Zoom
            if (caps.zoom) {
                this._soportaZoom = true;
                this._zoomMin     = caps.zoom.min ?? 1;
                this._zoomMax     = caps.zoom.max ?? 1;
                this._zoomActual  = caps.zoom.min ?? 1;
            }

            // Flash / linterna
            if (caps.torch !== undefined) {
                this._soportaFlash = true;
            }

            // Enfoque
            if (caps.focusMode) {
                this._soportaFoco = true;
            }

        } catch (e) {
            console.warn('[Escáner] No se pudieron leer capacidades de cámara', e);
        }
    }

    // ─── CONTROLES AVANZADOS ────────────────────────────────────────────

    _renderizarControlesAvanzados() {
        const contenedor = document.getElementById('escanerControlesAvanzados');
        if (!contenedor) return;

        // Solo mostrar si hay al menos una capacidad disponible
        if (!this._soportaZoom && !this._soportaFlash && !this._soportaFoco) {
            contenedor.style.display = 'none';
            return;
        }

        contenedor.style.display = 'flex';
        contenedor.innerHTML = '';

        // ── Botón de Flash ──
        if (this._soportaFlash) {
            const btnFlash = document.createElement('button');
            btnFlash.id        = 'escanerBtnFlash';
            btnFlash.className = 'escaner-ctrl-btn';
            btnFlash.title     = 'Encender/Apagar linterna';
            btnFlash.innerHTML = '🔦';
            btnFlash.addEventListener('click', () => this._toggleFlash(btnFlash));
            contenedor.appendChild(btnFlash);
        }

        // ── Slider de Zoom ──
        if (this._soportaZoom && this._zoomMax > this._zoomMin) {
            const zoomWrapper = document.createElement('div');
            zoomWrapper.className = 'escaner-zoom-wrapper';

            const labelZoom = document.createElement('span');
            labelZoom.className   = 'escaner-zoom-label';
            labelZoom.id          = 'escanerZoomLabel';
            labelZoom.textContent = `🔎 ${this._zoomActual.toFixed(1)}×`;

            const sliderZoom = document.createElement('input');
            sliderZoom.type      = 'range';
            sliderZoom.id        = 'escanerSliderZoom';
            sliderZoom.className = 'escaner-slider-zoom';
            sliderZoom.min       = this._zoomMin;
            sliderZoom.max       = this._zoomMax;
            sliderZoom.step      = (this._zoomMax - this._zoomMin) / 20 || 0.1;
            sliderZoom.value     = this._zoomActual;

            sliderZoom.addEventListener('input', (e) => {
                this._aplicarZoom(parseFloat(e.target.value), labelZoom);
            });

            zoomWrapper.appendChild(labelZoom);
            zoomWrapper.appendChild(sliderZoom);
            contenedor.appendChild(zoomWrapper);
        }

        // ── Botón Enfoque automático ──
        if (this._soportaFoco) {
            const btnFoco = document.createElement('button');
            btnFoco.id        = 'escanerBtnFoco';
            btnFoco.className = 'escaner-ctrl-btn';
            btnFoco.title     = 'Reenfocar';
            btnFoco.innerHTML = '🎯';
            btnFoco.addEventListener('click', () => this._reenfocar(btnFoco));
            contenedor.appendChild(btnFoco);
        }
    }

    async _toggleFlash(btn) {
        if (!this._track || !this._soportaFlash) return;
        try {
            this._flashOn = !this._flashOn;
            await this._track.applyConstraints({ advanced: [{ torch: this._flashOn }] });
            btn.style.background = this._flashOn
                ? 'rgba(255, 220, 50, 0.35)'
                : 'rgba(255,255,255,0.12)';
            btn.title = this._flashOn ? 'Apagar linterna' : 'Encender linterna';
        } catch (e) {
            console.warn('[Escáner] Flash no soportado:', e);
            this._flashOn = false;
        }
    }

    async _aplicarZoom(valor, labelEl) {
        if (!this._track || !this._soportaZoom) return;
        try {
            this._zoomActual = valor;
            await this._track.applyConstraints({ advanced: [{ zoom: valor }] });
            if (labelEl) labelEl.textContent = `🔎 ${valor.toFixed(1)}×`;
        } catch (e) {
            console.warn('[Escáner] Zoom no pudo aplicarse:', e);
        }
    }

    async _reenfocar(btn) {
        if (!this._track || !this._soportaFoco) return;
        try {
            btn.style.opacity = '0.5';
            btn.disabled      = true;

            // Primero forzar "single" (dispara el autofocus una vez)
            await this._track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });

            // Volver a continuo después de un instante
            setTimeout(async () => {
                try {
                    await this._track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                } catch (_) {}
                btn.style.opacity = '1';
                btn.disabled      = false;
            }, 600);

        } catch (e) {
            // Si no existe 'single-shot', intentar 'auto'
            try {
                await this._track.applyConstraints({ advanced: [{ focusMode: 'auto' }] });
            } catch (_) {}
            btn.style.opacity = '1';
            btn.disabled      = false;
            console.warn('[Escáner] Reenfoque parcial:', e);
        }
    }

    _resetControles() {
        this._flashOn    = false;
        this._zoomActual = this._zoomMin;
        this._soportaZoom  = false;
        this._soportaFlash = false;
        this._soportaFoco  = false;

        const contenedor = document.getElementById('escanerControlesAvanzados');
        if (contenedor) {
            contenedor.style.display = 'none';
            contenedor.innerHTML     = '';
        }
    }

    // ─── DETECCIÓN ──────────────────────────────────────────────────────

    _alEscanear(rawCode) {
        if (!this.isScanning) return;
        this.isScanning = false; // evitar doble disparo

        // Normalizar: quedarse solo con dígitos si el código es numérico (EAN/UPC)
        const soloNumeros = rawCode.replace(/\D/g, '');
        const codigo = soloNumeros.length > 0 ? soloNumeros : rawCode;

        this._setStatus(`✅ ${codigo}`, false);
        this._beep();
        if (navigator.vibrate) navigator.vibrate([40, 20, 40]);

        // Pequeña pausa para que el usuario vea el resultado antes de cerrar
        setTimeout(() => {
            this.cerrar();
            if (this.scanCallback) this.scanCallback(codigo);
        }, 350);
    }

    // ─── UTILIDADES ─────────────────────────────────────────────────────

    _setStatus(texto, esError = false) {
        const el = document.getElementById('escanerStatus');
        if (el) {
            el.textContent = texto;
            el.style.color = esError ? '#fc8181' : '#68d391';
        }
    }

    _beep() {
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 1800;
            osc.type            = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } catch (_) {}
    }
}