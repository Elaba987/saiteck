// storage.js - Módulo para manejo de datos en Firestore
// ACTUALIZADO: Soporta multi-sucursal cuando window.sucursalActualId está definido

export const StorageManager = {

    // ─── RESOLUCIÓN DE COLECCIÓN ─────────────────────────────────────────
    // Si hay sucursal activa → users/{uid}/sucursales/{sucursalId}/{col}
    // Si no               → users/{uid}/{col}  (legacy / sin sucursales)

    getUserCollection(collectionName) {
        if (!window.currentUser) throw new Error('Usuario no autenticado');

        const sucursalId = window.sucursalActualId;

        if (sucursalId) {
            return window.db
                .collection('users')
                .doc(window.currentUser.uid)
                .collection('sucursales')
                .doc(sucursalId)
                .collection(collectionName);
        }

        // Fallback: ruta original (compatibilidad)
        return window.db
            .collection('users')
            .doc(window.currentUser.uid)
            .collection(collectionName);
    },

    // ─── CRUD ─────────────────────────────────────────────────────────────

    async saveAll(collectionName, data) {
        try {
            const collection = this.getUserCollection(collectionName);
            const batch      = window.db.batch();
            const snapshot   = await collection.get();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            data.forEach(item => {
                const docRef = collection.doc();
                batch.set(docRef, {
                    ...item,
                    id:        docRef.id,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            return true;
        } catch (error) {
            console.error('Error al guardar datos:', error);
            return false;
        }
    },

    async loadAll(collectionName) {
        try {
            const collection = this.getUserCollection(collectionName);
            const snapshot   = await collection.orderBy('updatedAt', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            // Fallback sin ordenar si no existe el índice
            try {
                const collection = this.getUserCollection(collectionName);
                const snapshot   = await collection.get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error('Error al cargar datos:', e);
                return [];
            }
        }
    },

    async add(collectionName, data) {
        try {
            const collection = this.getUserCollection(collectionName);
            const docRef     = await collection.add({
                ...data,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error al agregar documento:', error);
            return { success: false, error: error.message };
        }
    },

    async update(collectionName, docId, data) {
        try {
            const collection = this.getUserCollection(collectionName);
            await collection.doc(docId).update({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Error al actualizar documento:', error);
            return { success: false, error: error.message };
        }
    },

    async delete(collectionName, docId) {
        try {
            const collection = this.getUserCollection(collectionName);
            await collection.doc(docId).delete();
            return { success: true };
        } catch (error) {
            console.error('Error al eliminar documento:', error);
            return { success: false, error: error.message };
        }
    },

    async getOne(collectionName, docId) {
        try {
            const collection = this.getUserCollection(collectionName);
            const doc        = await collection.doc(docId).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        } catch (error) {
            console.error('Error al obtener documento:', error);
            return null;
        }
    },

    onSnapshot(collectionName, callback) {
        try {
            const collection = this.getUserCollection(collectionName);
            return collection.orderBy('updatedAt', 'desc').onSnapshot(
                snapshot => {
                    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                },
                error => {
                    console.error('Error en snapshot:', error);
                    callback([]);
                }
            );
        } catch (error) {
            console.error('Error al escuchar cambios:', error);
            return () => {};
        }
    },

    async migrateFromLocalStorage() {
        if (!window.currentUser) return;
        const collections = ['productos', 'proveedores', 'ventas'];
        for (const collectionName of collections) {
            try {
                const localData = localStorage.getItem(collectionName);
                if (localData) {
                    const data = JSON.parse(localData);
                    if (Array.isArray(data) && data.length > 0) {
                        await this.saveAll(collectionName, data);
                    }
                }
            } catch (error) {
                console.error(`Error al migrar ${collectionName}:`, error);
            }
        }
    }
};

export const STORAGE_KEYS = {
    PRODUCTOS:    'productos',
    PROVEEDORES:  'proveedores',
    VENTAS:       'ventas'
};

// Exponer referencia global para StorageSucursalManager
window._storageManagerRef = { StorageManager };