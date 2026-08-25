/* ==========================================================================
   FINFLOW - FIREBASE CONTROLLER & STATE MANAGEMENT (SDK v12 MODULAR)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

/* Firebase Configuration */
const firebaseConfig = {
  apiKey: "AIzaSyDLltRuNFF5U_nJl8UECvDX3CnyROvMlyc",
  authDomain: "mapeamento-esportivo.firebaseapp.com",
  projectId: "mapeamento-esportivo",
  storageBucket: "mapeamento-esportivo.firebasestorage.app",
  messagingSenderId: "256881997860",
  appId: "1:256881997860:web:d1b1f9a434da7518ecc0b1",
  measurementId: "G-BZXT7SBFSK",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/* Labels & Visual Themes */
const labels = {
  overview: "Visão Geral",
  needs: "50% Necessidades",
  wants: "30% Desejos",
  savings: "20% Investimentos",
  vr: "Carteira VR",
  entries: "Todos os Lançamentos",
};

const viewSubtitles = {
  overview: "Acompanhe seu fluxo de caixa mensal e distribuição do orçamento.",
  needs: "Gastos essenciais como moradia, alimentação básica, contas e saúde (limite de 50%).",
  wants: "Gastos com estilo de vida, lazer, hobbies, restaurantes e compras (limite de 30%).",
  savings: "Aportes para reserva de emergência, metas de médio prazo e investimentos (mínimo de 20%).",
  vr: "Controle específico de saldo, recebimentos e gastos do seu Vale-Refeição/Alimentação.",
  entries: "Histórico detalhado e extrato de todas as transações cadastradas.",
};

const colors = {
  needs: "#10B981",
  wants: "#FDB72D",
  savings: "#3B82F6",
  vr: "#EC4899",
};

/* Application State */
const state = {
  user: null,
  settings: { monthly_income_cents: 0, vr_initial_balance_cents: 0 },
  rawEntries: [],
  filteredEntries: [],
  summary: null,
  currentView: "overview",
  filters: defaultFilters(),
  activePreset: "current-month",
};

/* DOM Elements */
const els = {
  // Auth Widgets & Dialog
  authUnloggedWidget: document.querySelector("#auth-unlogged-widget"),
  authLoggedWidget: document.querySelector("#auth-logged-widget"),
  openAuthBtn: document.querySelector("#open-auth-btn"),
  mobileAuthTrigger: document.querySelector("#mobile-auth-trigger"),
  mobileUserAvatar: document.querySelector("#mobile-user-avatar"),
  googleAuthBtn: document.querySelector("#google-auth-btn"),
  authDialog: document.querySelector("#auth-dialog"),
  closeAuth: document.querySelector("#close-auth"),
  authForm: document.querySelector("#auth-form"),
  authModalTitle: document.querySelector("#auth-modal-title"),
  authModalSubtitle: document.querySelector("#auth-modal-subtitle"),
  authSubmitBtn: document.querySelector("#auth-submit-btn"),
  authMessage: document.querySelector("#auth-message"),
  nameField: document.querySelector("#name-field"),
  logoutButton: document.querySelector("#logout-button"),
  userDisplayName: document.querySelector("#user-display-name"),
  userEmail: document.querySelector("#user-email"),
  userAvatarInitials: document.querySelector("#user-avatar-initials"),

  // Mobile Topbar Actions
  mobileOpenEntry: document.querySelector("#mobile-open-entry"),
  mobileViewTitle: document.querySelector("#mobile-view-title"),
  mobileViewSubtitle: document.querySelector("#mobile-view-subtitle"),

  // Settings
  toggleSettingsBtn: document.querySelector("#toggle-settings-btn"),
  settingsForm: document.querySelector("#settings-form"),
  settingsMessage: document.querySelector("#settings-message"),
  toggleSettingsText: document.querySelector("#toggle-settings-text"),
  toggleSettingsIcon: document.querySelector("#toggle-settings-icon"),

  // Filters
  filtersForm: document.querySelector("#filters-form"),
  presetButtons: document.querySelectorAll("[data-preset]"),

  // Entry Dialog (Redesigned)
  entryDialog: document.querySelector("#entry-dialog"),
  entryForm: document.querySelector("#entry-form"),
  entryDialogTitle: document.querySelector("#entry-dialog-title"),
  entryMessage: document.querySelector("#entry-message"),
  deleteEntry: document.querySelector("#delete-entry"),
  entryValueInput: document.querySelector("#entry-value"),
  hiddenBudgetType: document.querySelector("#hidden-budget-type"),
  hiddenEntryKind: document.querySelector("#hidden-entry-kind"),
  budgetChips: document.querySelectorAll(".budget-chip"),
  vrKindWrapper: document.querySelector("#vr-kind-toggle-wrapper"),
  vrSegmentBtns: document.querySelectorAll(".segmented-movement .segment-btn"),
  categoryInput: document.querySelector("#entry-category"),
  catPills: document.querySelectorAll(".cat-pill"),

  // Confirm Dialog
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmTitle: document.querySelector("#confirm-title"),
  confirmDesc: document.querySelector("#confirm-desc"),
  confirmOk: document.querySelector("#confirm-ok"),
  confirmCancel: document.querySelector("#confirm-cancel"),

  // Toast
  toast: document.querySelector("#toast"),
  toastText: document.querySelector("#toast-text"),
};

let authMode = "login";
let searchDebounceTimer = null;
let toastTimeout = null;
let toastFadeTimeout = null;
let confirmResolve = null;
let unsubscribeSettings = null;
let unsubscribeEntries = null;

function unsubscribeUserData() {
  if (typeof unsubscribeSettings === "function") {
    unsubscribeSettings();
    unsubscribeSettings = null;
  }
  if (typeof unsubscribeEntries === "function") {
    unsubscribeEntries();
    unsubscribeEntries = null;
  }
}

/* ==========================================================================
   INITIALIZATION & AUTO-UPDATES
   ========================================================================== */

const CURRENT_APP_VERSION = "1.0.0";
const CURRENT_VERSION_CODE = 1;

document.addEventListener("DOMContentLoaded", () => {
  initLiveUpdates();
  wireEvents();
  hydrateFilterFields();
  setupCurrencyMasks();

  // Load guest data initially
  loadGuestData();

  // Listen to Firebase Auth state in real time
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    if (user) {
      updateUserUI(user);
      await loadUserData();
    } else {
      unsubscribeUserData();
      updateGuestUI();
      loadGuestData();
    }
  });

  // Verificação silenciosa de novas versões após a carga inicial
  setTimeout(() => {
    checkForUpdates(false);
  }, 2500);
});

