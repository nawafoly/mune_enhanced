/* ===== Firebase Integration Manager ===== */
class FirebaseDataManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.collections = {
            settings: 'settings',
            installments: 'installments',
            bills: 'bills',
            expenses: 'expenses',
            external: 'external',
            budgets: 'budgets',
            payments: 'payments'
        };
        
        // Wait for Firebase to be available
        this.waitForFirebase();
        
        // Setup offline/online listeners
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncPendingOperations();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    async waitForFirebase() {
        return new Promise((resolve) => {
            if (window.db && window.firebaseModules) {
                this.db = window.db;
                this.firebase = window.firebaseModules;
                console.log('Firebase initialized successfully');
                resolve();
            } else {
                window.addEventListener('firebaseReady', () => {
                    if (!window.db) {
                        console.warn('No Firestore; falling back to localStorage');
                        this.db = null;
                        this.firebase = null;
                    } else {
                        this.db = window.db;
                        this.firebase = window.firebaseModules;
                        console.log('Firebase initialized successfully');
                    }
                    resolve();
                });
            }
        });
    }

    // Generic CRUD operations with offline support
    async create(collectionName, data) {
        try {
            if (!this.isOnline) {
                this.pendingOperations.push({
                    type: 'create',
                    collection: collectionName,
                    data: data,
                    timestamp: Date.now()
                });
                // Store locally for immediate use
                const localData = { ...data, id: 'temp_' + Date.now(), isLocal: true };
                this.storeLocally(collectionName, localData);
                return localData;
            }

            const docRef = await this.firebase.addDoc(
                this.firebase.collection(this.db, collectionName), 
                {
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            );
            
            const result = { id: docRef.id, ...data };
            this.storeLocally(collectionName, result);
            return result;
        } catch (error) {
            console.error(`Error creating document in ${collectionName}:`, error);
            // Fallback to local storage
            const localData = { ...data, id: 'temp_' + Date.now(), isLocal: true };
            this.storeLocally(collectionName, localData);
            return localData;
        }
    }

    async read(collectionName, docId = null) {
        try {
            if (!this.isOnline) {
                return this.readLocally(collectionName, docId);
            }

            if (docId) {
                const docRef = this.firebase.doc(this.db, collectionName, docId);
                const docSnap = await this.firebase.getDoc(docRef);
                if (docSnap.exists()) {
                    const result = { id: docSnap.id, ...docSnap.data() };
                    this.storeLocally(collectionName, result);
                    return result;
                } else {
                    return null;
                }
            } else {
                const querySnapshot = await this.firebase.getDocs(
                    this.firebase.collection(this.db, collectionName)
                );
                const documents = [];
                querySnapshot.forEach((doc) => {
                    const docData = { id: doc.id, ...doc.data() };
                    documents.push(docData);
                    this.storeLocally(collectionName, docData);
                });
                return documents;
            }
        } catch (error) {
            console.error(`Error reading from ${collectionName}:`, error);
            return this.readLocally(collectionName, docId);
        }
    }

    async update(collectionName, docId, data) {
        try {
            if (!this.isOnline) {
                this.pendingOperations.push({
                    type: 'update',
                    collection: collectionName,
                    id: docId,
                    data: data,
                    timestamp: Date.now()
                });
                // Update locally
                const localData = { id: docId, ...data };
                this.storeLocally(collectionName, localData);
                return localData;
            }

            const docRef = this.firebase.doc(this.db, collectionName, docId);
            await this.firebase.updateDoc(docRef, {
                ...data,
                updatedAt: new Date()
            });
            
            const result = { id: docId, ...data };
            this.storeLocally(collectionName, result);
            return result;
        } catch (error) {
            console.error(`Error updating document in ${collectionName}:`, error);
            const localData = { id: docId, ...data };
            this.storeLocally(collectionName, localData);
            return localData;
        }
    }

    async delete(collectionName, docId) {
        try {
            if (!this.isOnline) {
                this.pendingOperations.push({
                    type: 'delete',
                    collection: collectionName,
                    id: docId,
                    timestamp: Date.now()
                });
                this.deleteLocally(collectionName, docId);
                return true;
            }

            await this.firebase.deleteDoc(
                this.firebase.doc(this.db, collectionName, docId)
            );
            this.deleteLocally(collectionName, docId);
            return true;
        } catch (error) {
            console.error(`Error deleting document from ${collectionName}:`, error);
            this.deleteLocally(collectionName, docId);
            return true;
        }
    }

    // Local storage helpers
    storeLocally(collectionName, data) {
        const key = `firebase_${collectionName}`;
        let stored = JSON.parse(localStorage.getItem(key) || '[]');
        
        if (Array.isArray(stored)) {
            const index = stored.findIndex(item => item.id === data.id);
            if (index >= 0) {
                stored[index] = data;
            } else {
                stored.push(data);
            }
        } else {
            stored = data;
        }
        
        localStorage.setItem(key, JSON.stringify(stored));
    }

    readLocally(collectionName, docId = null) {
        const key = `firebase_${collectionName}`;
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        
        if (docId) {
            if (Array.isArray(stored)) {
                return stored.find(item => item.id === docId) || null;
            } else {
                return stored.id === docId ? stored : null;
            }
        } else {
            return Array.isArray(stored) ? stored : [stored];
        }
    }

    deleteLocally(collectionName, docId) {
        const key = `firebase_${collectionName}`;
        let stored = JSON.parse(localStorage.getItem(key) || '[]');
        
        if (Array.isArray(stored)) {
            stored = stored.filter(item => item.id !== docId);
            localStorage.setItem(key, JSON.stringify(stored));
        }
    }

    // Sync pending operations when back online
    async syncPendingOperations() {
        if (this.pendingOperations.length === 0) return;
        
        console.log(`Syncing ${this.pendingOperations.length} pending operations...`);
        
        for (const operation of this.pendingOperations) {
            try {
                switch (operation.type) {
                    case 'create':
                        await this.firebase.addDoc(
                            this.firebase.collection(this.db, operation.collection),
                            { ...operation.data, createdAt: new Date(), updatedAt: new Date() }
                        );
                        break;
                    case 'update':
                        await this.firebase.updateDoc(
                            this.firebase.doc(this.db, operation.collection, operation.id),
                            { ...operation.data, updatedAt: new Date() }
                        );
                        break;
                    case 'delete':
                        await this.firebase.deleteDoc(
                            this.firebase.doc(this.db, operation.collection, operation.id)
                        );
                        break;
                }
            } catch (error) {
                console.error('Error syncing operation:', error);
            }
        }
        
        this.pendingOperations = [];
        showToast('🔄 تم مزامنة البيانات بنجاح', 'success');
    }

    // Specific methods for the financial app
    async getSettings() {
        try {
            const settings = await this.read(this.collections.settings, 'user_settings');
            return settings || {
                salary: 0,
                saving: 0,
                cash: false,
                auto: false,
                roll: false,
                theme: 'dark'
            };
        } catch (error) {
            console.error('Error getting settings:', error);
            return getLS(K.settings, '{"salary":0,"saving":0,"cash":false,"auto":false,"roll":false,"theme":"dark"}');
        }
    }

    async saveSettings(settings) {
        try {
            const docRef = this.firebase.doc(this.db, this.collections.settings, 'user_settings');
            await this.firebase.setDoc(docRef, {
                ...settings,
                updatedAt: new Date()
            }, { merge: true });
            
            // Also save locally for immediate access
            setLS(K.salary, settings.salary || 0);
            setLS(K.saving, settings.saving || 0);
            setLS(K.settings, {
                cash: settings.cash || false,
                auto: settings.auto || false,
                roll: settings.roll || false,
                theme: settings.theme || 'dark'
            });
            
            return settings;
        } catch (error) {
            console.error('Error saving settings:', error);
            // Fallback to localStorage
            setLS(K.salary, settings.salary || 0);
            setLS(K.saving, settings.saving || 0);
            setLS(K.settings, {
                cash: settings.cash || false,
                auto: settings.auto || false,
                roll: settings.roll || false,
                theme: settings.theme || 'dark'
            });
            return settings;
        }
    }

    async getInstallments() {
        try {
            return await this.read(this.collections.installments) || [];
        } catch (error) {
            console.error('Error getting installments:', error);
            return getLS(K.inst, "[]");
        }
    }

    async addInstallment(installment) {
        try {
            const result = await this.create(this.collections.installments, installment);
            // Update local storage for backward compatibility
            const local = getLS(K.inst, "[]");
            local.push(result);
            setLS(K.inst, local);
            return result;
        } catch (error) {
            console.error('Error adding installment:', error);
            throw error;
        }
    }

    async updateInstallment(id, installment) {
        try {
            const result = await this.update(this.collections.installments, id, installment);
            // Update local storage
            const local = getLS(K.inst, "[]");
            const index = local.findIndex(item => item.id === id);
            if (index >= 0) {
                local[index] = result;
                setLS(K.inst, local);
            }
            return result;
        } catch (error) {
            console.error('Error updating installment:', error);
            throw error;
        }
    }

    async deleteInstallment(id) {
        try {
            await this.delete(this.collections.installments, id);
            // Update local storage
            const local = getLS(K.inst, "[]");
            const filtered = local.filter(item => item.id !== id);
            setLS(K.inst, filtered);
            return true;
        } catch (error) {
            console.error('Error deleting installment:', error);
            throw error;
        }
    }

    // Similar methods for bills, expenses, etc.
    async getBills() {
        try {
            return await this.read(this.collections.bills) || [];
        } catch (error) {
            return getLS(K.bills, "[]");
        }
    }

    async addBill(bill) {
        try {
            const result = await this.create(this.collections.bills, bill);
            const local = getLS(K.bills, "[]");
            local.push(result);
            setLS(K.bills, local);
            return result;
        } catch (error) {
            throw error;
        }
    }

    async updateBill(id, bill) {
        try {
            const result = await this.update(this.collections.bills, id, bill);
            const local = getLS(K.bills, "[]");
            const index = local.findIndex(item => item.id === id);
            if (index >= 0) {
                local[index] = result;
                setLS(K.bills, local);
            }
            return result;
        } catch (error) {
            throw error;
        }
    }

    async deleteBill(id) {
        try {
            await this.delete(this.collections.bills, id);
            const local = getLS(K.bills, "[]");
            const filtered = local.filter(item => item.id !== id);
            setLS(K.bills, filtered);
            return true;
        } catch (error) {
            throw error;
        }
    }

    async getExpenses(month = null) {
        try {
            let expenses = await this.read(this.collections.expenses) || [];
            if (month) {
                expenses = expenses.filter(exp => exp.date && exp.date.startsWith(month));
            }
            return expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            return getLS(K.exps, "[]");
        }
    }

    async addExpense(expense) {
        try {
            const expenseWithMonth = {
                ...expense,
                month: expense.date.slice(0, 7)
            };
            const result = await this.create(this.collections.expenses, expenseWithMonth);
            const local = getLS(K.exps, "[]");
            local.push(result);
            setLS(K.exps, local);
            return result;
        } catch (error) {
            throw error;
        }
    }

    async updateExpense(id, expense) {
        try {
            const expenseWithMonth = {
                ...expense,
                month: expense.date.slice(0, 7)
            };
            const result = await this.update(this.collections.expenses, id, expenseWithMonth);
            const local = getLS(K.exps, "[]");
            const index = local.findIndex(item => item.id === id);
            if (index >= 0) {
                local[index] = result;
                setLS(K.exps, local);
            }
            return result;
        } catch (error) {
            throw error;
        }
    }

    async deleteExpense(id) {
        try {
            await this.delete(this.collections.expenses, id);
            const local = getLS(K.exps, "[]");
            const filtered = local.filter(item => item.id !== id);
            setLS(K.exps, filtered);
            return true;
        } catch (error) {
            throw error;
        }
    }

    async getExternalExpenses(month = null) {
        try {
            let expenses = await this.read(this.collections.external) || [];
            if (month) {
                expenses = expenses.filter(exp => exp.date && exp.date.startsWith(month));
            }
            return expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            return getLS(K.one, "[]");
        }
    }

    async addExternalExpense(expense) {
        try {
            const expenseWithMonth = {
                ...expense,
                month: expense.date.slice(0, 7)
            };
            const result = await this.create(this.collections.external, expenseWithMonth);
            const local = getLS(K.one, "[]");
            local.push(result);
            setLS(K.one, local);
            return result;
        } catch (error) {
            throw error;
        }
    }

    async updateExternalExpense(id, expense) {
        try {
            const expenseWithMonth = {
                ...expense,
                month: expense.date.slice(0, 7)
            };
            const result = await this.update(this.collections.external, id, expenseWithMonth);
            const local = getLS(K.one, "[]");
            const index = local.findIndex(item => item.id === id);
            if (index >= 0) {
                local[index] = result;
                setLS(K.one, local);
            }
            return result;
        } catch (error) {
            throw error;
        }
    }

    async deleteExternalExpense(id) {
        try {
            await this.delete(this.collections.external, id);
            const local = getLS(K.one, "[]");
            const filtered = local.filter(item => item.id !== id);
            setLS(K.one, filtered);
            return true;
        } catch (error) {
            throw error;
        }
    }

    async getBudgets() {
        try {
            return await this.read(this.collections.budgets) || [];
        } catch (error) {
            return getLS(K.budgets, "[]");
        }
    }

    async addBudget(budget) {
        try {
            const result = await this.create(this.collections.budgets, budget);
            const local = getLS(K.budgets, "[]");
            local.push(result);
            setLS(K.budgets, local);
            return result;
        } catch (error) {
            throw error;
        }
    }

    async updateBudget(id, budget) {
        try {
            const result = await this.update(this.collections.budgets, id, budget);
            const local = getLS(K.budgets, "[]");
            const index = local.findIndex(item => item.id === id);
            if (index >= 0) {
                local[index] = result;
                setLS(K.budgets, local);
            }
            return result;
        } catch (error) {
            throw error;
        }
    }

    async deleteBudget(id) {
        try {
            await this.delete(this.collections.budgets, id);
            const local = getLS(K.budgets, "[]");
            const filtered = local.filter(item => item.id !== id);
            setLS(K.budgets, filtered);
            return true;
        } catch (error) {
            throw error;
        }
    }

    async setPaymentStatus(type, itemId, month, paid) {
        try {
            const paymentId = `${type}_${itemId}_${month}`;
            const docRef = this.firebase.doc(this.db, this.collections.payments, paymentId);
            await this.firebase.setDoc(docRef, {
                type,
                itemId,
                month,
                paid,
                updatedAt: new Date()
            }, { merge: true });
            
            // Update local storage
            setPaid(type, itemId, month, paid);
            return true;
        } catch (error) {
            console.error('Error setting payment status:', error);
            setPaid(type, itemId, month, paid);
            return true;
        }
    }

    async getPaymentStatus(type, itemId, month) {
        try {
            const paymentId = `${type}_${itemId}_${month}`;
            const payment = await this.read(this.collections.payments, paymentId);
            return payment ? payment.paid : isPaid(type, itemId, month);
        } catch (error) {
            return isPaid(type, itemId, month);
        }
    }
}

