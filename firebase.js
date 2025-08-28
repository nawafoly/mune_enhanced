// Firebase Configuration and Initialization
// Replace with your actual Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDJtbThBhZ4bmIoxTr5SseoU3VoSC4ZuU",
    authDomain: "index-599e8.firebaseapp.com",
    projectId: "index-599e8",
    storageBucket: "index-599e8.firebasestorage.app",
    messagingSenderId: "57008792504",
    appId: "1:57008792504:web:16c083ad855e787143254d",
    measurementId: "G-CQNV5H3RKG"
};

// Initialize Firebase using CDN approach for better compatibility
function initializeFirebaseApp() {
    try {
        // Check if Firebase is available
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK not loaded');
            return null;
        }

        // Initialize Firebase
        const app = firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();
        
        // Enable offline persistence
        db.enablePersistence({ synchronizeTabs: true })
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
                } else if (err.code == 'unimplemented') {
                    console.warn('The current browser does not support all of the features required to enable persistence');
                }
            });

        // Export Firebase modules for use in main.js
        window.db = db;
        window.firebaseModules = {
            collection: (db, path) => db.collection(path),
            doc: (db, path, id) => db.collection(path).doc(id),
            addDoc: (collection, data) => collection.add(data),
            getDoc: (docRef) => docRef.get(),
            getDocs: (collection) => collection.get(),
            updateDoc: (docRef, data) => docRef.update(data),
            deleteDoc: (docRef) => docRef.delete(),
            setDoc: (docRef, data, options) => docRef.set(data, options || {})
        };

        console.log('Firebase initialized successfully with Firestore');
        
        // Dispatch custom event to notify that Firebase is ready
        window.dispatchEvent(new CustomEvent('firebaseReady'));
        
        return { app, db };
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        
        // Fallback: Set up mock Firebase for offline use
        window.db = null;
        window.firebaseModules = null;
        
        return null;
    }
}

// Wait for Firebase SDK to load, then initialize
document.addEventListener('DOMContentLoaded', () => {
    // Try to initialize immediately if Firebase is already loaded
    if (typeof firebase !== 'undefined') {
        initializeFirebaseApp();
    } else {
        // Wait a bit for Firebase SDK to load
        setTimeout(() => {
            if (typeof firebase !== 'undefined') {
                initializeFirebaseApp();
            } else {
                console.warn('Firebase SDK not loaded after timeout, falling back to localStorage only');
                window.db = null;
                window.firebaseModules = null;
                
                // Dispatch event anyway so the app can continue with localStorage
                window.dispatchEvent(new CustomEvent('firebaseReady'));
            }
        }, 2000);
    }
});

// Also try on window load as backup
window.addEventListener('load', () => {
    if (!window.db && typeof firebase !== 'undefined') {
        initializeFirebaseApp();
    }
});