async function initLiveUpdates() {
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()) {
    try {
      const updater = window.Capacitor?.Plugins?.CapacitorUpdater;
      if (updater && typeof updater.notifyAppReady === "function") {
        await updater.notifyAppReady();
        console.log("Capgo Live Updates: Versão validada com sucesso.");
      }
    } catch (err) {
      console.warn("Capgo Live Updates:", err);
    }
  }
}

async function checkForUpdates(manual = false) {
  try {
    const res = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const remote = await res.json();

    if (remote && Number(remote.versionCode) > CURRENT_VERSION_CODE) {
      const updateDialog = document.querySelector("#update-dialog");
      if (updateDialog) {
        text("#update-modal-version", `FinFlow v${remote.version}`);
        text("#update-modal-notes", remote.notes || "Nova versão disponível com melhorias e correções.");
        text("#update-modal-date", remote.releasedAt ? formatDate(remote.releasedAt) : "Hoje");
        const downloadBtn = document.querySelector("#update-modal-download");
        if (downloadBtn) {
          downloadBtn.href = remote.apkUrl || "https://github.com/juanalenca/fin-flow/releases/latest/download/FinFlow-Release-Signed.apk";
        }
        updateDialog.showModal();
      }
    } else if (manual) {
      showToast(`Você já está na versão mais recente (v${CURRENT_APP_VERSION}).`);
    }
  } catch (err) {
    if (manual) {
      showToast("Não foi possível verificar atualizações no momento.");
    }
    console.warn("In-App update check:", err);
  }
}

/* ==========================================================================
   EVENT WIRING
   ========================================================================== */

function wireEvents() {
  // Open / Close Auth Dialog
  if (els.openAuthBtn) els.openAuthBtn.addEventListener("click", () => openAuthDialog());
  if (els.mobileAuthTrigger) {
    els.mobileAuthTrigger.addEventListener("click", () => {
      if (state.user) {
        showToast(`Conectado como ${state.user.email}`);
      } else {
        openAuthDialog();
      }
    });
  }
  if (els.closeAuth) els.closeAuth.addEventListener("click", () => els.authDialog.close());

  // Google Login
  if (els.googleAuthBtn) els.googleAuthBtn.addEventListener("click", handleGoogleAuth);

  // Update Dialog
  const updateModalLater = document.querySelector("#update-modal-later");
  if (updateModalLater) {
    updateModalLater.addEventListener("click", () => {
      document.querySelector("#update-dialog")?.close();
    });
  }

  // Auth Mode Tabs
  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setAuthMode(btn.dataset.authMode));
  });

  els.authForm.addEventListener("submit", handleAuthSubmit);
  if (els.logoutButton) els.logoutButton.addEventListener("click", handleLogout);

  // Settings
  els.toggleSettingsBtn.addEventListener("click", toggleSettings);
  els.settingsForm.addEventListener("submit", handleSettingsSubmit);

  // Filters
  els.presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });
  els.filtersForm.start.addEventListener("change", handleCustomDateChange);
  els.filtersForm.end.addEventListener("change", handleCustomDateChange);
  els.filtersForm.search.addEventListener("input", handleSearchInput);
  els.filtersForm.addEventListener("submit", (e) => e.preventDefault());

  // Views Navigation (Desktop & Mobile)
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Entry Modal Triggers (Desktop & Mobile)
  const triggerEntry = () => openEntryDialog();

  const openEntryDesktop = document.querySelector("#open-entry");
  if (openEntryDesktop) openEntryDesktop.addEventListener("click", triggerEntry);
  if (els.mobileOpenEntry) els.mobileOpenEntry.addEventListener("click", triggerEntry);

  document.querySelector("#close-entry").addEventListener("click", () => els.entryDialog.close());
  document.querySelector("#cancel-entry").addEventListener("click", () => els.entryDialog.close());
  els.entryForm.addEventListener("submit", handleEntrySubmit);
  els.deleteEntry.addEventListener("click", handleEntryDelete);

  // Budget Chips Selection
  els.budgetChips.forEach((chip) => {
    chip.addEventListener("click", () => setEntryBudget(chip.dataset.budget));
  });

  // VR Movement Kind Toggle
  els.vrSegmentBtns.forEach((btn) => {
    btn.addEventListener("click", () => setEntryKind(btn.dataset.kind));
  });

  // Quick Category Pills
  els.catPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      els.categoryInput.value = pill.dataset.cat;
      els.catPills.forEach((p) => p.classList.toggle("active", p === pill));
    });
  });

  // Confirm Modal
  els.confirmOk.addEventListener("click", () => {
    els.confirmDialog.close();
    if (confirmResolve) confirmResolve(true);
  });
  els.confirmCancel.addEventListener("click", () => {
    els.confirmDialog.close();
    if (confirmResolve) confirmResolve(false);
  });

  // Resize listener for charts
  window.addEventListener("resize", () => {
    if (state.summary && state.currentView === "overview") {
      renderCharts();
    }
  });
}

/* ==========================================================================
   AUTHENTICATION LOGIC (FIREBASE AUTH - EMAIL & GOOGLE)
   ========================================================================== */

function openAuthDialog(mode = "login") {
  setAuthMode(mode);
  els.authDialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authMode === mode);
  });

  if (mode === "register") {
    els.authModalTitle.textContent = "Criar nova conta";
    els.authModalSubtitle.textContent = "Comece seu controle financeiro no Firebase em segundos.";
    els.nameField.hidden = false;
    els.authSubmitBtn.querySelector("span").textContent = "Criar minha conta";
    els.authForm.password.autocomplete = "new-password";
  } else {
    els.authModalTitle.textContent = "Acesse sua conta";
    els.authModalSubtitle.textContent = "Sincronize seus dados financeiros com segurança no Firebase.";
    els.nameField.hidden = true;
    els.authSubmitBtn.querySelector("span").textContent = "Entrar no FinFlow";
    els.authForm.password.autocomplete = "current-password";
  }

  hideAlert(els.authMessage);
}

