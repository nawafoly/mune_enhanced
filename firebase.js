// firebase.js (Compat)
(function () {
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded. تأكد من سكربتات compat في index.html');
    return;
  }

  // ⚙️ إعداداتك
  const firebaseConfig = {
    apiKey: "AIzaSyDJtbThBhZ4bmIoxTr5SseoU3VoSC4ZuU",
    authDomain: "index-599e8.firebaseapp.com",
    projectId: "index-599e8",
    storageBucket: "index-599e8.firebasestorage.app",
    messagingSenderId: "57008792504",
    appId: "1:57008792504:web:16c083ad855e787143254d",
    measurementId: "G-CQNV5H3RKG"
  };

  // 🛡️ منع التهيئة المزدوجة
  const app = firebase.apps && firebase.apps.length
    ? firebase.app()
    : firebase.initializeApp(firebaseConfig);

  const db = firebase.firestore();

  // 📴 تفعيل الأوفلاين (لا تقلق إن فشل في متصفحات لا تدعمه)
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn('Firestore persistence note:', err && err.code ? err.code : err);
  });

  // 🌍 إتاحة مختصرات للاستخدام في main.js
  window.db = db;
  window.firebaseModules = {
    collection: (path) => db.collection(path),
    doc: (path, id) => db.collection(path).doc(id),
    addDoc: (colRef, data) => colRef.add(data),
    getDoc: (docRef) => docRef.get(),
    getDocs: (colRef) => colRef.get(),
    updateDoc: (docRef, data) => docRef.update(data),
    deleteDoc: (docRef) => docRef.delete(),
    setDoc: (docRef, data, options) => docRef.set(data, options || {}),
    query: (...args) => { console.warn('Compat: استخدم where/orderBy مع collection().'); return args; },
    where: (...args) => { console.warn('Compat: استخدم collection(path).where(...).'); return args; },
    orderBy: (...args) => { console.warn('Compat: استخدم collection(path).orderBy(...).'); return args; },
    onSnapshot: (...args) => { console.warn('Compat: استخدم ref.onSnapshot(...).'); return args; }
  };

  console.log('Firebase initialized (Compat) ✅');
  // 📢 إعلام التطبيق أن Firebase جاهز
  window.dispatchEvent(new CustomEvent('firebaseReady'));
})();
