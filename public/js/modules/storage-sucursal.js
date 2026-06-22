// storage-sucursal.js
// Adaptador de StorageManager que apunta a la sub-colección de la sucursal activa.
// Reemplaza al StorageManager original cuando hay una sucursal seleccionada.

export const StorageSucursalManager = {

    /** Devuelve la ref a users/{uid}/sucursales/{sucursalId}/{coleccion} */
    _getRef(collectionName) {
        if (!window.currentUser) throw new Error('Usuario no autenticado');
        const sucursal = window.sucursalActualId;
        if (!sucursal) throw new Error('No hay sucursal activa seleccionada');
        return window.db
            .collection('users')
            .doc(window.currentUser.uid)
            .collection('sucursales')
            .doc(sucursal)
            .collection(collectionName);
    },

    async loadAll(collectionName) {
        try {
            const snap = await this._getRef(collectionName)
                .orderBy('updatedAt', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
            // Si no existe el índice todavía, fallback sin ordenar
            try {
                const snap = await this._getRef(collectionName).get();
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                console.error('[StorageSucursal] Error loadAll:', e);
                return [];
            }
        }
    },

    async add(collectionName, data) {
        try {
            const ref = await this._getRef(collectionName).add({
                ...data,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, id: ref.id };
        } catch (err) {
            console.error('[StorageSucursal] Error add:', err);
            return { success: false, error: err.message };
        }
    },

    async update(collectionName, docId, data) {
        try {
            await this._getRef(collectionName).doc(docId).update({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (err) {
            console.error('[StorageSucursal] Error update:', err);
            return { success: false, error: err.message };
        }
    },

    async delete(collectionName, docId) {
        try {
            await this._getRef(collectionName).doc(docId).delete();
            return { success: true };
        } catch (err) {
            console.error('[StorageSucursal] Error delete:', err);
            return { success: false, error: err.message };
        }
    },

    async getOne(collectionName, docId) {
        try {
            const doc = await this._getRef(collectionName).doc(docId).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        } catch (err) {
            console.error('[StorageSucursal] Error getOne:', err);
            return null;
        }
    },

    onSnapshot(collectionName, callback) {
        try {
            return this._getRef(collectionName)
                .orderBy('updatedAt', 'desc')
                .onSnapshot(
                    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
                    err  => { console.error('[StorageSucursal] Snapshot error:', err); callback([]); }
                );
        } catch (err) {
            console.error('[StorageSucursal] Error onSnapshot:', err);
            return () => {};
        }
    },

    // Compatibilidad con storage.js original
    async saveAll(collectionName, data) {
        try {
            const col   = this._getRef(collectionName);
            const batch = window.db.batch();
            const snap  = await col.get();
            snap.docs.forEach(d => batch.delete(d.ref));
            data.forEach(item => {
                const ref = col.doc();
                batch.set(ref, { ...item, id: ref.id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
            return true;
        } catch (err) {
            console.error('[StorageSucursal] Error saveAll:', err);
            return false;
        }
    }
};

// Getter dinámico: devuelve el manager correcto según si hay sucursal activa
export function getActiveStorageManager() {
    if (window.sucursalActualId) return StorageSucursalManager;
    // Importación dinámica desde storage.js original
    const { StorageManager } = window._storageManagerRef || {};
    return StorageManager;
}