async function handleGoogleAuth() {
  hideAlert(els.authMessage);
  try {
    const isNative = Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
    const nativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;

    if (isNative) {
      if (!nativeAuth) {
        throw new Error("Módulo de autenticação nativa indisponível no dispositivo. Utilize login por E-mail e Senha.");
      }

      // Autenticação nativa oficial do Android / iOS (Janela de 1 toque nativa)
      let res;
      try {
        // Tenta fluxo com Credential Manager do Android
        res = await nativeAuth.signInWithGoogle();
      } catch (credErr) {
        console.warn("CredentialManager failed, tentando GoogleSignIn padrão:", credErr);
        // Tenta fallback com GoogleSignInClient clássico
        res = await nativeAuth.signInWithGoogle({ useCredentialManager: false });
      }
      
      if (res && res.credential && res.credential.idToken) {
        const credential = GoogleAuthProvider.credential(res.credential.idToken);
        const userCred = await signInWithCredential(auth, credential);
        const user = userCred.user;
        showToast(`Bem-vindo(a), ${user.displayName || user.email}!`);
        els.authDialog.close();
        return;
      } else if (res && res.user) {
        state.user = res.user;
        updateUserUI(res.user);
        await loadUserData();
        showToast(`Bem-vindo(a), ${res.user.displayName || res.user.email}!`);
        els.authDialog.close();
        return;
      } else {
        throw new Error("Não foi possível obter os dados da conta Google.");
      }
    }

    // Fluxo exclusivo para navegadores web (desktop / mobile browser)
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    showToast(`Bem-vindo(a), ${user.displayName || user.email}!`);
    els.authDialog.close();
  } catch (error) {
    console.error("Google Auth Error:", error);
    if (
      error.code === "auth/popup-closed-by-user" || 
      error.code === "auth/cancelled-popup-request" ||
      error.message?.includes("CANCELED") ||
      error.message?.includes("canceled") ||
      error.message?.includes("12501") // Google Sign-In user cancelled code
    ) {
      return;
    }
    let msg = "Erro ao autenticar com o Google.";
    if (error.message?.includes("No credentials available") || error.message?.includes("10:") || error.message?.includes("DEVELOPER_ERROR")) {
      msg = "Configuração do Google pendente no Firebase: O 'ID do Cliente Web' e a chave 'SHA-1' precisam ser vinculados no Firebase Console. Utilize o login por E-mail e Senha.";
    } else if (error.code === "auth/unauthorized-domain") {
      msg = "Domínio não autorizado pelo Firebase. Utilize login por E-mail e Senha.";
    } else if (error.code === "auth/operation-not-allowed") {
      msg = "O login com o Google precisa ser ativado no Firebase Console (Authentication > Sign-in method).";
    } else if (error.message) {
      msg = `${error.message} (${error.code || 'erro'})`;
    }
    showAlert(els.authMessage, msg);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  hideAlert(els.authMessage);

  const btn = els.authSubmitBtn;
  const btnSpan = btn.querySelector("span");
  const origText = btnSpan.textContent;
  btnSpan.textContent = "Processando...";
  btn.disabled = true;

  const data = Object.fromEntries(new FormData(els.authForm));
  const email = data.email.trim();
  const password = data.password;
  const name = data.name ? data.name.trim() : "";

  try {
    if (authMode === "register") {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      if (name && userCred.user) {
        await updateProfile(userCred.user, { displayName: name });
      }
      showToast(`Conta criada com sucesso! Bem-vindo(a), ${name || email}!`);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Login realizado com sucesso!");
    }
    els.authDialog.close();
    els.authForm.reset();
  } catch (error) {
    console.error("Firebase Auth Error:", error);
    let msg = "Erro ao autenticar. Verifique seus dados.";
    
    if (error.code === "auth/operation-not-allowed") {
      msg = "O método E-mail/Senha não está ativado no Firebase Console. Ative-o em Authentication > Sign-in method no projeto mapeamento-esportivo.";
    } else if (error.code === "auth/email-already-in-use") {
      msg = "Este e-mail já está cadastrado. Alterne para a aba 'Entrar'.";
    } else if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential" || error.code === "auth/user-not-found") {
      msg = "E-mail ou senha incorretos.";
    } else if (error.code === "auth/weak-password") {
      msg = "A senha deve ter pelo menos 6 caracteres.";
    } else if (error.code === "auth/invalid-email") {
      msg = "Formato de e-mail inválido.";
    } else if (error.message) {
      msg = `${error.message} (${error.code || 'erro'})`;
    }
    
    showAlert(els.authMessage, msg);
  } finally {
    btnSpan.textContent = origText;
    btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    showToast("Sessão finalizada.");
  } catch (error) {
    showToast("Erro ao deslogar.");
  }
}

function updateUserUI(user) {
  els.authUnloggedWidget.hidden = true;
  els.authLoggedWidget.hidden = false;

  const displayName = user.displayName || user.email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  els.userDisplayName.textContent = displayName;
  els.userEmail.textContent = user.email;
  els.userAvatarInitials.textContent = initial;

  if (els.mobileUserAvatar) {
    els.mobileUserAvatar.textContent = initial;
    els.mobileUserAvatar.style.background = "var(--primary)";
    els.mobileUserAvatar.style.color = "#070604";
  }
}

function updateGuestUI() {
  els.authUnloggedWidget.hidden = false;
  els.authLoggedWidget.hidden = true;

  if (els.mobileUserAvatar) {
    els.mobileUserAvatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    els.mobileUserAvatar.style.background = "var(--primary)";
    els.mobileUserAvatar.style.color = "#070604";
  }
}

/* ==========================================================================
   GUEST (LOCALSTORAGE) & CLOUD (FIRESTORE) DATA MANAGEMENT
   ========================================================================== */

function loadGuestData() {
  try {
    const savedSettings = localStorage.getItem("finflow_guest_settings");
    state.settings = savedSettings ? JSON.parse(savedSettings) : { monthly_income_cents: 0, vr_initial_balance_cents: 0 };

    const savedEntries = localStorage.getItem("finflow_guest_entries");
    state.rawEntries = savedEntries ? JSON.parse(savedEntries) : [];
  } catch (e) {
    state.settings = { monthly_income_cents: 0, vr_initial_balance_cents: 0 };
    state.rawEntries = [];
  }
  recalculateAndRender();
}

