// storage.js - Módulo para manejo de datos en Firestore

export const StorageManager = {
    // Obtener la colección del usuario actual
    getUserCollection(collectionName) {
        if (!window.currentUser) {
            throw new Error('Usuario no autenticado');
        }
        return window.db.collection('users')
            .doc(window.currentUser.uid)
            .collection(collectionName);
    },

    // Guardar múltiples documentos (migración desde array)
    async saveAll(collectionName, data) {
        try {
            const collection = this.getUserCollection(collectionName);
            const batch = window.db.batch();
            
            // Eliminar documentos existentes
            const snapshot = await collection.get();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            // Agregar nuevos documentos
            data.forEach((item) => {
                const docRef = collection.doc();
                batch.set(docRef, {
                    ...item,
                    id: docRef.id,
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

    // Cargar todos los documentos
    async loadAll(collectionName) {
        try {
            const collection = this.getUserCollection(collectionName);
            const snapshot = await collection.orderBy('updatedAt', 'desc').get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error al cargar datos:', error);
            return [];
        }
    },

    // Agregar un documento
    async add(collectionName, data) {
        try {
            const collection = this.getUserCollection(collectionName);
            const docRef = await collection.add({
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

    // Actualizar un documento
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

    // Eliminar un documento
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

    // Obtener un documento específico
    async getOne(collectionName, docId) {
        try {
            const collection = this.getUserCollection(collectionName);
            const doc = await collection.doc(docId).get();
            
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Error al obtener documento:', error);
            return null;
        }
    },

    // Escuchar cambios en tiempo real
    onSnapshot(collectionName, callback) {
        try {
            const collection = this.getUserCollection(collectionName);
            return collection.orderBy('updatedAt', 'desc').onSnapshot(
                (snapshot) => {
                    const data = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    callback(data);
                },
                (error) => {
                    console.error('Error en snapshot:', error);
                    callback([]);
                }
            );
        } catch (error) {
            console.error('Error al escuchar cambios:', error);
            return () => {};
        }
    },

    // Migrar datos desde localStorage (útil para primera vez)
    async migrateFromLocalStorage() {
        if (!window.currentUser) return;

        const collections = ['productos', 'proveedores', 'ventas'];
        
        for (const collectionName of collections) {
            try {
                const localData = localStorage.getItem(collectionName);
                if (localData) {
                    const data = JSON.parse(localData);
                    if (Array.isArray(data) && data.length > 0) {
                        console.log(`Migrando ${collectionName}...`);
                        await this.saveAll(collectionName, data);
                        console.log(`✓ ${collectionName} migrado exitosamente`);
                    }
                }
            } catch (error) {
                console.error(`Error al migrar ${collectionName}:`, error);
            }
        }
    }
};

// Claves para las colecciones
export const STORAGE_KEYS = {
    PRODUCTOS: 'productos',
    PROVEEDORES: 'proveedores',
    VENTAS: 'ventas'
};