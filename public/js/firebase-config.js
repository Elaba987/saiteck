// firebase-config.js - Configuración de Firebase (Proyecto: saiteck-pos-db907)

const firebaseConfig = {
  apiKey: "AIzaSyAUoRXQtF57BP8xrgC9CinIgNuNmVbnrMg",
  authDomain: "saiteck-pos-db907.firebaseapp.com",
  projectId: "saiteck-pos-db907",
  storageBucket: "saiteck-pos-db907.firebasestorage.app",
  messagingSenderId: "537929339496",
  appId: "1:537929339496:web:a04a12f3984e449f1fe1dd",
  measurementId: "G-HEX187R6BS"
};

// Inicializar Firebase utilizando la sintaxis tradicional (SDK v8) compatible con tu app
firebase.initializeApp(firebaseConfig);

// Referencias globales a los servicios
window.auth = firebase.auth();
window.db   = firebase.firestore();

// ─────────────────────────────────────────────────────────────
// ESTADO GLOBAL DE LA CUENTA
// ─────────────────────────────────────────────────────────────
window.currentUser       = null;
window.cuentaAccesoTotal = false;   // Techo máximo de la cuenta

// ─────────────────────────────────────────────────────────────
// Lee el documento raíz de la cuenta y extrae el plan de suscripción.
// ─────────────────────────────────────────────────────────────
async function cargarSuscripcionCuenta(uid) {
  try {
    const docSnap = await window.db.collection('users').doc(uid).get();

    if (docSnap.exists) {
      const data = docSnap.data();
      // Plan Basic = false | Plan Pro = true
      window.cuentaAccesoTotal = data.accesoTotal === true;
      // Límite de usuarios secundarios controlado desde Firestore Console
      window.cuentaMaxUsuarios = typeof data.maxUsuarios === 'number'
        ? data.maxUsuarios
        : 5;
    } else {
      // Documento aún no creado en el nuevo proyecto → Crearlo con plan Basic por defecto
      await window.db.collection('users').doc(uid).set({
        accesoTotal: false,
        maxUsuarios: 5,
        creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
      });
      window.cuentaAccesoTotal = false;
      window.cuentaMaxUsuarios = 5;
    }

    console.log(
      `[Suscripción] ${uid} → plan: ${window.cuentaAccesoTotal ? 'Pro' : 'Basic'} | maxUsuarios: ${window.cuentaMaxUsuarios}`
    );
  } catch (error) {
    console.error('Error al leer suscripción de cuenta:', error);
    window.cuentaAccesoTotal = false;
    window.cuentaMaxUsuarios = 5;
  }
}

// ─────────────────────────────────────────────────────────────
// Observador de autenticación
// ─────────────────────────────────────────────────────────────
window.auth.onAuthStateChanged(async (user) => {
  window.currentUser = user;

  if (user) {
    console.log('Usuario autenticado:', user.email);

    // 1. Leer plan de suscripción ANTES de mostrar cualquier pantalla
    await cargarSuscripcionCuenta(user.uid);

    // 2. Mostrar selección de perfil
    mostrarSeleccionPerfil();
  } else {
    console.log('Usuario no autenticado');
    window.cuentaAccesoTotal = false;
    mostrarAuth();
  }
});

// ─────────────────────────────────────────────────────────────
// Funciones de navegación entre pantallas
// ─────────────────────────────────────────────────────────────
function mostrarAuth() {
  document.getElementById('authContainer').classList.remove('hidden');
  document.getElementById('profileContainer').classList.add('hidden');
  document.getElementById('appContainer').classList.add('hidden');
}

function mostrarSeleccionPerfil() {
  document.getElementById('authContainer').classList.add('hidden');
  document.getElementById('profileContainer').classList.remove('hidden');
  document.getElementById('appContainer').classList.add('hidden');

  if (window.appInstance && window.appInstance.usuariosManager) {
    window.appInstance.cargarPantallaPerfil();
  }
}

function mostrarApp() {
  document.getElementById('authContainer').classList.add('hidden');
  document.getElementById('profileContainer').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');

  const userEmailElement = document.getElementById('userEmail');
  if (userEmailElement && window.currentUser) {
    userEmailElement.textContent = window.currentUser.email;
  }

  if (window.appInstance && typeof window.appInstance.onUserAuthenticated === 'function') {
    window.appInstance.onUserAuthenticated();
  }
}

// Exponer globalmente
window.mostrarApp              = mostrarApp;
window.mostrarSeleccionPerfil  = mostrarSeleccionPerfil;

// ─────────────────────────────────────────────────────────────
// DOMContentLoaded: login y logout desde pantalla de perfiles
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Formulario de login
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email     = document.getElementById('loginEmail').value;
      const password  = document.getElementById('loginPassword').value;
      const errorDiv  = document.getElementById('loginError');

      try {
        await window.auth.signInWithEmailAndPassword(email, password);
        errorDiv.textContent = '';
      } catch (error) {
        console.error('Error en login:', error);
        errorDiv.textContent = obtenerMensajeError(error.code);
      }
    });
  }

  // Botón cerrar sesión desde pantalla de selección de perfil
  const btnLogoutFromProfiles = document.getElementById('btnLogoutFromProfiles');
  if (btnLogoutFromProfiles) {
    btnLogoutFromProfiles.addEventListener('click', async () => {
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
});

// ─────────────────────────────────────────────────────────────
// Mensajes de error de autenticación
// ─────────────────────────────────────────────────────────────
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