function saveGuestData() {
  try {
    localStorage.setItem("finflow_guest_settings", JSON.stringify(state.settings));
    localStorage.setItem("finflow_guest_entries", JSON.stringify(state.rawEntries));
  } catch (e) {
    console.warn("LocalStorage save error:", e);
  }
}

async function loadUserData() {
  if (!state.user) return;
  const uid = state.user.uid;

  unsubscribeUserData();

  try {
    // 1. Ouvinte em tempo real para configurações do usuário (Renda, Saldo VR)
    const settingsDocRef = doc(db, "users", uid, "settings", "config");
    unsubscribeSettings = onSnapshot(
      settingsDocRef,
      async (settingsSnap) => {
        if (settingsSnap.exists()) {
          state.settings = settingsSnap.data();
        } else {
          // Migração de configurações locais se existirem
          if (state.settings.monthly_income_cents > 0 || state.settings.vr_initial_balance_cents > 0) {
            await setDoc(settingsDocRef, { ...state.settings, updatedAt: new Date().toISOString() });
          }
        }
        recalculateAndRender();
      },
      (error) => {
        console.warn("Erro no listener em tempo real de configurações:", error);
      }
    );

    // 2. Ouvinte em tempo real para coleção de lançamentos (Entries)
    const entriesCol = collection(db, "users", uid, "entries");
    const entriesQuery = query(entriesCol, orderBy("date", "desc"));
    unsubscribeEntries = onSnapshot(
      entriesQuery,
      async (querySnapshot) => {
        state.rawEntries = [];
        querySnapshot.forEach((d) => {
          state.rawEntries.push({ id: d.id, ...d.data() });
        });

        // Migração de lançamentos locais de visitante se a nuvem estiver vazia
        const guestEntries = JSON.parse(localStorage.getItem("finflow_guest_entries") || "[]");
        if (guestEntries.length > 0 && state.rawEntries.length === 0) {
          for (const entry of guestEntries) {
            const { id, ...entryData } = entry;
            await addDoc(collection(db, "users", uid, "entries"), {
              ...entryData,
              createdAt: entryData.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
          localStorage.removeItem("finflow_guest_entries");
          showToast("Seus lançamentos locais foram sincronizados na nuvem!");
        }

        recalculateAndRender();
      },
      (error) => {
        console.error("Erro no listener em tempo real do Firestore:", error);
        showToast("Aviso: operando com dados locais / offline.");
      }
    );
  } catch (error) {
    console.error("Erro ao inicializar conexão com Firestore:", error);
    showToast("Aviso: operando com dados locais.");
  }
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  els.settingsMessage.textContent = "";

  try {
    const monthly_income_cents = parseMoney(els.settingsForm.monthly_income.value);
    const vr_initial_balance_cents = parseMoney(els.settingsForm.vr_initial.value);

    const body = {
      monthly_income_cents,
      vr_initial_balance_cents,
      updatedAt: new Date().toISOString(),
    };

    state.settings = body;

    if (state.user) {
      const settingsDocRef = doc(db, "users", state.user.uid, "settings", "config");
      await setDoc(settingsDocRef, body, { merge: true });
      showToast("Renda e VR sincronizados na nuvem!");
    } else {
      saveGuestData();
      showToast("Renda e VR salvos localmente!");
    }

    els.settingsMessage.textContent = "Alterações salvas!";
    setTimeout(() => {
      els.settingsMessage.textContent = "";
    }, 3000);

    recalculateAndRender();
  } catch (error) {
    els.settingsMessage.textContent = error.message;
    els.settingsMessage.style.color = "var(--danger)";
  }
}

function toggleSettings() {
  const isHidden = els.settingsForm.hidden;
  els.settingsForm.hidden = !isHidden;
  els.toggleSettingsText.textContent = isHidden ? "Ocultar bases" : "Editar bases";
  els.toggleSettingsIcon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
}

/* ==========================================================================
   ENTRY MODAL (ADD / EDIT) - CHIPS & VALIDATION
   ========================================================================== */

function openEntryDialog(entry = null) {
  els.entryForm.reset();
  hideAlert(els.entryMessage);
  els.catPills.forEach((p) => p.classList.remove("active"));

  els.entryDialogTitle.textContent = entry ? "Editar Lançamento" : "Novo Lançamento";
  els.deleteEntry.hidden = !entry;

  els.entryForm.id.value = entry?.id || "";
  
  const initialBudget = entry?.budget_type || (state.currentView in labels && !["overview", "entries"].includes(state.currentView) ? state.currentView : "needs");
  setEntryBudget(initialBudget);

  const initialKind = entry?.entry_kind || "expense";
  setEntryKind(initialKind);

  els.entryValueInput.value = entry ? formatInputMoney(entry.value_cents) : "";
  els.entryForm.description.value = entry?.description || "";
  els.entryForm.category.value = entry?.category || "";
  els.entryForm.date.value = entry?.date || toDateInput(new Date());
  els.entryForm.payment_method.value = entry?.payment_method || (initialBudget === "vr" ? "VR" : "Cartão de Crédito");
  els.entryForm.note.value = entry?.note || "";

  els.entryDialog.showModal();
}

function setEntryBudget(budget) {
  els.hiddenBudgetType.value = budget;
  els.budgetChips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.budget === budget);
  });

  const isVr = budget === "vr";
  els.vrKindWrapper.hidden = !isVr;
  if (!isVr) {
    setEntryKind("expense");
  }
}