// Initialize Firebase Data Manager
const firebaseManager = new FirebaseDataManager();

/* ===== Enhanced Helpers & Storage ===== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const ym = (d) => new Date(d).toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

function fmt(n) {
    return (
        Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }) +
        " ر.س"
    );
}

function showToast(msg, type = '') {
    const t = document.getElementById("toast");
    if (!t) return;
    t.className = "toast " + type;
    t.innerHTML = '<div class="box">' + msg + "</div>";
    t.style.display = "block";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
        t.style.display = "none";
    }, 3000);
}

function getLS(k, f) {
    try {
        return JSON.parse(localStorage.getItem(k) || f);
    } catch {
        return JSON.parse(f);
    }
}

function setLS(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
}

const K = {
    salary: "pf_salary",
    saving: "pf_saving",
    inst: "pf_inst",
    bills: "pf_bills",
    exps: "pf_exps",
    one: "pf_one",
    paid: "pf_paid",
    settings: "pf_settings",
    budgets: "pf_budgets",
    roll: "pf_rollovers",
};

function withinMonthRange(start, end, yyyymm) {
    const s = ym(start);
    const e = end ? ym(end) : "9999-12";
    return yyyymm >= s && yyyymm <= e;
}

function prevMonthStr(yyyymm) {
    let [y, m] = yyyymm.split("-").map(Number);
    if (m === 1) {
        y--;
        m = 12;
    } else {
        m--;
    }
    return y + "-" + String(m).padStart(2, "0");
}

function dueThisMonth(item, yyyymm) {
    return withinMonthRange(item.start, item.end, yyyymm)
        ? Number(item.amount || 0)
        : 0;
}

function lastDayOfMonth(y, m) {
    return new Date(y, m, 0).getDate();
}

function daysUntilDue(item, yyyymm) {
    const y = +yyyymm.slice(0, 4);
    const m = +yyyymm.slice(5, 7);
    const last = lastDayOfMonth(y, m);
    const d = Math.min(item.dueDay || last, last);
    const due = new Date(y, m - 1, d);
    const one = 86400000;
    return Math.floor((due - new Date()) / one);
}

function isPaid(kind, id, yyyymm) {
    return !!getLS(K.paid, "{}")[`${kind}:${id}:${yyyymm}`];
}

function setPaid(kind, id, yyyymm, val) {
    const m = getLS(K.paid, "{}");
    m[`${kind}:${id}:${yyyymm}`] = !!val;
    setLS(K.paid, m);
}

function statusChip(paid, dueAmt, item, yyyymm) {
    if (!dueAmt) return '<span class="chip">—</span>';
    if (paid) return '<span class="chip green">✅ مدفوع</span>';
    const curYM = new Date().toISOString().slice(0, 7);
    if (yyyymm < curYM) return '<span class="chip red">⚠️ متأخر</span>';
    if (yyyymm > curYM) return '<span class="chip blue">⏳ مستقبلي</span>';
    const d = daysUntilDue(item, yyyymm);
    if (d < 0) return '<span class="chip red">⚠️ متأخر</span>';
    if (d <= 3) return '<span class="chip orange">⏰ قريب الاستحقاق</span>';
    return '<span class="chip blue">⏳ غير مدفوع</span>';
}

function priorityKey(kind, item, yyyymm) {
    const dueAmt = dueThisMonth(item, yyyymm);
    const paid = isPaid(kind, item.id, yyyymm);
    const d = daysUntilDue(item, yyyymm);
    let pri;
    if (dueAmt === 0) pri = 5;
    else if (paid) pri = 4;
    else if (d < 0) pri = 0;
    else if (d <= 3) pri = 1;
    else pri = 2;
    const y = +yyyymm.slice(0, 4),
        m = +yyyymm.slice(5, 7);
    const last = lastDayOfMonth(y, m);
    const day = Math.min(item.dueDay || last, last);
    return [pri, day, item.name || ""];
}

/* ===== Enhanced Defaults ===== */
$("#monthPicker").value = ym(new Date());
$("#expDate").value = today;
$("#qDate").value = today;
$("#oneDate").value = today;

