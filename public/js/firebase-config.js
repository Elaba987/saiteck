// firebase-config.js - Configuración de Firebase
// ACTUALIZADO: Soporte multi-sucursal

const firebaseConfig = {
  apiKey:            "AIzaSyBF2s_tR7kg_Tpr1LgWvPayesZR7ouP_t8",
  authDomain:        "sistema-inventarios-1609c.firebaseapp.com",
  projectId:         "sistema-inventarios-1609c",
  storageBucket:     "sistema-inventarios-1609c.firebasestorage.app",
  messagingSenderId: "122614933440",
  appId:             "1:122614933440:web:2bd239c9be16b188a58a25"
};

firebase.initializeApp(firebaseConfig);

window.auth = firebase.auth();
window.db   = firebase.firestore();

// ─── ESTADO GLOBAL ────────────────────────────────────────────
window.currentUser          = null;
window.cuentaAccesoTotal    = false;
window.sucursalActualId     = null;   // ID Firestore de la sucursal activa
window.sucursalActualNombre = null;   // Nombre legible de la sucursal activa

// ─── SUSCRIPCIÓN DE CUENTA ────────────────────────────────────
async function cargarSuscripcionCuenta(uid) {
    try {
        const docSnap = await window.db.collection('users').doc(uid).get();

        if (docSnap.exists) {
            const data = docSnap.data();
            window.cuentaAccesoTotal = data.accesoTotal === true;
            window.cuentaMaxUsuarios = typeof data.maxUsuarios === 'number' ? data.maxUsuarios : 5;
        } else {
            await window.db.collection('users').doc(uid).set({
                accesoTotal: false,
                maxUsuarios: 5,
                creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
            });
            window.cuentaAccesoTotal = false;
            window.cuentaMaxUsuarios = 5;
        }

        console.log(`[Suscripción] ${uid} → plan: ${window.cuentaAccesoTotal ? 'Pro' : 'Basic'} | maxUsuarios: ${window.cuentaMaxUsuarios}`);
    } catch (error) {
        console.error('Error al leer suscripción:', error);
        window.cuentaAccesoTotal = false;
        window.cuentaMaxUsuarios = 5;
    }
}

// ─── OBSERVADOR DE AUTENTICACIÓN ──────────────────────────────
window.auth.onAuthStateChanged(async (user) => {
    window.currentUser = user;

    if (user) {
        console.log('Usuario autenticado:', user.email);
        await cargarSuscripcionCuenta(user.uid);
        // Ir a selección de sucursal (flujo nuevo)
        mostrarSeleccionSucursal();
    } else {
        console.log('Usuario no autenticado');
        window.cuentaAccesoTotal    = false;
        window.sucursalActualId     = null;
        window.sucursalActualNombre = null;
        mostrarAuth();
    }
});

// ─── NAVEGACIÓN DE PANTALLAS ──────────────────────────────────

function mostrarAuth() {
    document.getElementById('authContainer').classList.remove('hidden');
    document.getElementById('sucursalContainer').classList.add('hidden');
    document.getElementById('profileContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.add('hidden');
}

/** Pantalla de selección de sucursal (nueva, entre auth y perfiles) */
async function mostrarSeleccionSucursal() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('sucursalContainer').classList.remove('hidden');
    document.getElementById('profileContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.add('hidden');

    if (window.appInstance) {
        await window.appInstance.mostrarPantallaSucursales();
    }
}

/** Pantalla de selección de perfil (usuarios) — ya con sucursal definida */
function mostrarSeleccionPerfil() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('sucursalContainer').classList.add('hidden');
    document.getElementById('profileContainer').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');

    if (window.appInstance && window.appInstance.usuariosManager) {
        window.appInstance.cargarPantallaPerfil();
    }
}

/**
 * Muestra la aplicación principal.
 * @param {boolean} esSuperAdmin - true cuando es el panel maestro (sin sucursal)
 */
function mostrarApp(esSuperAdmin = false) {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('sucursalContainer').classList.add('hidden');
    document.getElementById('profileContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');

    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl && window.currentUser) userEmailEl.textContent = window.currentUser.email;

    if (window.appInstance && typeof window.appInstance.onUserAuthenticated === 'function') {
        window.appInstance.onUserAuthenticated(esSuperAdmin);
    }
}

// Exponer globales
window.mostrarAuth             = mostrarAuth;
window.mostrarSeleccionSucursal = mostrarSeleccionSucursal;
window.mostrarSeleccionPerfil  = mostrarSeleccionPerfil;
window.mostrarApp              = mostrarApp;

// ─── INICIALIZACIÓN DOMContentLoaded ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Formulario de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email    = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const errorDiv = document.getElementById('loginError');
            try {
                await window.auth.signInWithEmailAndPassword(email, password);
                errorDiv.textContent = '';
            } catch (error) {
                console.error('Error en login:', error);
                errorDiv.textContent = obtenerMensajeError(error.code);
            }
        });
    }

    // Logout desde pantalla de sucursales
    document.getElementById('btnLogoutFromSucursales')?.addEventListener('click', async () => {
        if (confirm('¿Cerrar sesión?')) {
            try { await window.auth.signOut(); }
            catch (error) { console.error('Error al cerrar sesión:', error); }
        }
    });

    // Logout desde pantalla de perfiles
    document.getElementById('btnLogoutFromProfiles')?.addEventListener('click', async () => {
        if (confirm('¿Cerrar sesión?')) {
            try { await window.auth.signOut(); }
            catch (error) { console.error('Error al cerrar sesión:', error); }
        }
    });

    // Botón "Volver a sucursales" en pantalla de perfiles
    document.getElementById('btnVolverSucursales')?.addEventListener('click', async () => {
        window.sucursalActualId     = null;
        window.sucursalActualNombre = null;
        if (window.appInstance?.sucursalesManager) {
            window.appInstance.sucursalesManager.cerrarSesionSucursal();
        }
        await mostrarSeleccionSucursal();
    });
});

// ─── MENSAJES DE ERROR ────────────────────────────────────────
function obtenerMensajeError(code) {
    const mensajes = {
        'auth/email-already-in-use':   'Este email ya está registrado',
        'auth/invalid-email':          'Email inválido',
        'auth/user-not-found':         'Usuario no encontrado',
        'auth/wrong-password':         'Contraseña incorrecta',
        'auth/weak-password':          'La contraseña es muy débil',
        'auth/too-many-requests':      'Demasiados intentos. Intenta más tarde',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
        'auth/invalid-credential':     'Credenciales inválidas. Verifica tu email y contraseña'
    };
    return mensajes[code] || 'Error de autenticación. Intenta nuevamente';
} 