function setEntryKind(kind) {
  els.hiddenEntryKind.value = kind;
  els.vrSegmentBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.kind === kind);
  });
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  hideAlert(els.entryMessage);

  const data = Object.fromEntries(new FormData(els.entryForm));

  try {
    const rawVal = data.value || els.entryValueInput.value;
    const value_cents = parseMoney(rawVal);
    if (!value_cents || value_cents <= 0) {
      throw new Error("Informe um valor maior que zero.");
    }

    const description = (data.description || "").trim();
    if (!description) {
      throw new Error("Informe a descrição do lançamento.");
    }

    const category = (data.category || "").trim() || "Geral";
    const payment_method = (data.payment_method || "").trim() || "Outros";
    const date = data.date || toDateInput(new Date());
    const budget_type = els.hiddenBudgetType.value || "needs";
    const entry_kind = els.hiddenEntryKind.value || "expense";
    const note = (data.note || "").trim();

    const payload = {
      budget_type,
      entry_kind,
      description,
      category,
      value_cents,
      date,
      payment_method,
      note,
      updatedAt: new Date().toISOString(),
    };

    const isEdit = Boolean(data.id);

    if (state.user) {
      const uid = state.user.uid;
      if (isEdit) {
        const entryRef = doc(db, "users", uid, "entries", data.id);
        await updateDoc(entryRef, payload);
        showToast("Lançamento atualizado na nuvem!");
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, "users", uid, "entries"), payload);
        showToast("Novo lançamento salvo na nuvem!");
      }
    } else {
      // LocalStorage fallback for guests / offline
      if (isEdit) {
        const idx = state.rawEntries.findIndex((e) => e.id === data.id);
        if (idx !== -1) state.rawEntries[idx] = { ...state.rawEntries[idx], ...payload };
        showToast("Lançamento atualizado localmente!");
      } else {
        payload.id = "local_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        payload.createdAt = new Date().toISOString();
        state.rawEntries.unshift(payload);
        showToast("Novo lançamento salvo!");
      }
      saveGuestData();
      recalculateAndRender();
    }

    els.entryDialog.close();
  } catch (error) {
    console.error("Erro ao salvar lançamento:", error);
    showAlert(els.entryMessage, error.message);
    showToast(error.message, 3500);
  }
}

async function handleEntryDelete() {
  const id = els.entryForm.id.value;
  if (!id) return;

  const confirmed = await showConfirm(
    "Excluir este lançamento?",
    "Esta ação removerá a movimentação permanentemente."
  );

  if (!confirmed) return;

  try {
    if (state.user && !id.startsWith("local_")) {
      await deleteDoc(doc(db, "users", state.user.uid, "entries", id));
    } else {
      state.rawEntries = state.rawEntries.filter((e) => e.id !== id);
      saveGuestData();
      recalculateAndRender();
    }

    els.entryDialog.close();
    showToast("Lançamento excluído com sucesso.");
  } catch (error) {
    showAlert(els.entryMessage, error.message);
    showToast(error.message, 3500);
  }
}

function showConfirm(title, desc) {
  els.confirmTitle.textContent = title;
  els.confirmDesc.textContent = desc;
  els.confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

/* ==========================================================================
   DATE PRESETS, FILTERS & CALCULATIONS
   ========================================================================== */

function defaultFilters() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateInput(start), end: toDateInput(end), search: "" };
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hydrateFilterFields() {
  els.filtersForm.start.value = state.filters.start;
  els.filtersForm.end.value = state.filters.end;
  els.filtersForm.search.value = state.filters.search;
}

function applyPreset(preset) {
  state.activePreset = preset;
  els.presetButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });

  const now = new Date();
  let start, end;

  if (preset === "current-month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (preset === "prev-month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === "last-30") {
    end = new Date();
    start = new Date();
    start.setDate(end.getDate() - 30);
  } else if (preset === "current-year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }

  if (start && end) {
    state.filters.start = toDateInput(start);
    state.filters.end = toDateInput(end);
    hydrateFilterFields();
    recalculateAndRender();
  }
}

function handleCustomDateChange() {
  state.activePreset = null;
  els.presetButtons.forEach((btn) => btn.classList.remove("active"));
  state.filters.start = els.filtersForm.start.value;
  state.filters.end = els.filtersForm.end.value;
  recalculateAndRender();
}

function handleSearchInput(e) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    state.filters.search = e.target.value.trim().toLowerCase();
    recalculateAndRender();
  }, 200);
}

/* ==========================================================================
   50/30/20 & VR FINANCIAL CALCULATION ENGINE
   ========================================================================== */

function recalculateAndRender() {
  const { start, end, search } = state.filters;

  // Filter entries based on date range and search term
  state.filteredEntries = state.rawEntries.filter((entry) => {
    if (start && entry.date < start) return false;
    if (end && entry.date > end) return false;
    if (search) {
      const matchDesc = (entry.description || "").toLowerCase().includes(search);
      const matchCat = (entry.category || "").toLowerCase().includes(search);
      const matchMethod = (entry.payment_method || "").toLowerCase().includes(search);
      if (!matchDesc && !matchCat && !matchMethod) return false;
    }
    return true;
  });

  // Calculate 50/30/20 & VR
  const incomeCents = state.settings.monthly_income_cents || 0;
  const vrInitialCents = state.settings.vr_initial_balance_cents || 0;

  const plannedNeeds = Math.round(incomeCents * 0.5);
  const plannedWants = Math.round(incomeCents * 0.3);
  const plannedSavings = Math.round(incomeCents * 0.2);

  let spentNeeds = 0;
  let spentWants = 0;
  let spentSavings = 0;
  let vrPeriodSpent = 0;
  let vrPeriodReceived = 0;

  // Aggregate period entries
  state.filteredEntries.forEach((entry) => {
    if (entry.budget_type === "needs" && entry.entry_kind === "expense") spentNeeds += entry.value_cents;
    else if (entry.budget_type === "wants" && entry.entry_kind === "expense") spentWants += entry.value_cents;
    else if (entry.budget_type === "savings" && entry.entry_kind === "expense") spentSavings += entry.value_cents;
    else if (entry.budget_type === "vr") {
      if (entry.entry_kind === "expense") vrPeriodSpent += entry.value_cents;
      else if (entry.entry_kind === "income") vrPeriodReceived += entry.value_cents;
    }
  });

  // Aggregate all-time VR balance
  let vrAllSpent = 0;
  let vrAllReceived = 0;
  state.rawEntries.forEach((entry) => {
    if (entry.budget_type === "vr") {
      if (entry.entry_kind === "expense") vrAllSpent += entry.value_cents;
      else if (entry.entry_kind === "income") vrAllReceived += entry.value_cents;
    }
  });
  const vrBalanceCents = vrInitialCents + vrAllReceived - vrAllSpent;

  const totalSpentCents = spentNeeds + spentWants + spentSavings;
  const availableCents = incomeCents - totalSpentCents;

  state.summary = {
    settings: state.settings,
    totals: {
      spent_cents: totalSpentCents,
      available_cents: availableCents,
    },
    budgets: {
      needs: {
        planned_cents: plannedNeeds,
        spent_cents: spentNeeds,
        remaining_cents: plannedNeeds - spentNeeds,
        usage_percent: plannedNeeds > 0 ? (spentNeeds / plannedNeeds) * 100 : 0,
      },
      wants: {
        planned_cents: plannedWants,
        spent_cents: spentWants,
        remaining_cents: plannedWants - spentWants,
        usage_percent: plannedWants > 0 ? (spentWants / plannedWants) * 100 : 0,
      },
      savings: {
        planned_cents: plannedSavings,
        spent_cents: spentSavings,
        remaining_cents: plannedSavings - spentSavings,
        usage_percent: plannedSavings > 0 ? (spentSavings / plannedSavings) * 100 : 0,
      },
    },
    vr: {
      initial_cents: vrInitialCents,
      received_cents: vrPeriodReceived,
      spent_cents: vrPeriodSpent,
      period_spent_cents: vrPeriodSpent,
      balance_cents: vrBalanceCents,
    },
  };

  render();
}