/* ===== Enhanced Settings with Firebase Integration ===== */
$("#saveSettingsBtn").onclick = async () => {
    const salary = +$("#salaryInput").value || 0;
    const saving = +$("#savingTargetInput").value || 0;

    const settings = {
        salary,
        saving,
        cash: !!$("#cashMode").checked,
        auto: !!$("#autoDeduct").checked,
        roll: !!$("#rollover").checked,
    };

    try {
        await firebaseManager.saveSettings(settings);
        showToast("✅ تم حفظ الإعدادات بنجاح!", "success");
        refreshAll();
    } catch (error) {
        showToast("❌ خطأ في حفظ الإعدادات", "danger");
        console.error(error);
    }
};

$("#applySuggestedBtn").onclick = async () => {
    const salary = +getLS(K.salary, "0") || 0;
    const suggested = Math.round(salary * 0.15);
    
    try {
        const currentSettings = await firebaseManager.getSettings();
        await firebaseManager.saveSettings({
            ...currentSettings,
            saving: suggested
        });
        
        $("#savingTargetInput").value = suggested;
        showToast(`💡 تم تطبيق الادخار المقترح: ${fmt(suggested)}`, "success");
        refreshAll();
    } catch (error) {
        setLS(K.saving, suggested);
        $("#savingTargetInput").value = suggested;
        showToast(`💡 تم تطبيق الادخار المقترح: ${fmt(suggested)}`, "success");
        refreshAll();
    }
};

$("#monthPicker").onchange = refreshAll;

/* ===== Enhanced Forms with Firebase Integration ===== */
// الأقساط
$("#instForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#instName").value.trim();
    const amount = +$("#instAmount").value;
    const start = $("#instStart").value;
    const end = $("#instEnd").value || null;
    const dueDay = +$("#instDueDay").value || null;

    if (!name || !amount || !start) {
        showToast("⚠️ يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
    }

    try {
        await firebaseManager.addInstallment({
            name,
            amount,
            start,
            end,
            dueDay,
        });
        
        e.target.reset();
        showToast("✅ تم إضافة القسط بنجاح!", "success");
        refreshInst();
        refreshSummary();
        refreshCharts();
    } catch (error) {
        showToast("❌ خطأ في إضافة القسط", "danger");
        console.error(error);
    }
};

// الفواتير
$("#billForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#billName").value.trim();
    const amount = +$("#billAmount").value;
    const start = $("#billStart").value;
    const end = $("#billEnd").value || null;
    const dueDay = +$("#billDueDay").value || null;

    if (!name || !amount || !start) {
        showToast("⚠️ يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
    }

    try {
        await firebaseManager.addBill({
            name,
            amount,
            start,
            end,
            dueDay,
        });
        
        e.target.reset();
        showToast("✅ تم إضافة الفاتورة بنجاح!", "success");
        refreshBills();
        refreshSummary();
        refreshCharts();
    } catch (error) {
        showToast("❌ خطأ في إضافة الفاتورة", "danger");
        console.error(error);
    }
};

