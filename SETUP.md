# 🔧 دليل الإعداد المفصل - تطبيق إدارة المال الشخصي

## 📋 المتطلبات الأساسية

### 1. متطلبات النظام
- متصفح ويب حديث (Chrome, Firefox, Safari, Edge)
- اتصال بالإنترنت (للإعداد الأولي ومزامنة البيانات)
- حساب Google (لإنشاء مشروع Firebase)

### 2. الأدوات المطلوبة (اختيارية)
- خادم ويب محلي (Python, Node.js, PHP, أو أي خادم آخر)
- محرر نصوص (VS Code, Sublime Text, إلخ)

## 🔥 إعداد Firebase

### الخطوة 1: إنشاء مشروع Firebase

1. **انتقل إلى Firebase Console**
   - اذهب إلى [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - سجل الدخول بحساب Google الخاص بك

2. **إنشاء مشروع جديد**
   - انقر على "Create a project" أو "إنشاء مشروع"
   - أدخل اسم المشروع (مثل: "personal-finance-app")
   - اختر إعدادات Google Analytics (اختياري)
   - انقر على "Create project"

### الخطوة 2: إعداد Firestore Database

1. **تفعيل Firestore**
   - في لوحة تحكم Firebase، انقر على "Firestore Database"
   - انقر على "Create database"
   - اختر "Start in test mode" للبداية
   - اختر موقع قاعدة البيانات (الأقرب لك جغرافياً)

2. **إعداد قواعد الأمان**
   - انتقل إلى تبويب "Rules"
   - استبدل القواعد الافتراضية بالتالي:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // السماح بالقراءة والكتابة لجميع المستندات (للتطوير فقط)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **تحذير**: هذه القواعد مناسبة للتطوير فقط. للإنتاج، يجب تطبيق قواعد أمان أكثر صرامة.

### الخطوة 3: الحصول على تكوين Firebase

1. **إضافة تطبيق ويب**
   - في إعدادات المشروع، انقر على أيقونة الويب `</>`
   - أدخل اسم التطبيق
   - لا تحتاج لتفعيل Firebase Hosting الآن
   - انقر على "Register app"

2. **نسخ التكوين**
   - ستظهر لك شاشة تحتوي على `firebaseConfig`
   - انسخ هذا التكوين، ستحتاجه لاحقاً

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDJtbThBhZ4bmIoxTr5SseoU3VoSC4ZuU",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

## 📁 إعداد ملفات المشروع

### الخطوة 1: تحديث تكوين Firebase

1. **افتح ملف `firebase.js`**
2. **استبدل `firebaseConfig`** بالتكوين الذي نسخته من Firebase Console:

```javascript
// استبدل هذا القسم بتكوينك الخاص
const firebaseConfig = {
    apiKey: "your-actual-api-key",
    authDomain: "your-actual-project.firebaseapp.com",
    projectId: "your-actual-project-id",
    storageBucket: "your-actual-project.firebasestorage.app",
    messagingSenderId: "your-actual-sender-id",
    appId: "your-actual-app-id"
};
```

### الخطوة 2: التحقق من الملفات

تأكد من وجود الملفات التالية في نفس المجلد:
- `index.html` - الصفحة الرئيسية
- `style.css` - ملف التصميم
- `main.js` - منطق التطبيق
- `firebase.js` - تكوين Firebase

## 🚀 تشغيل التطبيق

### الطريقة 1: خادم محلي (مُوصى بها)

#### باستخدام Python:
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

#### باستخدام Node.js:
```bash
# تثبيت serve عالمياً
npm install -g serve

# تشغيل الخادم
serve .
```

#### باستخدام PHP:
```bash
php -S localhost:8000
```

### الطريقة 2: فتح مباشر في المتصفح

⚠️ **تحذير**: قد لا تعمل بعض ميزات Firebase بشكل صحيح

1. انقر بزر الماوس الأيمن على `index.html`
2. اختر "Open with" > "متصفح الويب"

## 🔍 اختبار التطبيق

### 1. التحقق من تحميل Firebase

1. افتح التطبيق في المتصفح
2. اضغط F12 لفتح أدوات المطور
3. انتقل إلى تبويب "Console"
4. ابحث عن رسالة "Firebase initialized successfully"

### 2. اختبار الوظائف الأساسية

1. **إدخال الراتب والادخار**
   - أدخل راتب شهري (مثل: 5000)
   - أدخل هدف ادخار (مثل: 750)
   - انقر على "حفظ"

2. **إضافة مصروف تجريبي**
   - انقر على زر "+" في الأسفل
   - أدخل تفاصيل المصروف
   - انقر على "حفظ"

3. **التحقق من التحديث**
   - يجب أن تتحدث الأرقام في لوحة المعلومات
   - يجب أن تظهر رسالة نجاح

## 🐛 حل المشاكل الشائعة

### مشكلة: "Firebase SDK not loaded"

**الحل:**
1. تأكد من اتصال الإنترنت
2. تحقق من تحميل ملف `firebase.js`
3. تأكد من صحة تكوين Firebase

### مشكلة: "Permission denied"

**الحل:**
1. تحقق من قواعد Firestore
2. تأكد من أن القواعد تسمح بالقراءة والكتابة
3. راجع إعدادات المشروع في Firebase Console

### مشكلة: البيانات لا تُحفظ

**الحل:**
1. افتح أدوات المطور (F12)
2. تحقق من وجود أخطاء في Console
3. تأكد من صحة تكوين Firebase
4. تحقق من حالة الشبكة في تبويب Network

### مشكلة: التطبيق لا يعمل دون إنترنت

**الحل:**
1. تأكد من تفعيل Offline Persistence في Firebase
2. تحقق من حفظ البيانات في localStorage كنسخة احتياطية
3. أعد تحميل الصفحة بعد الاتصال بالإنترنت

## 📊 مراقبة الأداء

### 1. Firebase Console

- انتقل إلى Firebase Console
- اختر مشروعك
- انتقل إلى "Firestore Database"
- راقب عدد القراءات والكتابات

### 2. أدوات المطور

- استخدم تبويب "Network" لمراقبة طلبات الشبكة
- استخدم تبويب "Application" لفحص localStorage
- استخدم تبويب "Console" لمراقبة الأخطاء

## 🔒 تحسين الأمان (للإنتاج)

### 1. قواعد Firestore المتقدمة

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // السماح للمستخدمين المصادق عليهم فقط
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 2. إضافة المصادقة

```javascript
// في firebase.js
import { getAuth, signInAnonymously } from "firebase/auth";

const auth = getAuth();
signInAnonymously(auth)
  .then(() => {
    console.log("Signed in anonymously");
  })
  .catch((error) => {
    console.error("Authentication failed:", error);
  });
```

## 📱 النشر والاستضافة

### 1. Firebase Hosting

```bash
# تثبيت Firebase CLI
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# تهيئة المشروع
firebase init hosting

# النشر
firebase deploy
```

### 2. استضافة أخرى

يمكن رفع الملفات إلى أي خدمة استضافة:
- GitHub Pages
- Netlify
- Vercel
- Surge.sh

## 📞 الدعم والمساعدة

### الموارد المفيدة

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Getting Started](https://firebase.google.com/docs/firestore/quickstart)
- [Firebase Console](https://console.firebase.google.com/)

### نصائح إضافية

1. **احتفظ بنسخة احتياطية** من تكوين Firebase
2. **راقب الاستخدام** لتجنب تجاوز الحدود المجانية
3. **اختبر التطبيق** على أجهزة مختلفة
4. **حدث قواعد الأمان** قبل النشر للإنتاج

---

**تم إعداد هذا الدليل بواسطة**: Manus AI  
**آخر تحديث**: أغسطس 2025