/* ==========================================================================
   RENDERERS & VIEWS
   ========================================================================= */

function setView(view) {
  state.currentView = view;

  // Update navigation items (Desktop & Mobile)
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  // Switch active panel
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("active"));
  const targetId = view === "overview" ? "overview-view" : view === "entries" ? "entries-view" : "category-view";
  const targetPanel = document.querySelector(`#${targetId}`);
  if (targetPanel) targetPanel.classList.add("active");

  // Update Desktop & Mobile Header Titles
  const viewTitle = labels[view] || "Visão Geral";
  const viewSubtitle = viewSubtitles[view] || "";
  text("#view-title", viewTitle);
  text("#view-subtitle", viewSubtitle);
  if (els.mobileViewTitle) text("#mobile-view-title", viewTitle);
  if (els.mobileViewSubtitle) text("#mobile-view-subtitle", viewSubtitle);

  render();
}

function render() {
  if (!state.summary) return;

  // Sync settings inputs
  els.settingsForm.monthly_income.value = formatInputMoney(state.settings.monthly_income_cents);
  els.settingsForm.vr_initial.value = formatInputMoney(state.settings.vr_initial_balance_cents);

  renderMetrics();
  renderBudgetBars();
  renderCharts();
  renderEntries();

  if (!["overview", "entries"].includes(state.currentView)) {
    renderCategory(state.currentView);
  }
}

function renderMetrics() {
  const summary = state.summary;
  text("#metric-income", money(summary.settings.monthly_income_cents));
  text("#metric-spent", money(summary.totals.spent_cents));
  text("#metric-available", money(summary.totals.available_cents));
  text("#metric-vr", money(summary.vr.balance_cents));

  const spentPct = summary.settings.monthly_income_cents > 0
    ? ((summary.totals.spent_cents / summary.settings.monthly_income_cents) * 100).toFixed(1)
    : 0;
  text("#metric-spent-pct", `${spentPct}% da renda comprometida`);
}

function renderBudgetBars() {
  const container = document.querySelector("#budget-bars");
  container.innerHTML = "";

  const keys = [
    { key: "needs", name: "50% Necessidades (Essencial)", fillClass: "fill-needs" },
    { key: "wants", name: "30% Desejos (Estilo / Lazer)", fillClass: "fill-wants" },
    { key: "savings", name: "20% Investimentos / Reserva", fillClass: "fill-savings" },
  ];

  keys.forEach(({ key, name, fillClass }) => {
    const budget = state.summary.budgets[key];
    const pct = Math.min(budget.usage_percent, 100);
    const isOver = budget.spent_cents > budget.planned_cents;
    const isNear = budget.usage_percent >= 85 && !isOver;
    const statusClass = isOver ? "status-over" : isNear ? "status-near" : "";

    container.insertAdjacentHTML(
      "beforeend",
      `<div class="budget-bar-item">
        <div class="budget-bar-header">
          <div class="budget-bar-name">
            <span class="nav-dot dot-${key}"></span>
            <span>${name}</span>
          </div>
          <div class="budget-bar-values">${money(budget.spent_cents)} de ${money(budget.planned_cents)}</div>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillClass} ${statusClass}" style="width: ${pct}%"></div>
        </div>
        <div class="budget-bar-footer">
          <span>${budget.usage_percent.toFixed(1)}% utilizado</span>
          <span>${isOver ? 'Excedido em ' + money(budget.spent_cents - budget.planned_cents) : 'Saldo restante: ' + money(budget.remaining_cents)}</span>
        </div>
      </div>`
    );
  });
}

function renderCharts() {
  try {
    drawDistributionChart(document.querySelector("#distribution-chart"));
  } catch (err) {
    console.error("Erro ao desenhar Gráfico de Distribuição:", err);
  }

  try {
    drawTimelineChart(document.querySelector("#timeline-chart"));
  } catch (err) {
    console.error("Erro ao desenhar Gráfico de Evolução:", err);
  }
}

function drawRoundedRect(ctx, x, y, w, h, r = 4) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
  }
}

function setChartEmptyState(canvas, isEmpty, title, description) {
  if (!canvas) return;
  const wrapper = canvas.closest(".canvas-wrapper");
  if (!wrapper) return;

  wrapper.classList.toggle("is-empty", isEmpty);
  let emptyState = wrapper.querySelector(".chart-empty-state");

  if (isEmpty) {
    if (!emptyState) {
      emptyState = document.createElement("div");
      emptyState.className = "chart-empty-state";
      wrapper.appendChild(emptyState);
    }
    emptyState.innerHTML = `
      <div class="chart-empty-icon" aria-hidden="true">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3v18h18"></path>
          <path d="M7 15h3v3H7z"></path>
          <path d="M12 11h3v7h-3z"></path>
          <path d="M17 7h3v11h-3z"></path>
        </svg>
      </div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>`;
  } else if (emptyState) {
    emptyState.remove();
  }
}

