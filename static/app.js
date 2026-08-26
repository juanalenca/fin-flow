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

const CURRENT_APP_VERSION = "1.0.4";
const CURRENT_VERSION_CODE = 4;

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

  // Fechamento ao clicar fora do card (no backdrop escuro)
  [els.authDialog, els.entryDialog, els.confirmDialog, document.querySelector("#update-dialog")].forEach((dialog) => {
    if (!dialog) return;
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.close();
      }
    });
  });

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

  const mobileDockNewBtn = document.querySelector("#mobile-dock-new-btn");
  if (mobileDockNewBtn) mobileDockNewBtn.addEventListener("click", triggerEntry);

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
    renderDistributionChart();
  } catch (err) {
    console.error("Erro ao renderizar Gráfico de Distribuição:", err);
  }

  try {
    renderTimelineChart();
  } catch (err) {
    console.error("Erro ao renderizar Gráfico de Evolução:", err);
  }
}

function renderDistributionChart() {
  const container = document.querySelector("#distribution-chart-wrap");
  if (!container) return;

  const items = [
    { key: "needs", label: labels.needs, color: colors.needs, value: state.summary?.budgets?.needs?.spent_cents || 0 },
    { key: "wants", label: labels.wants, color: colors.wants, value: state.summary?.budgets?.wants?.spent_cents || 0 },
    { key: "savings", label: labels.savings, color: colors.savings, value: state.summary?.budgets?.savings?.spent_cents || 0 },
    { key: "vr", label: labels.vr, color: colors.vr, value: state.summary?.vr?.period_spent_cents || 0 },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (!total) {
    container.innerHTML = `
      <div class="chart-empty-state">
        <div class="chart-empty-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
            <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
          </svg>
        </div>
        <strong>Sem gastos no período</strong>
        <span>Adicione despesas neste mês para visualizar a divisão percentual dos seus gastos.</span>
      </div>`;
    return;
  }

  // Geração das fatias do Donut em SVG vetorial de alta definição
  const size = 200;
  const cx = 100;
  const cy = 100;
  const rOuter = 82;
  const rInner = 54;

  let currentAngle = -Math.PI / 2;
  const paths = [];

  items.forEach((item) => {
    if (!item.value) return;
    const sliceAngle = (item.value / total) * Math.PI * 2;
    const endAngle = currentAngle + sliceAngle;

    const x1Outer = cx + rOuter * Math.cos(currentAngle);
    const y1Outer = cy + rOuter * Math.sin(currentAngle);
    const x2Outer = cx + rOuter * Math.cos(endAngle);
    const y2Outer = cy + rOuter * Math.sin(endAngle);

    const x1Inner = cx + rInner * Math.cos(endAngle);
    const y1Inner = cy + rInner * Math.sin(endAngle);
    const x2Inner = cx + rInner * Math.cos(currentAngle);
    const y2Inner = cy + rInner * Math.sin(currentAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1Outer.toFixed(2)} ${y1Outer.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer.toFixed(2)} ${y2Outer.toFixed(2)}`,
      `L ${x1Inner.toFixed(2)} ${y1Inner.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2Inner.toFixed(2)} ${y2Inner.toFixed(2)}`,
      "Z",
    ].join(" ");

    paths.push(`<path d="${d}" fill="${item.color}" class="donut-slice" />`);
    currentAngle = endAngle;
  });

  const legendHtml = items
    .map((item) => {
      const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
      return `
        <div class="donut-legend-item">
          <div class="donut-legend-left">
            <span class="donut-legend-dot" style="background:${item.color}"></span>
            <span class="donut-legend-name">${escapeHtml(item.label)}</span>
            <span class="donut-legend-pct">${pct}%</span>
          </div>
          <strong class="donut-legend-val">${money(item.value)}</strong>
        </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="donut-layout-wrap">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="donut-svg" aria-label="Gráfico de Distribuição">
          ${paths.join("")}
          <text x="${cx}" y="${cy - 7}" text-anchor="middle" class="donut-center-label">TOTAL GASTO</text>
          <text x="${cx}" y="${cy + 13}" text-anchor="middle" class="donut-center-val">${money(total)}</text>
        </svg>
      </div>
      <div class="donut-legend-grid">
        ${legendHtml}
      </div>
    </div>`;
}

function renderTimelineChart() {
  const container = document.querySelector("#timeline-chart-wrap");
  if (!container) return;

  const expenses = state.filteredEntries
    .filter((entry) => entry.entry_kind === "expense")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!expenses.length) {
    container.innerHTML = `
      <div class="chart-empty-state">
        <div class="chart-empty-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </div>
        <strong>Sem evolução no período</strong>
        <span>A curva de gastos acumulados aparecerá assim que você registrar despesas no período.</span>
      </div>`;
    return;
  }

  const totalsByDay = new Map();
  expenses.forEach((entry) => {
    totalsByDay.set(entry.date, (totalsByDay.get(entry.date) || 0) + entry.value_cents);
  });
  const points = [...totalsByDay.entries()].map(([date, value]) => ({ date, value }));

  let running = 0;
  points.forEach((point) => {
    running += point.value;
    point.total = running;
  });

  const max = Math.max(...points.map((p) => p.total), 1);
  const finalTotal = points[points.length - 1].total;

  const svgWidth = 600;
  const svgHeight = 200;
  const padL = 60;
  const padR = 25;
  const padT = 25;
  const padB = 25;
  const innerW = svgWidth - padL - padR;
  const innerH = svgHeight - padT - padB;

  // Linhas de Grade e Eixo Y
  const gridLines = [0, 1, 2, 3]
    .map((i) => {
      const y = padT + (innerH / 3) * i;
      const val = Math.round(max - (max / 3) * i);
      return `
        <line x1="${padL}" y1="${y}" x2="${svgWidth - padR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" />
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="timeline-axis-label">${money(val)}</text>
      `;
    })
    .join("");

  // Cálculo das Coordenadas dos Pontos
  const coords = points.map((p, idx) => {
    const x = points.length === 1 ? padL + innerW / 2 : padL + (idx / (points.length - 1)) * innerW;
    const y = padT + innerH - (p.total / max) * innerH;
    return { x, y, date: p.date, total: p.total };
  });

  let areaPath = "";
  let linePath = "";

  if (coords.length === 1) {
    const pt = coords[0];
    areaPath = `M ${padL} ${padT + innerH} L ${padL} ${pt.y.toFixed(1)} L ${svgWidth - padR} ${pt.y.toFixed(1)} L ${svgWidth - padR} ${padT + innerH} Z`;
    linePath = `M ${padL} ${pt.y.toFixed(1)} L ${svgWidth - padR} ${pt.y.toFixed(1)}`;
  } else {
    const first = coords[0];
    const last = coords[coords.length - 1];
    const lineSegs = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    linePath = lineSegs;
    areaPath = `${lineSegs} L ${last.x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${first.x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
  }

  const lastCoord = coords[coords.length - 1];

  container.innerHTML = `
    <div class="timeline-chart-card-inner">
      <div class="timeline-header-info">
        <span class="timeline-header-subtitle">Acumulado do Período:</span>
        <strong class="timeline-header-total">${money(finalTotal)}</strong>
      </div>
      <div class="timeline-svg-wrapper">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" class="timeline-svg" aria-label="Gráfico de Evolução">
          <defs>
            <linearGradient id="timelineGoldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#FDB72D" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#FDB72D" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          ${gridLines}
          <path d="${areaPath}" fill="url(#timelineGoldGrad)" />
          <path d="${linePath}" fill="none" stroke="#E5A324" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="${lastCoord.x.toFixed(1)}" cy="${lastCoord.y.toFixed(1)}" r="6" fill="#E5A324" />
          <circle cx="${lastCoord.x.toFixed(1)}" cy="${lastCoord.y.toFixed(1)}" r="3" fill="#070604" />
        </svg>
      </div>
    </div>`;
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
      <div class="chart-empty-state">
        <div class="chart-empty-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
        </div>
        <strong>Nenhum lançamento no período</strong>
        <span>Adicione despesas ou receitas para acompanhar suas movimentações em tempo real.</span>
      </div>`;
    return;
  }

  // Ordena por data decrescente
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  // Agrupamento por dia
  const groups = new Map();
  sorted.forEach((entry) => {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

  const badgeMap = {
    needs: { label: "50%", cls: "badge-needs" },
    wants: { label: "30%", cls: "badge-wants" },
    savings: { label: "20%", cls: "badge-savings" },
    vr: { label: "VR", cls: "badge-vr" },
  };

  groups.forEach((dayEntries, dateStr) => {
    let dateLabel = formatDate(dateStr);
    if (dateStr === todayStr) dateLabel = "Hoje";
    else if (dateStr === yesterdayStr) dateLabel = "Ontem";

    const dayTotal = dayEntries.reduce((sum, e) => (e.entry_kind === "expense" ? sum + e.value_cents : sum - e.value_cents), 0);

    const rowsHtml = dayEntries
      .map((entry) => {
        const isIncome = entry.entry_kind === "income";
        const sign = isIncome ? "+" : "-";
        const valClass = isIncome ? "val-income" : "val-expense";
        const badge = badgeMap[entry.budget_type] || { label: "R$", cls: "badge-needs" };
        const noteText = entry.note ? `<span>Obs: ${escapeHtml(entry.note)}</span>` : "";

        return `
          <div class="entry-row-card">
            <div class="entry-row-left">
              <div class="entry-type-icon-badge ${badge.cls}">${badge.label}</div>
              <div class="entry-row-details">
                <strong class="entry-row-desc">${escapeHtml(entry.description)}</strong>
                <div class="entry-row-meta-tags">
                  <span>${escapeHtml(entry.category)}</span>
                  <span>•</span>
                  <span>${escapeHtml(entry.payment_method)}</span>
                  ${noteText ? '<span>•</span>' + noteText : ''}
                </div>
              </div>
            </div>
            <div class="entry-row-right">
              <span class="entry-row-value ${valClass}">${sign} ${money(entry.value_cents)}</span>
              <div class="entry-row-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-edit="${entry.id}">Editar</button>
              </div>
            </div>
          </div>`;
      })
      .join("");

    container.insertAdjacentHTML(
      "beforeend",
      `<div class="entry-group-block">
        <div class="entry-group-header">
          <span class="entry-group-date-badge">${dateLabel}</span>
          <span class="entry-group-subtotal">${dayTotal >= 0 ? money(dayTotal) : `+ ${money(Math.abs(dayTotal))}`}</span>
        </div>
        ${rowsHtml}
      </div>`
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