// المصاريف
$("#expForm").onsubmit = async (e) => {
    e.preventDefault();
    const date = $("#expDate").value;
    const cat = $("#expCat").value.trim();
    const note = $("#expNote").value.trim();
    const pay = $("#expPay").value;
    const amount = +$("#expAmount").value;

    if (!date || !cat || !amount) {
        showToast("⚠️ يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
    }

    try {
        await firebaseManager.addExpense({
            date,
            cat,
            note,
            pay,
            amount
        });
        
        e.target.reset();
        $("#expDate").value = today;
        showToast("✅ تم إضافة المصروف بنجاح!", "success");
        refreshExp();
        refreshBudgets();
        refreshSummary();
        refreshCharts();
        checkBudgetWarn(cat);
    } catch (error) {
        showToast("❌ خطأ في إضافة المصروف", "danger");
        console.error(error);
    }
};

// المصاريف الخارجية
$("#oneForm").onsubmit = async (e) => {
    e.preventDefault();
    const date = $("#oneDate").value;
    const cat = $("#oneCat").value.trim();
    const note = $("#oneNote").value.trim();
    const amount = +$("#oneAmount").value;
    const paid = $("#onePaid").checked;

    if (!date || !cat || !amount) {
        showToast("⚠️ يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
    }

    try {
        await firebaseManager.addExternalExpense({
            date,
            cat,
            note,
            amount,
            paid
        });
        
        e.target.reset();
        $("#oneDate").value = today;
        showToast("✅ تم إضافة المصروف الخارجي بنجاح!", "success");
        refreshOne();
        refreshSummary();
        refreshCharts();
    } catch (error) {
        showToast("❌ خطأ في إضافة المصروف الخارجي", "danger");
        console.error(error);
    }
};

// الميزانيات
$("#budForm").onsubmit = async (e) => {
    e.preventDefault();
    const cat = $("#budCat").value.trim();
    const limit = +$("#budLimit").value || 0;

    if (!cat || !limit) {
        showToast("⚠️ يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
    }

    try {
        const budgets = await firebaseManager.getBudgets();
        const existing = budgets.find(b => b.cat.toLowerCase() === cat.toLowerCase());
        
        if (existing) {
            await firebaseManager.updateBudget(existing.id, { cat, limit });
            showToast("✅ تم تحديث الميزانية بنجاح!", "success");
        } else {
            await firebaseManager.addBudget({ cat, limit });
            showToast("✅ تم إضافة الميزانية بنجاح!", "success");
        }
        
        e.target.reset();
        refreshBudgets();
    } catch (error) {
        showToast("❌ خطأ في حفظ الميزانية", "danger");
        console.error(error);
    }
};

/* ===== Enhanced Search & Export ===== */
$("#searchInput").oninput = refreshExp;

$("#exportCSV").onclick = (e) => {
    e.preventDefault();
    exportCSV(
        $("#monthPicker").value,
        $("#searchInput").value
    );
};

$("#exportJSON").onclick = (e) => {
    e.preventDefault();
    exportJSON();
};

/* ===== Enhanced Rendering Functions with Firebase Integration ===== */
async function refreshAll() {
    try {
        // Load settings from Firebase
        const settings = await firebaseManager.getSettings();
        
        if (settings.salary) $("#salaryInput").value = settings.salary;
        if (settings.saving) $("#savingTargetInput").value = settings.saving;
        
        $("#cashMode").checked = !!settings.cash;
        $("#autoDeduct").checked = !!settings.auto;
        const ro = $("#rollover");
        if (ro) ro.checked = !!settings.roll;

        const curM = $("#monthPicker").value;
        if (settings.auto) autoDeductIfDue(curM);
        if (settings.roll) rolloverArrears(curM);

        await refreshInst();
        await refreshBills();
        await refreshExp();
        await refreshOne();
        await refreshBudgets();
        refreshSummary();
        refreshCharts();
        updateAlerts();
    } catch (error) {
        console.error('Error refreshing data:', error);
        // Fallback to localStorage
        const s = getLS(K.salary, "0");
        if (s) $("#salaryInput").value = s;
        const sv = getLS(K.saving, "0");
        if (sv) $("#savingTargetInput").value = sv;

        const st = getLS(K.settings, '{"cash":false,"auto":false,"roll":false}');
        $("#cashMode").checked = !!st.cash;
        $("#autoDeduct").checked = !!st.auto;
        const ro = $("#rollover");
        if (ro) ro.checked = !!st.roll;

        refreshInstLocal();
        refreshBillsLocal();
        refreshExpLocal();
        refreshOneLocal();
        refreshBudgetsLocal();
        refreshSummary();
        refreshCharts();
        updateAlerts();
    }
}

async function refreshInst() {
    try {
        const curM = $("#monthPicker").value;
        const L = await firebaseManager.getInstallments();
        const tbody = $("#instTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (L.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center muted">لا توجد أقساط مضافة</td></tr>';
            return;
        }

        L.sort((a, b) => {
            const [priA, dayA, nameA] = priorityKey("inst", a, curM);
            const [priB, dayB, nameB] = priorityKey("inst", b, curM);
            return priA - priB || dayA - dayB || nameA.localeCompare(nameB);
        });

        L.forEach((item) => {
            const dueAmt = dueThisMonth(item, curM);
            const paid = isPaid("inst", item.id, curM);
            const status = statusChip(paid, dueAmt, item, curM);

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="الاسم">${item.name}</td>
                <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
                <td data-label="استحقاق هذا الشهر" class="fit">${fmt(dueAmt)}</td>
                <td data-label="يوم الاستحقاق" class="fit">${item.dueDay || 'آخر يوم'}</td>
                <td data-label="المدى" class="fit">${item.start}${item.end ? ' → ' + item.end : ''}</td>
                <td data-label="الحالة" class="fit">${status}</td>
                <td data-label="الإجراءات" class="fit">
                    <div class="flex gap-2">
                        ${dueAmt > 0 ? `
                            <button class="btn ${paid ? 'ghost' : 'success'}" 
                                    onclick="togglePaid('inst', '${item.id}', '${curM}')">
                                ${paid ? '↩️' : '✅'}
                            </button>
                        ` : ''}
                        <button class="btn danger" onclick="deleteItem('inst', '${item.id}')">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error refreshing installments:', error);
        refreshInstLocal();
    }
}

// Fallback function for local storage
function refreshInstLocal() {
    const curM = $("#monthPicker").value;
    const L = getLS(K.inst, "[]");
    const tbody = $("#instTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (L.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center muted">لا توجد أقساط مضافة</td></tr>';
        return;
    }

    L.sort((a, b) => {
        const [priA, dayA, nameA] = priorityKey("inst", a, curM);
        const [priB, dayB, nameB] = priorityKey("inst", b, curM);
        return priA - priB || dayA - dayB || nameA.localeCompare(nameB);
    });

    L.forEach((item) => {
        const dueAmt = dueThisMonth(item, curM);
        const paid = isPaid("inst", item.id, curM);
        const status = statusChip(paid, dueAmt, item, curM);

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="الاسم">${item.name}</td>
            <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
            <td data-label="استحقاق هذا الشهر" class="fit">${fmt(dueAmt)}</td>
            <td data-label="يوم الاستحقاق" class="fit">${item.dueDay || 'آخر يوم'}</td>
            <td data-label="المدى" class="fit">${item.start}${item.end ? ' → ' + item.end : ''}</td>
            <td data-label="الحالة" class="fit">${status}</td>
            <td data-label="الإجراءات" class="fit">
                <div class="flex gap-2">
                    ${dueAmt > 0 ? `
                        <button class="btn ${paid ? 'ghost' : 'success'}" 
                                onclick="togglePaid('inst', '${item.id}', '${curM}')">
                            ${paid ? '↩️' : '✅'}
                        </button>
                    ` : ''}
                    <button class="btn danger" onclick="deleteItem('inst', '${item.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Similar functions for bills, expenses, etc. (abbreviated for space)
async function refreshBills() {
    try {
        const curM = $("#monthPicker").value;
        const L = await firebaseManager.getBills();
        const tbody = $("#billTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (L.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center muted">لا توجد فواتير مضافة</td></tr>';
            return;
        }

        L.sort((a, b) => {
            const [priA, dayA, nameA] = priorityKey("bills", a, curM);
            const [priB, dayB, nameB] = priorityKey("bills", b, curM);
            return priA - priB || dayA - dayB || nameA.localeCompare(nameB);
        });

        L.forEach((item) => {
            const dueAmt = dueThisMonth(item, curM);
            const paid = isPaid("bills", item.id, curM);
            const status = statusChip(paid, dueAmt, item, curM);

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="الاسم">${item.name}</td>
                <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
                <td data-label="استحقاق هذا الشهر" class="fit">${fmt(dueAmt)}</td>
                <td data-label="يوم الاستحقاق" class="fit">${item.dueDay || 'آخر يوم'}</td>
                <td data-label="المدى" class="fit">${item.start}${item.end ? ' → ' + item.end : ''}</td>
                <td data-label="الحالة" class="fit">${status}</td>
                <td data-label="الإجراءات" class="fit">
                    <div class="flex gap-2">
                        ${dueAmt > 0 ? `
                            <button class="btn ${paid ? 'ghost' : 'success'}" 
                                    onclick="togglePaid('bills', '${item.id}', '${curM}')">
                                ${paid ? '↩️' : '✅'}
                            </button>
                        ` : ''}
                        <button class="btn danger" onclick="deleteItem('bills', '${item.id}')">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error refreshing bills:', error);
        refreshBillsLocal();
    }
}

function refreshBillsLocal() {
    const curM = $("#monthPicker").value;
    const L = getLS(K.bills, "[]");
    const tbody = $("#billTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (L.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center muted">لا توجد فواتير مضافة</td></tr>';
        return;
    }

    L.sort((a, b) => {
        const [priA, dayA, nameA] = priorityKey("bills", a, curM);
        const [priB, dayB, nameB] = priorityKey("bills", b, curM);
        return priA - priB || dayA - dayB || nameA.localeCompare(nameB);
    });

    L.forEach((item) => {
        const dueAmt = dueThisMonth(item, curM);
        const paid = isPaid("bills", item.id, curM);
        const status = statusChip(paid, dueAmt, item, curM);

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="الاسم">${item.name}</td>
            <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
            <td data-label="استحقاق هذا الشهر" class="fit">${fmt(dueAmt)}</td>
            <td data-label="يوم الاستحقاق" class="fit">${item.dueDay || 'آخر يوم'}</td>
            <td data-label="المدى" class="fit">${item.start}${item.end ? ' → ' + item.end : ''}</td>
            <td data-label="الحالة" class="fit">${status}</td>
            <td data-label="الإجراءات" class="fit">
                <div class="flex gap-2">
                    ${dueAmt > 0 ? `
                        <button class="btn ${paid ? 'ghost' : 'success'}" 
                                onclick="togglePaid('bills', '${item.id}', '${curM}')">
                            ${paid ? '↩️' : '✅'}
                        </button>
                    ` : ''}
                    <button class="btn danger" onclick="deleteItem('bills', '${item.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function refreshExp() {
    try {
        const curM = $("#monthPicker").value;
        const search = $("#searchInput").value.toLowerCase();
        const L = await firebaseManager.getExpenses(curM);
        
        const filtered = L.filter(x => {
            const inMonth = ym(x.date) === curM;
            const matchSearch = !search ||
                x.cat.toLowerCase().includes(search) ||
                (x.note && x.note.toLowerCase().includes(search));
            return inMonth && matchSearch;
        });

        const tbody = $("#expTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">لا توجد مصاريف في هذا الشهر</td></tr>';
            return;
        }

        filtered.forEach((item) => {
            const paymentMethod = {
                'cash': '💵 نقدًا',
                'card': '💳 بطاقة',
                'transfer': '🏦 تحويل',
                'wallet': '📱 محفظة رقمية'
            }[item.pay] || item.pay;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="التاريخ" class="fit">${item.date}</td>
                <td data-label="التصنيف">${item.cat}</td>
                <td data-label="الملاحظة">${item.note || '—'}</td>
                <td data-label="طريقة الدفع" class="fit">${paymentMethod}</td>
                <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
                <td data-label="الإجراءات" class="fit">
                    <button class="btn danger" onclick="deleteItem('exps', '${item.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error refreshing expenses:', error);
        refreshExpLocal();
    }
}

function refreshExpLocal() {
    const curM = $("#monthPicker").value;
    const search = $("#searchInput").value.toLowerCase();
    const L = getLS(K.exps, "[]");
    
    const filtered = L.filter(x => {
        const inMonth = ym(x.date) === curM;
        const matchSearch = !search ||
            x.cat.toLowerCase().includes(search) ||
            (x.note && x.note.toLowerCase().includes(search));
        return inMonth && matchSearch;
    });

    const tbody = $("#expTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">لا توجد مصاريف في هذا الشهر</td></tr>';
        return;
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach((item) => {
        const paymentMethod = {
            'cash': '💵 نقدًا',
            'card': '💳 بطاقة',
            'transfer': '🏦 تحويل',
            'wallet': '📱 محفظة رقمية'
        }[item.pay] || item.pay;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="التاريخ" class="fit">${item.date}</td>
            <td data-label="التصنيف">${item.cat}</td>
            <td data-label="الملاحظة">${item.note || '—'}</td>
            <td data-label="طريقة الدفع" class="fit">${paymentMethod}</td>
            <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
            <td data-label="الإجراءات" class="fit">
                <button class="btn danger" onclick="deleteItem('exps', '${item.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function refreshOne() {
    try {
        const curM = $("#monthPicker").value;
        const L = await firebaseManager.getExternalExpenses(curM);
        
        const filtered = L.filter(x => ym(x.date) === curM);

        const tbody = $("#oneTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">لا توجد مصاريف خارجية في هذا الشهر</td></tr>';
            return;
        }

        filtered.forEach((item) => {
            const status = item.paid ? 
                '<span class="chip green">✅ مدفوعة</span>' : 
                '<span class="chip red">❌ غير مدفوعة</span>';

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="التاريخ" class="fit">${item.date}</td>
                <td data-label="النوع">${item.cat}</td>
                <td data-label="الملاحظة">${item.note || '—'}</td>
                <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
                <td data-label="الحالة" class="fit">${status}</td>
                <td data-label="الإجراءات" class="fit">
                    <div class="flex gap-2">
                        <button class="btn ${item.paid ? 'ghost' : 'success'}" 
                                onclick="toggleExternalPaid('${item.id}')">
                            ${item.paid ? '↩️' : '✅'}
                        </button>
                        <button class="btn danger" onclick="deleteItem('one', '${item.id}')">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error refreshing external expenses:', error);
        refreshOneLocal();
    }
}

function refreshOneLocal() {
    const curM = $("#monthPicker").value;
    const L = getLS(K.one, "[]");
    
    const filtered = L.filter(x => ym(x.date) === curM);

    const tbody = $("#oneTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">لا توجد مصاريف خارجية في هذا الشهر</td></tr>';
        return;
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach((item) => {
        const status = item.paid ? 
            '<span class="chip green">✅ مدفوعة</span>' : 
            '<span class="chip red">❌ غير مدفوعة</span>';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="التاريخ" class="fit">${item.date}</td>
            <td data-label="النوع">${item.cat}</td>
            <td data-label="الملاحظة">${item.note || '—'}</td>
            <td data-label="المبلغ" class="fit">${fmt(item.amount)}</td>
            <td data-label="الحالة" class="fit">${status}</td>
            <td data-label="الإجراءات" class="fit">
                <div class="flex gap-2">
                    <button class="btn ${item.paid ? 'ghost' : 'success'}" 
                            onclick="toggleExternalPaid('${item.id}')">
                        ${item.paid ? '↩️' : '✅'}
                    </button>
                    <button class="btn danger" onclick="deleteItem('one', '${item.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function refreshBudgets() {
    try {
        const curM = $("#monthPicker").value;
        const budgets = await firebaseManager.getBudgets();
        const expenses = await firebaseManager.getExpenses(curM);
        
        const tbody = $("#budTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (budgets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">لا توجد ميزانيات محددة</td></tr>';
            return;
        }

        budgets.forEach((budget) => {
            const spent = expenses
                .filter(x => ym(x.date) === curM && x.cat.toLowerCase() === budget.cat.toLowerCase())
                .reduce((sum, x) => sum + x.amount, 0);

            const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
            const remaining = budget.limit - spent;

            let status, statusClass;
            if (percentage >= 100) {
                status = '🔴 تجاوز الحد';
                statusClass = 'red';
            } else if (percentage >= 80) {
                status = '🟡 تحذير';
                statusClass = 'orange';
            } else {
                status = '🟢 ضمن الحد';
                statusClass = 'green';
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="التصنيف">${budget.cat}</td>
                <td data-label="الحد المحدد" class="fit">${fmt(budget.limit)}</td>
                <td data-label="المصروف الحالي" class="fit">${fmt(spent)}</td>
                <td data-label="النسبة المستهلكة" class="fit">${percentage.toFixed(1)}%</td>
                <td data-label="الحالة" class="fit"><span class="chip ${statusClass}">${status}</span></td>
                <td data-label="الإجراءات" class="fit">
                    <button class="btn danger" onclick="deleteItem('budgets', '${budget.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error refreshing budgets:', error);
        refreshBudgetsLocal();
    }
}

function refreshBudgetsLocal() {
    const curM = $("#monthPicker").value;
    const budgets = getLS(K.budgets, "[]");
    const expenses = getLS(K.exps, "[]");
    
    const tbody = $("#budTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (budgets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">لا توجد ميزانيات محددة</td></tr>';
        return;
    }

    budgets.forEach((budget) => {
        const spent = expenses
            .filter(x => ym(x.date) === curM && x.cat.toLowerCase() === budget.cat.toLowerCase())
            .reduce((sum, x) => sum + x.amount, 0);

        const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
        const remaining = budget.limit - spent;

        let status, statusClass;
        if (percentage >= 100) {
            status = '🔴 تجاوز الحد';
            statusClass = 'red';
        } else if (percentage >= 80) {
            status = '🟡 تحذير';
            statusClass = 'orange';
        } else {
            status = '🟢 ضمن الحد';
            statusClass = 'green';
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="التصنيف">${budget.cat}</td>
            <td data-label="الحد المحدد" class="fit">${fmt(budget.limit)}</td>
            <td data-label="المصروف الحالي" class="fit">${fmt(spent)}</td>
            <td data-label="النسبة المستهلكة" class="fit">${percentage.toFixed(1)}%</td>
            <td data-label="الحالة" class="fit"><span class="chip ${statusClass}">${status}</span></td>
            <td data-label="الإجراءات" class="fit">
                <button class="btn danger" onclick="deleteItem('budgets', '${budget.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/* ===== Enhanced Action Functions with Firebase Integration ===== */
async function togglePaid(kind, id, yyyymm) {
    const current = isPaid(kind, id, yyyymm);
    const newStatus = !current;
    
    try {
        await firebaseManager.setPaymentStatus(kind, id, yyyymm, newStatus);
        setPaid(kind, id, yyyymm, newStatus);
        
        if (kind === "inst") {
            refreshInst();
        } else if (kind === "bills") {
            refreshBills();
        }
        
        refreshSummary();
        refreshCharts();
        updateAlerts();
        
        showToast(newStatus ? "✅ تم تعليم كمدفوع" : "↩️ تم إلغاء التعليم", "success");
    } catch (error) {
        console.error('Error toggling payment status:', error);
        setPaid(kind, id, yyyymm, newStatus);
        
        if (kind === "inst") {
            refreshInst();
        } else if (kind === "bills") {
            refreshBills();
        }
        
        refreshSummary();
        refreshCharts();
        updateAlerts();
        
        showToast(newStatus ? "✅ تم تعليم كمدفوع" : "↩️ تم إلغاء التعليم", "success");
    }
}

async function toggleExternalPaid(id) {
    try {
        const externals = await firebaseManager.getExternalExpenses();
        const item = externals.find(x => x.id === id);
        
        if (item) {
            const newStatus = !item.paid;
            await firebaseManager.updateExternalExpense(id, { ...item, paid: newStatus });
            
            // Update local storage
            const local = getLS(K.one, "[]");
            const index = local.findIndex(x => x.id === id);
            if (index >= 0) {
                local[index].paid = newStatus;
                setLS(K.one, local);
            }
            
            refreshOne();
            refreshSummary();
            refreshCharts();
            
            showToast(newStatus ? "✅ تم تعليم كمدفوعة" : "↩️ تم إلغاء التعليم", "success");
        }
    } catch (error) {
        console.error('Error toggling external payment:', error);
        // Fallback to local storage
        const local = getLS(K.one, "[]");
        const index = local.findIndex(x => x.id === id);
        if (index >= 0) {
            local[index].paid = !local[index].paid;
            setLS(K.one, local);
            refreshOne();
            refreshSummary();
            refreshCharts();
            showToast(local[index].paid ? "✅ تم تعليم كمدفوعة" : "↩️ تم إلغاء التعليم", "success");
        }
    }
}

async function deleteItem(kind, id) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;

    try {
        switch (kind) {
            case "inst":
                await firebaseManager.deleteInstallment(id);
                refreshInst();
                break;
            case "bills":
                await firebaseManager.deleteBill(id);
                refreshBills();
                break;
            case "exps":
                await firebaseManager.deleteExpense(id);
                refreshExp();
                refreshBudgets();
                break;
            case "one":
                await firebaseManager.deleteExternalExpense(id);
                refreshOne();
                break;
            case "budgets":
                await firebaseManager.deleteBudget(id);
                refreshBudgets();
                break;
        }
        
        refreshSummary();
        refreshCharts();
        updateAlerts();
        showToast("🗑️ تم الحذف بنجاح", "success");
    } catch (error) {
        console.error('Error deleting item:', error);
        // Fallback to local storage
        const key = K[kind];
        if (key) {
            const local = getLS(key, "[]");
            const filtered = local.filter(item => item.id !== id);
            setLS(key, filtered);
            
            switch (kind) {
                case "inst":
                    refreshInst();
                    break;
                case "bills":
                    refreshBills();
                    break;
                case "exps":
                    refreshExp();
                    refreshBudgets();
                    break;
                case "one":
                    refreshOne();
                    break;
                case "budgets":
                    refreshBudgets();
                    break;
            }
            
            refreshSummary();
            refreshCharts();
            updateAlerts();
            showToast("🗑️ تم الحذف بنجاح", "success");
        }
    }
}

/* ===== Enhanced Summary and Charts ===== */
function refreshSummary() {
    const curM = $("#monthPicker").value;
    const salary = +getLS(K.salary, "0");
    const savingTarget = +getLS(K.saving, "0");
    const settings = getLS(K.settings, '{"cash":false}');

    const inst = getLS(K.inst, "[]");
    const bills = getLS(K.bills, "[]");
    const exps = getLS(K.exps, "[]");
    const ones = getLS(K.one, "[]");

    let totalInst = 0, totalBills = 0;

    [...inst, ...bills].forEach(item => {
        const dueAmt = dueThisMonth(item, curM);
        if (dueAmt > 0) {
            const kind = inst.includes(item) ? "inst" : "bills";
            const paid = isPaid(kind, item.id, curM);
            if (!settings.cash || paid) {
                if (inst.includes(item)) {
                    totalInst += dueAmt;
                } else {
                    totalBills += dueAmt;
                }
            }
        }
    });

    const totalExp = exps.filter(x => ym(x.date) === curM)
                         .reduce((sum, x) => sum + x.amount, 0);

    const totalOne = ones.filter(x => ym(x.date) === curM && (!settings.cash || x.paid))
                         .reduce((sum, x) => sum + x.amount, 0);

    const totalExpenses = totalInst + totalBills + totalExp + totalOne;
    const actualSaving = salary - totalExpenses;
    const netRemaining = actualSaving;

    // Update KPIs
    $("#kpiIncome").textContent = fmt(salary);
    $("#kpiExpense").textContent = fmt(totalExpenses);
    $("#kpiSaving").textContent = fmt(actualSaving);
    $("#kpiNet").textContent = fmt(netRemaining);

    // Update summary section
    const summaryDiv = $("#monthSummary");
    if (summaryDiv) {
        const savingPercentage = salary > 0 ? ((actualSaving / salary) * 100) : 0;
        const targetPercentage = savingTarget > 0 ? ((actualSaving / savingTarget) * 100) : 0;

        summaryDiv.innerHTML = `
            <div class="grid cols-2">
                <div class="card">
                    <h3>📊 النسب المالية</h3>
                    <div class="kpis">
                        <div class="kpi">
                            <div class="lbl">💰 إجمالي الدخل</div>
                            <div class="val">${fmt(salary)}</div>
                            <div class="trend">النسبة من الدخل: 100%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">🏦 الأقساط الثابتة</div>
                            <div class="val">${fmt(totalInst)}</div>
                            <div class="trend">النسبة من الدخل: ${salary > 0 ? ((totalInst / salary) * 100).toFixed(1) : 0}%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">🧾 الفواتير الشهرية</div>
                            <div class="val">${fmt(totalBills)}</div>
                            <div class="trend">النسبة من الدخل: ${salary > 0 ? ((totalBills / salary) * 100).toFixed(1) : 0}%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">💳 المصاريف اليومية</div>
                            <div class="val">${fmt(totalExp)}</div>
                            <div class="trend">النسبة من الدخل: ${salary > 0 ? ((totalExp / salary) * 100).toFixed(1) : 0}%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">⚠️ المصاريف الخارجية</div>
                            <div class="val">${fmt(totalOne)}</div>
                            <div class="trend">النسبة من الدخل: ${salary > 0 ? ((totalOne / salary) * 100).toFixed(1) : 0}%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">💸 إجمالي المصروفات</div>
                            <div class="val">${fmt(totalExpenses)}</div>
                            <div class="trend">النسبة من الدخل: ${salary > 0 ? ((totalExpenses / salary) * 100).toFixed(1) : 0}%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">🏦 الادخار الفعلي</div>
                            <div class="val">${fmt(actualSaving)}</div>
                            <div class="trend ${actualSaving >= 0 ? 'up' : 'down'}">النسبة من الدخل: ${savingPercentage.toFixed(1)}%</div>
                        </div>
                        <div class="kpi">
                            <div class="lbl">🎯 الادخار المستهدف</div>
                            <div class="val">${fmt(savingTarget)}</div>
                            <div class="trend ${targetPercentage >= 100 ? 'up' : 'down'}">نسبة تحقيق الهدف: ${targetPercentage.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
                <div class="card">
                    <h3>📈 تحليل الأداء</h3>
                    <div class="analysis">
                        ${generatePerformanceAnalysis(salary, totalExpenses, actualSaving, savingTarget)}
                    </div>
                </div>
            </div>
        `;
    }
}

function generatePerformanceAnalysis(salary, totalExpenses, actualSaving, savingTarget) {
    const analysis = [];
    
    if (salary === 0) {
        analysis.push('<p class="muted">⚠️ لم يتم تحديد الراتب الشهري بعد.</p>');
        return analysis.join('');
    }
    
    const savingRate = (actualSaving / salary) * 100;
    const expenseRate = (totalExpenses / salary) * 100;
    
    if (savingRate >= 20) {
        analysis.push('<p style="color: var(--success);">🌟 ممتاز! نسبة ادخار عالية جداً.</p>');
    } else if (savingRate >= 10) {
        analysis.push('<p style="color: var(--warning);">👍 نسبة ادخار جيدة، يمكن تحسينها أكثر.</p>');
    } else if (savingRate >= 0) {
        analysis.push('<p style="color: var(--warning);">💡 نسبة الادخار منخفضة. حاول تقليل المصروفات.</p>');
    } else {
        analysis.push('<p style="color: var(--danger);">⚠️ مصروفاتك تتجاوز دخلك! راجع ميزانيتك فوراً.</p>');
    }
    
    if (expenseRate > 90) {
        analysis.push('<p style="color: var(--danger);">🚨 مصروفاتك مرتفعة جداً مقارنة بدخلك.</p>');
    } else if (expenseRate > 80) {
        analysis.push('<p style="color: var(--warning);">⚠️ مصروفاتك مرتفعة نسبياً.</p>');
    } else {
        analysis.push('<p style="color: var(--success);">✅ مصروفاتك ضمن المعدل الطبيعي.</p>');
    }
    
    if (savingTarget > 0) {
        const targetAchievement = (actualSaving / savingTarget) * 100;
        if (targetAchievement >= 100) {
            analysis.push('<p style="color: var(--success);">🎯 تهانينا! حققت هدف الادخار.</p>');
        } else if (targetAchievement >= 80) {
            analysis.push('<p style="color: var(--warning);">🎯 قريب من تحقيق هدف الادخار.</p>');
        } else {
            const deficit = savingTarget - actualSaving;
            analysis.push(`<p style="color: var(--danger);">🎯 تحتاج ${fmt(deficit)} إضافية لتحقيق هدف الادخار.</p>`);
        }
    }
    
    return analysis.join('');
}

/* ===== Enhanced Charts ===== */
let trendChart, expenseChart;

function setupCharts() {
    const trendCtx = $("#trendChart");
    const expenseCtx = $("#expenseChart");
    
    if (trendCtx) {
        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'الدخل',
                    data: [],
                    borderColor: '#2e90fa',
                    backgroundColor: 'rgba(46, 144, 250, 0.1)',
                    tension: 0.4
                }, {
                    label: 'المصروفات',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }, {
                    label: 'الادخار',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'التطور الشهري للمالية',
                        color: '#e6eeff'
                    },
                    legend: {
                        labels: {
                            color: '#e6eeff'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8da3c1' },
                        grid: { color: 'rgba(141, 163, 193, 0.1)' }
                    },
                    y: {
                        ticks: { color: '#8da3c1' },
                        grid: { color: 'rgba(141, 163, 193, 0.1)' }
                    }
                }
            }
        });
    }
    
    if (expenseCtx) {
        expenseChart = new Chart(expenseCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#2e90fa',
                        '#ef4444',
                        '#10b981',
                        '#f59e0b',
                        '#7c3aed',
                        '#06b6d4'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'توزيع المصروفات',
                        color: '#e6eeff'
                    },
                    legend: {
                        labels: {
                            color: '#e6eeff'
                        }
                    }
                }
            }
        });
    }
}

function refreshCharts() {
    const curM = $("#monthPicker").value;
    const salary = +getLS(K.salary, "0");
    
    // Update trend chart with last 6 months
    if (trendChart) {
        const months = [];
        const incomes = [];
        const expenses = [];
        const savings = [];
        
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthStr = date.toISOString().slice(0, 7);
            months.push(monthStr);
            
            const monthExpenses = calculateMonthExpenses(monthStr);
            incomes.push(salary);
            expenses.push(monthExpenses);
            savings.push(salary - monthExpenses);
        }
        
        trendChart.data.labels = months;
        trendChart.data.datasets[0].data = incomes;
        trendChart.data.datasets[1].data = expenses;
        trendChart.data.datasets[2].data = savings;
        trendChart.update();
    }
    
    // Update expense distribution chart
    if (expenseChart) {
        const inst = getLS(K.inst, "[]");
        const bills = getLS(K.bills, "[]");
        const exps = getLS(K.exps, "[]");
        const ones = getLS(K.one, "[]");
        const settings = getLS(K.settings, '{"cash":false}');
        
        let totalInst = 0, totalBills = 0;
        
        [...inst, ...bills].forEach(item => {
            const dueAmt = dueThisMonth(item, curM);
            if (dueAmt > 0) {
                const kind = inst.includes(item) ? "inst" : "bills";
                const paid = isPaid(kind, item.id, curM);
                if (!settings.cash || paid) {
                    if (inst.includes(item)) {
                        totalInst += dueAmt;
                    } else {
                        totalBills += dueAmt;
                    }
                }
            }
        });
        
        const totalExp = exps.filter(x => ym(x.date) === curM)
                             .reduce((sum, x) => sum + x.amount, 0);
        
        const totalOne = ones.filter(x => ym(x.date) === curM && (!settings.cash || x.paid))
                             .reduce((sum, x) => sum + x.amount, 0);
        
        const labels = [];
        const data = [];
        
        if (totalInst > 0) {
            labels.push('الأقساط الثابتة');
            data.push(totalInst);
        }
        if (totalBills > 0) {
            labels.push('الفواتير الشهرية');
            data.push(totalBills);
        }
        if (totalExp > 0) {
            labels.push('المصاريف اليومية');
            data.push(totalExp);
        }
        if (totalOne > 0) {
            labels.push('المصاريف الخارجية');
            data.push(totalOne);
        }
        
        expenseChart.data.labels = labels;
        expenseChart.data.datasets[0].data = data;
        expenseChart.update();
    }
}

function calculateMonthExpenses(monthStr) {
    const inst = getLS(K.inst, "[]");
    const bills = getLS(K.bills, "[]");
    const exps = getLS(K.exps, "[]");
    const ones = getLS(K.one, "[]");
    const settings = getLS(K.settings, '{"cash":false}');
    
    let total = 0;
    
    [...inst, ...bills].forEach(item => {
        const dueAmt = dueThisMonth(item, monthStr);
        if (dueAmt > 0) {
            const kind = inst.includes(item) ? "inst" : "bills";
            const paid = isPaid(kind, item.id, monthStr);
            if (!settings.cash || paid) {
                total += dueAmt;
            }
        }
    });
    
    total += exps.filter(x => ym(x.date) === monthStr)
                 .reduce((sum, x) => sum + x.amount, 0);
    
    total += ones.filter(x => ym(x.date) === monthStr && (!settings.cash || x.paid))
                 .reduce((sum, x) => sum + x.amount, 0);
    
    return total;
}

/* ===== Enhanced Budget Warning ===== */
function checkBudgetWarn(category) {
    const curM = $("#monthPicker").value;
    const budgets = getLS(K.budgets, "[]");
    const budget = budgets.find(b => b.cat.toLowerCase() === category.toLowerCase());
    
    if (!budget) return;
    
    const exps = getLS(K.exps, "[]");
    const spent = exps.filter(x => 
        ym(x.date) === curM && 
        x.cat.toLowerCase() === category.toLowerCase()
    ).reduce((sum, x) => sum + x.amount, 0);
    
    const percentage = (spent / budget.limit) * 100;
    
    if (percentage >= 100) {
        showToast(`🚨 تجاوزت ميزانية "${category}" بنسبة ${percentage.toFixed(1)}%`, "danger");
    } else if (percentage >= 80) {
        showToast(`⚠️ اقتربت من حد ميزانية "${category}" (${percentage.toFixed(1)}%)`, "warning");
    }
}

/* ===== Enhanced Auto Features ===== */
function autoDeductIfDue(yyyymm) {
    const inst = getLS(K.inst, "[]");
    const bills = getLS(K.bills, "[]");
    let autoDeducted = 0;

    [...inst, ...bills].forEach(item => {
        const dueAmt = dueThisMonth(item, yyyymm);
        if (dueAmt > 0) {
            const kind = inst.includes(item) ? "inst" : "bills";
            const paid = isPaid(kind, item.id, yyyymm);

            if (!paid) {
                const daysUntil = daysUntilDue(item, yyyymm);
                if (daysUntil <= 0) {
                    setPaid(kind, item.id, yyyymm, true);
                    autoDeducted++;
                }
            }
        }
    });

    if (autoDeducted > 0) {
        showToast(`⚡ تم خصم ${autoDeducted} عنصر تلقائياً`, "success");
    }
}

function rolloverArrears(yyyymm) {
    const prevMonth = prevMonthStr(yyyymm);
    const inst = getLS(K.inst, "[]");
    const bills = getLS(K.bills, "[]");
    const ones = getLS(K.one, "[]");
    let rolledOver = 0;

    [...inst, ...bills].forEach(item => {
        const dueAmt = dueThisMonth(item, prevMonth);
        if (dueAmt > 0) {
            const kind = inst.includes(item) ? "inst" : "bills";
            const paid = isPaid(kind, item.id, prevMonth);

            if (!paid) {
                const rolloverItem = {
                    id: Date.now() + Math.random(),
                    date: yyyymm + "-01",
                    cat: "ترحيل متأخر",
                    note: `${item.name} (${prevMonth})`,
                    amount: dueAmt,
                    paid: false
                };

                const existingRollover = ones.find(x =>
                    x.note === rolloverItem.note &&
                    ym(x.date) === yyyymm
                );

                if (!existingRollover) {
                    ones.push(rolloverItem);
                    rolledOver++;
                }
            }
        }
    });

    if (rolledOver > 0) {
        setLS(K.one, ones);
        showToast(`📋 تم ترحيل ${rolledOver} عنصر متأخر`, "warning");
    }
}

function updateAlerts() {
    const curM = $("#monthPicker").value;
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (curM !== currentMonth) {
        $("#alertsCount").style.display = "none";
        return;
    }

    const inst = getLS(K.inst, "[]");
    const bills = getLS(K.bills, "[]");
    let alerts = 0;

    [...inst, ...bills].forEach(item => {
        const dueAmt = dueThisMonth(item, curM);
        if (dueAmt > 0) {
            const kind = inst.includes(item) ? "inst" : "bills";
            const paid = isPaid(kind, item.id, curM);

            if (!paid) {
                const daysUntil = daysUntilDue(item, curM);
                if (daysUntil <= 3) {
                    alerts++;
                }
            }
        }
    });

    if (alerts > 0) {
        $("#alertsCount").style.display = "block";
        $("#alertsText").textContent = `${alerts} تنبيه`;
    } else {
        $("#alertsCount").style.display = "none";
    }
}

/* ===== Enhanced Export Functions ===== */
function exportCSV(month, search) {
    const exps = getLS(K.exps, "[]");
    const filtered = exps.filter(x => {
        const inMonth = ym(x.date) === month;
        const matchSearch = !search ||
            x.cat.toLowerCase().includes(search.toLowerCase()) ||
            (x.note && x.note.toLowerCase().includes(search.toLowerCase()));
        return inMonth && matchSearch;
    });

    if (filtered.length === 0) {
        showToast("⚠️ لا توجد بيانات للتصدير", "warning");
        return;
    }

    const headers = ["التاريخ", "التصنيف", "الملاحظة", "طريقة الدفع", "المبلغ"];
    const rows = filtered.map(x => [
        x.date,
        x.cat,
        x.note || "",
        x.pay,
        x.amount
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(","))
        .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `مصاريف_${month}.csv`;
    link.click();

    showToast("📄 تم تصدير البيانات بنجاح", "success");
}

function exportJSON() {
    const data = {
        salary: getLS(K.salary, "0"),
        saving: getLS(K.saving, "0"),
        settings: getLS(K.settings, "{}"),
        installments: getLS(K.inst, "[]"),
        bills: getLS(K.bills, "[]"),
        expenses: getLS(K.exps, "[]"),
        external: getLS(K.one, "[]"),
        budgets: getLS(K.budgets, "[]"),
        paid: getLS(K.paid, "{}"),
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    showToast("📋 تم تصدير النسخة الاحتياطية بنجاح", "success");
}

/* ===== Enhanced Quick Add Modal ===== */
const fab = $("#fabAdd");
const modal = $("#quickModal");

function openQuick() {
    if (!modal) return;
    $("#qDate").value = today;
    $("#qCat").value = "";
    $("#qAmount").value = "";
    $("#qNote").value = "";
    $("#qPay").value = "cash";
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeQuick() {
    if (!modal) return;
    modal.classList.remove("show");
    document.body.style.overflow = "";
}

if (fab) {
    fab.onclick = openQuick;
}

if (modal) {
    modal.addEventListener("click", (e) => {
        if (e.target.id === "quickModal") closeQuick();
    });
}

const qCancel = $("#qCancel");
if (qCancel) {
    qCancel.onclick = (e) => {
        e.preventDefault();
        closeQuick();
    };
}

const quickForm = $("#quickForm");
if (quickForm) {
    quickForm.onsubmit = async (e) => {
        e.preventDefault();
        const date = $("#qDate").value;
        const cat = $("#qCat").value.trim();
        const note = $("#qNote").value.trim();
        const pay = $("#qPay").value;
        const amount = +$("#qAmount").value;

        if (!date || !cat || !amount) {
            showToast("⚠️ يرجى ملء جميع الحقول المطلوبة", "warning");
            return;
        }

        try {
            await firebaseManager.addExpense({
                date,
                cat,
                note,
                pay,
                amount,
            });
            
            closeQuick();
            showToast("✅ تم إضافة المصروف بنجاح!", "success");
            refreshExp();
            refreshBudgets();
            refreshSummary();
            refreshCharts();
            checkBudgetWarn(cat);
        } catch (error) {
            showToast("❌ خطأ في إضافة المصروف", "danger");
            console.error(error);
        }
    };
}

/* ===== Enhanced Import Functionality ===== */
$("#importData").onclick = () => {
    const importModal = $("#importModal");
    if (importModal) {
        importModal.classList.add("show");
        document.body.style.overflow = "hidden";
    }
};

$("#importCancel").onclick = () => {
    const importModal = $("#importModal");
    if (importModal) {
        importModal.classList.remove("show");
        document.body.style.overflow = "";
    }
};

$("#importConfirm").onclick = () => {
    const fileInput = $("#importFile");
    const file = fileInput.files[0];

    if (!file) {
        showToast("⚠️ يرجى اختيار ملف للاستيراد", "warning");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // استيراد البيانات
            if (data.salary) setLS(K.salary, data.salary);
            if (data.saving) setLS(K.saving, data.saving);
            if (data.settings) setLS(K.settings, data.settings);
            if (data.installments) setLS(K.inst, data.installments);
            if (data.bills) setLS(K.bills, data.bills);
            if (data.expenses) setLS(K.exps, data.expenses);
            if (data.external) setLS(K.one, data.external);
            if (data.budgets) setLS(K.budgets, data.budgets);
            if (data.paid) setLS(K.paid, data.paid);

            showToast("✅ تم استيراد البيانات بنجاح!", "success");
            refreshAll();

            const importModal = $("#importModal");
            if (importModal) {
                importModal.classList.remove("show");
                document.body.style.overflow = "";
            }
        } catch (error) {
            showToast("❌ خطأ في قراءة الملف", "danger");
        }
    };
    reader.readAsText(file);
};

/* ===== Enhanced Navigation ===== */
function updateActiveNavigation() {
    const sections = $$('section[id]');
    const navLinks = $$('.bottom-nav a');

    let currentSection = '';
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom >= 100) {
            currentSection = section.id;
        }
    });

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === '#' + currentSection) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

window.addEventListener('scroll', updateActiveNavigation);

/* ===== Enhanced Theme Toggle ===== */
const themeToggle = $("#themeToggle");

function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.classList.add("light");
        localStorage.setItem("theme", "light");
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.documentElement.classList.remove("light");
        localStorage.setItem("theme", "dark");
        if (themeToggle) themeToggle.checked = false;
    }
}

if (themeToggle) {
    themeToggle.addEventListener("change", () => {
        applyTheme(themeToggle.checked ? "light" : "dark");
        showToast(themeToggle.checked ? "🌞 تم التبديل للوضع الفاتح" : "🌙 تم التبديل للوضع الداكن", "success");
    });
}

// تحميل الوضع السابق
applyTheme(localStorage.getItem("theme") || "dark");

/* ===== Enhanced Additional Features ===== */
$("#generateReport").onclick = () => {
    generateDetailedReport();
};

$("#compareMonths").onclick = () => {
    showMonthComparison();
};

function generateDetailedReport() {
    const curM = $("#monthPicker").value;
    const salary = +getLS(K.salary, "0");
    const savingTarget = +getLS(K.saving, "0");

    // حساب البيانات التفصيلية
    const monthData = calculateDetailedMonthData(curM);

    // إنشاء تقرير HTML
    const reportHTML = `
        <div style="font-family: Tajawal, Arial; direction: rtl; padding: 20px; background: white; color: #333;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2e90fa; margin-bottom: 10px;">📊 التقرير المالي المفصل</h1>
                <h2 style="color: #666; font-weight: normal;">شهر ${curM}</h2>
                <p style="color: #888; font-size: 14px;">تم إنشاؤه في: ${new Date().toLocaleString('ar-EG')}</p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div style="background: linear-gradient(135deg, #2e90fa, #1d4ed8); color: white; padding: 20px; border-radius: 12px; text-align: center;">
                    <h3 style="margin: 0 0 10px 0;">💰 إجمالي الدخل</h3>
                    <p style="font-size: 24px; font-weight: bold; margin: 0;">${fmt(salary)}</p>
                </div>
                <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 20px; border-radius: 12px; text-align: center;">
                    <h3 style="margin: 0 0 10px 0;">💸 إجمالي المصروفات</h3>
                    <p style="font-size: 24px; font-weight: bold; margin: 0;">${fmt(monthData.totalExpenses)}</p>
                </div>
                <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 12px; text-align: center;">
                    <h3 style="margin: 0 0 10px 0;">🏦 الادخار الفعلي</h3>
                    <p style="font-size: 24px; font-weight: bold; margin: 0;">${fmt(monthData.actualSaving)}</p>
                </div>
                <div style="background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; padding: 20px; border-radius: 12px; text-align: center;">
                    <h3 style="margin: 0 0 10px 0;">🎯 نسبة تحقيق الهدف</h3>
                    <p style="font-size: 24px; font-weight: bold; margin: 0;">${savingTarget > 0 ? ((monthData.actualSaving / savingTarget) * 100).toFixed(1) : 0}%</p>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="color: #2e90fa; border-bottom: 2px solid #2e90fa; padding-bottom: 10px;">📋 تفصيل المصروفات</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background: #f8fafc;">
                            <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: right;">الفئة</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: right;">المبلغ</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: right;">النسبة من الدخل</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="padding: 12px; border: 1px solid #e2e8f0;">🏦 الأقساط الثابتة</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${fmt(monthData.installments)}</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${salary > 0 ? ((monthData.installments / salary) * 100).toFixed(1) : 0}%</td></tr>
                        <tr><td style="padding: 12px; border: 1px solid #e2e8f0;">🧾 الفواتير الشهرية</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${fmt(monthData.bills)}</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${salary > 0 ? ((monthData.bills / salary) * 100).toFixed(1) : 0}%</td></tr>
                        <tr><td style="padding: 12px; border: 1px solid #e2e8f0;">💳 المصروفات اليومية</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${fmt(monthData.dailyExpenses)}</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${salary > 0 ? ((monthData.dailyExpenses / salary) * 100).toFixed(1) : 0}%</td></tr>
                        <tr><td style="padding: 12px; border: 1px solid #e2e8f0;">⚠️ المصروفات الخارجية</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${fmt(monthData.external)}</td><td style="padding: 12px; border: 1px solid #e2e8f0;">${salary > 0 ? ((monthData.external / salary) * 100).toFixed(1) : 0}%</td></tr>
                    </tbody>
                </table>
            </div>
            
            <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #666; font-size: 12px;">
                <p>تم إنشاء هذا التقرير بواسطة تطبيق إدارة مالي Firebase v4.0</p>
            </div>
        </div>
    `;
    
    // فتح التقرير في نافذة جديدة
    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
    
    showToast("📊 تم إنشاء التقرير المفصل بنجاح!", "success");
}

function calculateDetailedMonthData(monthStr) {
    const settings = getLS(K.settings, '{"cash":false}');
    const inst = getLS(K.inst, "[]");
    const bills = getLS(K.bills, "[]");
    const exps = getLS(K.exps, "[]");
    const ones = getLS(K.one, "[]");
    
    let installments = 0, billsTotal = 0;
    
    // حساب الأقساط والفواتير
    [...inst, ...bills].forEach(item => {
        const dueAmt = dueThisMonth(item, monthStr);
        if (dueAmt > 0) {
            const kind = inst.includes(item) ? "inst" : "bills";
            const paid = isPaid(kind, item.id, monthStr);
            if (!settings.cash || paid) {
                if (inst.includes(item)) installments += dueAmt;
                else billsTotal += dueAmt;
            }
        }
    });
    
    const dailyExpenses = exps.filter(x => ym(x.date) === monthStr)
                             .reduce((sum, x) => sum + x.amount, 0);
    
    const external = ones.filter(x => ym(x.date) === monthStr && (!settings.cash || x.paid))
                         .reduce((sum, x) => sum + x.amount, 0);
    
    const totalExpenses = installments + billsTotal + dailyExpenses + external;
    const salary = +getLS(K.salary, "0");
    const actualSaving = salary - totalExpenses;
    
    return {
        installments,
        bills: billsTotal,
        dailyExpenses,
        external,
        totalExpenses,
        actualSaving
    };
}

function showMonthComparison() {
    const currentMonth = $("#monthPicker").value;
    const prevMonth = prevMonthStr(currentMonth);

    const currentData = calculateDetailedMonthData(currentMonth);
    const prevData = calculateDetailedMonthData(prevMonth);

    const comparisonHTML = `
        <div style="font-family: Tajawal, Arial; direction: rtl; padding: 20px; background: white; color: #333;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2e90fa; margin-bottom: 10px;">📈 مقارنة الأشهر</h1>
                <h2 style="color: #666; font-weight: normal;">${prevMonth} مقابل ${currentMonth}</h2>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                ${generateComparisonCard('💸 إجمالي المصروفات', prevData.totalExpenses, currentData.totalExpenses)}
                ${generateComparisonCard('🏦 الادخار الفعلي', prevData.actualSaving, currentData.actualSaving)}
                ${generateComparisonCard('💳 المصروفات اليومية', prevData.dailyExpenses, currentData.dailyExpenses)}
                ${generateComparisonCard('🏦 الأقساط والفواتير', prevData.installments + prevData.bills, currentData.installments + currentData.bills)}
            </div>
            
            <div style="margin-top: 30px; text-align: center;">
                <h3 style="color: #2e90fa;">📊 التحليل</h3>
                ${generateComparisonAnalysis(prevData, currentData)}
            </div>
        </div>
    `;

    const comparisonWindow = window.open('', '_blank');
    comparisonWindow.document.write(comparisonHTML);
    comparisonWindow.document.close();

    showToast("📈 تم إنشاء مقارنة الأشهر بنجاح!", "success");
}

function generateComparisonCard(title, prevValue, currentValue) {
    const change = currentValue - prevValue;
    const changePercent = prevValue > 0 ? ((change / prevValue) * 100) : 0;
    const isPositive = change >= 0;
    const arrow = isPositive ? '↗️' : '↘️';
    const color = title.includes('الادخار') ? (isPositive ? '#10b981' : '#ef4444') : (isPositive ? '#ef4444' : '#10b981');

    return `
        <div style="background: linear-gradient(135deg, #f8fafc, #e2e8f0); padding: 20px; border-radius: 12px; border: 1px solid #cbd5e1;">
            <h3 style="margin: 0 0 15px 0; color: #334155;">${title}</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="color: #64748b;">الشهر السابق:</span>
                <span style="font-weight: bold;">${fmt(prevValue)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="color: #64748b;">الشهر الحالي:</span>
                <span style="font-weight: bold;">${fmt(currentValue)}</span>
            </div>
            <div style="text-align: center; padding: 10px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                <span style="color: ${color}; font-weight: bold; font-size: 16px;">
                    ${arrow} ${fmt(Math.abs(change))} (${Math.abs(changePercent).toFixed(1)}%)
                </span>
            </div>
        </div>
    `;
}

function generateComparisonAnalysis(prevData, currentData) {
    const analysis = [];

    const expenseChange = currentData.totalExpenses - prevData.totalExpenses;
    const savingChange = currentData.actualSaving - prevData.actualSaving;

    if (expenseChange > 0) {
        analysis.push(`📈 زادت مصروفاتك بمقدار ${fmt(expenseChange)} مقارنة بالشهر السابق.`);
    } else if (expenseChange < 0) {
        analysis.push(`📉 انخفضت مصروفاتك بمقدار ${fmt(Math.abs(expenseChange))} مقارنة بالشهر السابق.`);
    } else {
        analysis.push(`➡️ مصروفاتك مستقرة مقارنة بالشهر السابق.`);
    }

    if (savingChange > 0) {
        analysis.push(`🎉 تحسن ادخارك بمقدار ${fmt(savingChange)} - أحسنت!`);
    } else if (savingChange < 0) {
        analysis.push(`⚠️ انخفض ادخارك بمقدار ${fmt(Math.abs(savingChange))} - راجع مصروفاتك.`);
    } else {
        analysis.push(`➡️ ادخارك مستقر مقارنة بالشهر السابق.`);
    }

    return '<div style="background: #f1f5f9; padding: 20px; border-radius: 12px; text-align: right;">' +
           analysis.map(item => `<p style="margin: 10px 0; line-height: 1.6;">${item}</p>`).join('') +
           '</div>';
}

$("#exportSummary").onclick = () => {
    const curM = $("#monthPicker").value;
    const summaryData = {
        month: curM,
        summary: $("#monthSummary").innerHTML,
        generatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(summaryData, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ملخص_${curM}.json`;
    link.click();

    showToast("📄 تم تصدير الملخص بنجاح", "success");
};

/* ===== Enhanced Keyboard Shortcuts ===== */
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 's':
                e.preventDefault();
                $("#saveSettingsBtn").click();
                break;
            case 'n':
                e.preventDefault();
                openQuick();
                break;
            case 'e':
                e.preventDefault();
                $("#exportJSON").click();
                break;
        }
    }

    if (e.key === 'Escape') {
        closeQuick();
        const importModal = $("#importModal");
        if (importModal && importModal.classList.contains('show')) {
            importModal.classList.remove("show");
            document.body.style.overflow = "";
        }
    }
});

/* ===== Enhanced Initialization ===== */
document.addEventListener('DOMContentLoaded', () => {
    setupCharts();
    refreshAll();
    updateActiveNavigation();

    // إضافة تأثيرات تفاعلية للبطاقات
    $$('.card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });
    });

    showToast("🎉 مرحباً بك في إدارة مالي Firebase v4.0!", "success");
});

// تحديث دوري للتنبيهات
setInterval(updateAlerts, 60000); // كل دقيقة