function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width) || (parent ? parent.clientWidth : 0) || 300, 260);
  const height = Number(canvas.getAttribute("height")) || 230;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reseta a matriz de transformação antes da escala para não acumular zoom
  ctx.scale(dpr, dpr);
  return { ctx, width, height };
}

function drawDistributionChart(canvas) {
  if (!canvas) return;
  const items = ["needs", "wants", "savings", "vr"].map((key) => ({
    key,
    label: labels[key],
    value: key === "vr" ? state.summary.vr.period_spent_cents : state.summary.budgets[key]?.spent_cents || 0,
  }));

  const total = items.reduce((sum, item) => sum + item.value, 0);
  setChartEmptyState(
    canvas,
    !total,
    "Sem gastos para distribuir",
    "Registre uma despesa ou ajuste o período para visualizar a divisão por orçamento."
  );
  if (!total) return;

  const canvasSetup = setupCanvas(canvas);
  if (!canvasSetup) return;
  const { ctx, width, height } = canvasSetup;
  ctx.clearRect(0, 0, width, height);

  const isMobile = width < 420;

  const cx = isMobile ? width * 0.5 : width * 0.32;
  const cy = isMobile ? 80 : height * 0.5;
  const outerRadius = isMobile ? 60 : Math.min(width, height) * 0.36;
  const innerRadius = outerRadius * 0.58;

  // Draw Slices
  let angle = -Math.PI / 2;
  items.forEach((item) => {
    if (!item.value) return;
    const slice = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, angle, angle + slice);
    ctx.arc(cx, cy, innerRadius, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = colors[item.key];
    ctx.fill();
    angle += slice;
  });

  // Center Total
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#57534E";
  ctx.font = "800 10px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText("TOTAL GASTO", cx, cy - 8);
  ctx.fillStyle = "#070604";
  ctx.font = "800 14px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(money(total), cx, cy + 10);

  // Legend List
  if (isMobile) {
    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const lx = col === 0 ? 16 : width * 0.52;
      const ly = 160 + row * 28;
      const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;

      ctx.fillStyle = colors[item.key];
      drawRoundedRect(ctx, lx, ly - 8, 8, 8, 2);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#070604";
      ctx.font = "700 11px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(`${item.label} (${pct}%)`, lx + 14, ly - 8);
      ctx.fillStyle = "#57534E";
      ctx.font = "600 10px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(money(item.value), lx + 14, ly + 6);
    });
  } else {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    items.forEach((item, index) => {
      const y = 38 + index * 38;
      const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;

      ctx.fillStyle = colors[item.key];
      drawRoundedRect(ctx, width * 0.60, y - 10, 10, 10, 3);

      ctx.fillStyle = "#070604";
      ctx.font = "800 12px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(`${item.label} (${pct}%)`, width * 0.60 + 16, y);

      ctx.fillStyle = "#57534E";
      ctx.font = "600 11px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(money(item.value), width * 0.60 + 16, y + 16);
    });
  }
}

function drawTimelineChart(canvas) {
  if (!canvas) return;
  const expenses = state.filteredEntries
    .filter((entry) => entry.entry_kind === "expense")
    .sort((a, b) => a.date.localeCompare(b.date));

  setChartEmptyState(
    canvas,
    !expenses.length,
    "Sem evolução no período",
    "Quando houver lançamentos, a curva acumulada aparecerá aqui sem ocupar espaço vazio."
  );
  if (!expenses.length) return;

  const canvasSetup = setupCanvas(canvas);
  if (!canvasSetup) return;
  const { ctx, width, height } = canvasSetup;
  ctx.clearRect(0, 0, width, height);

  const padLeft = 40;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 30;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  // Grid Lines
  ctx.strokeStyle = "#E5DFC9";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padTop + (chartHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
  }

  const totalsByDay = new Map();
  expenses.forEach((entry) => totalsByDay.set(entry.date, (totalsByDay.get(entry.date) || 0) + entry.value_cents));
  const points = [...totalsByDay.entries()].map(([date, value]) => ({ date, value }));

  let running = 0;
  points.forEach((point) => {
    running += point.value;
    point.total = running;
  });

  const max = Math.max(...points.map((point) => point.total), 1);

  // Draw Area Gradient (Gold Amber)
  const gradient = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
  gradient.addColorStop(0, "rgba(253, 183, 45, 0.35)");
  gradient.addColorStop(1, "rgba(253, 183, 45, 0.0)");

  ctx.beginPath();
  if (points.length === 1) {
    const y = height - padBottom - (points[0].total / max) * chartHeight;
    ctx.moveTo(padLeft, height - padBottom);
    ctx.lineTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.lineTo(width - padRight, height - padBottom);
  } else {
    points.forEach((point, index) => {
      const x = padLeft + (index / (points.length - 1)) * chartWidth;
      const y = height - padBottom - (point.total / max) * chartHeight;
      if (index === 0) {
        ctx.moveTo(x, height - padBottom);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(width - padRight, height - padBottom);
  }
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw Line
  ctx.strokeStyle = "#E5A324";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (points.length === 1) {
    const y = height - padBottom - (points[0].total / max) * chartHeight;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
  } else {
    points.forEach((point, index) => {
      const x = padLeft + (index / (points.length - 1)) * chartWidth;
      const y = height - padBottom - (point.total / max) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.stroke();

  // Draw Last Point Dot
  const lastPoint = points[points.length - 1];
  const lastX = width - padRight;
  const lastY = height - padBottom - (lastPoint.total / max) * chartHeight;
  ctx.fillStyle = "#E5A324";
  ctx.beginPath();
  ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#070604";
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
  ctx.fill();

  // Header stats
  ctx.textAlign = "left";
  ctx.fillStyle = "#57534E";
  ctx.font = "700 12px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(`Acumulado final: `, padLeft, 18);
  ctx.fillStyle = "#070604";
  ctx.font = "800 12px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(money(lastPoint.total), padLeft + 105, 18);
}

function renderCategory(key) {
  const summaryEl = document.querySelector("#category-summary");
  const listEl = document.querySelector("#category-list");
  const titleEl = document.querySelector("#category-list-title");

  summaryEl.innerHTML = "";
  listEl.innerHTML = "";
  if (titleEl) titleEl.textContent = `Lançamentos de ${labels[key] || key}`;

  if (key === "vr") {
    const vr = state.summary.vr;
    summaryEl.insertAdjacentHTML(
      "beforeend",
      `<div class="category-summary-title">Resumo da Carteira VR</div>
      <div class="category-kpi-grid">
        <div class="kpi-tile"><span>Saldo Inicial</span><strong>${money(vr.initial_cents)}</strong></div>
        <div class="kpi-tile"><span>Total Recebido</span><strong style="color:var(--success)">+${money(vr.received_cents)}</strong></div>
        <div class="kpi-tile"><span>Total Gasto</span><strong style="color:var(--danger)">-${money(vr.spent_cents)}</strong></div>
        <div class="kpi-tile"><span>Saldo Atual</span><strong style="color:var(--primary-dark)">${money(vr.balance_cents)}</strong></div>
      </div>`
    );
  } else {
    const budget = state.summary.budgets[key] || { planned_cents: 0, spent_cents: 0, remaining_cents: 0, usage_percent: 0 };
    summaryEl.insertAdjacentHTML(
      "beforeend",
      `<div class="category-summary-title">Resumo - ${labels[key]}</div>
      <div class="category-kpi-grid">
        <div class="kpi-tile"><span>Planejado (${key === 'needs' ? '50%' : key === 'wants' ? '30%' : '20%'})</span><strong>${money(budget.planned_cents)}</strong></div>
        <div class="kpi-tile"><span>Realizado</span><strong>${money(budget.spent_cents)}</strong></div>
        <div class="kpi-tile"><span>Saldo Restante</span><strong style="color:${budget.remaining_cents >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(budget.remaining_cents)}</strong></div>
        <div class="kpi-tile"><span>% Utilizado</span><strong>${budget.usage_percent.toFixed(1)}%</strong></div>
      </div>`
    );
  }

  const filtered = state.filteredEntries.filter((entry) => entry.budget_type === key);
  renderEntryList(listEl, filtered);
}

function renderEntries() {
  const listEl = document.querySelector("#entries-list");
  renderEntryList(listEl, state.filteredEntries);

  const total = state.filteredEntries
    .filter((entry) => entry.entry_kind === "expense")
    .reduce((sum, entry) => sum + entry.value_cents, 0);
  text("#entries-total", money(total));
}

function renderEntryList(container, entries) {
  container.innerHTML = "";
  if (!entries || !entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <p>Nenhuma movimentação encontrada para o período selecionado.</p>
      </div>`;
    return;
  }

  entries.forEach((entry) => {
    const isIncome = entry.entry_kind === "income";
    const sign = isIncome ? "+" : "-";
    const amountClass = isIncome ? "amount-income" : "amount-expense";
    const badgeMap = {
      needs: { label: "50%", cls: "badge-needs" },
      wants: { label: "30%", cls: "badge-wants" },
      savings: { label: "20%", cls: "badge-savings" },
      vr: { label: "VR", cls: "badge-vr" },
    };
    const badge = badgeMap[entry.budget_type] || { label: "R$", cls: "badge-needs" };
    const noteText = entry.note ? `<span class="entry-tag-item">Obs: ${escapeHtml(entry.note)}</span>` : "";

    container.insertAdjacentHTML(
      "beforeend",
      `<article class="entry-card">
        <div class="entry-left">
          <div class="entry-badge-icon ${badge.cls}">${badge.label}</div>
          <div class="entry-info">
            <div class="entry-title">${escapeHtml(entry.description)}</div>
            <div class="entry-tags">
              <span class="entry-tag-item">${formatDate(entry.date)}</span>
              <span class="entry-tag-item">${escapeHtml(entry.category)}</span>
              <span class="entry-tag-item">${escapeHtml(entry.payment_method)}</span>
              ${noteText}
            </div>
          </div>
        </div>
        <div class="entry-right">
          <div class="entry-amount ${amountClass}">${sign} ${money(entry.value_cents)}</div>
          <button class="btn btn-secondary btn-sm" type="button" data-edit="${entry.id}">
            Editar
          </button>
        </div>
      </article>`
    );
  });

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = state.rawEntries.find((item) => item.id === btn.dataset.edit);
      if (entry) openEntryDialog(entry);
    });
  });
}

/* ==========================================================================
   REAL-TIME CURRENCY MASKING
   ========================================================================== */

function setupCurrencyMasks() {
  const currencyInputs = [
    els.settingsForm.monthly_income,
    els.settingsForm.vr_initial,
    els.entryValueInput,
  ];

  currencyInputs.forEach((input) => {
    if (!input) return;
    input.addEventListener("input", (e) => {
      let value = e.target.value.replace(/\D/g, "");
      if (!value) {
        e.target.value = "";
        return;
      }
      const cents = parseInt(value, 10);
      e.target.value = formatInputMoney(cents);
    });
  });
}

/* ==========================================================================
   UTILITY HELPERS & AUTO-DISMISSING TOAST
   ========================================================================== */

function parseMoney(value) {
  if (typeof value === "number") return Math.round(value);
  let raw = String(value || "").trim().replace(/\s/g, "").replace("R$", "");
  if (!raw) return 0;
  
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }
  
  const number = Number(raw);
  if (Number.isNaN(number) || number < 0) {
    throw new Error("Informe um valor numérico válido.");
  }
  return Math.round(number * 100);
}

function money(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

function formatInputMoney(cents) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function text(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, duration = 3000) {
  els.toastText.textContent = message;
  els.toast.hidden = false;
  els.toast.classList.remove("toast-fade-out");

  clearTimeout(toastTimeout);
  clearTimeout(toastFadeTimeout);

  toastFadeTimeout = setTimeout(() => {
    els.toast.classList.add("toast-fade-out");
  }, Math.max(duration - 350, 1000));

  toastTimeout = setTimeout(() => {
    els.toast.hidden = true;
    els.toast.classList.remove("toast-fade-out");
  }, duration);
}

function showAlert(el, msg) {
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el.timeout);
  el.timeout = setTimeout(() => {
    hideAlert(el);
  }, 5000);
}

function hideAlert(el) {
  el.hidden = true;
  el.textContent = "";
}

