/* ==========================================================================
   FINFLOW - FIREBASE CONTROLLER & STATE MANAGEMENT (SDK v12 MODULAR)
   Gestão Financeira Inteligente 50/30/20 & Objetivos Financeiros
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
import {
  BUDGET_KEYS,
  budgetFromIncome,
  calculateGoalStatus,
  calculateMonthlyBudget,
  monthKeyFromDate,
  splitEqually,
} from "./financial-engine.js";

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
  goals: "Objetivos",
};

const viewSubtitles = {
  overview: "Acompanhe seu fluxo de caixa mensal, gestão dinâmica e distribuição do orçamento.",
  needs: "Gastos essenciais como moradia, alimentação básica, contas e saúde (limite de 50%).",
  wants: "Gastos com estilo de vida, lazer, hobbies, restaurantes e compras (limite de 30%).",
  savings: "Aportes para reserva de emergência, metas de médio prazo e investimentos (mínimo de 20%).",
  vr: "Controle específico de saldo, recebimentos e gastos do seu Vale-Refeição/Alimentação.",
  entries: "Histórico detalhado e extrato de todas as transações cadastradas.",
  goals: "Acompanhe objetivos, metas de longo prazo e ritmo de aportes dos seus planos.",
};

const colors = {
  needs: "#10B981",
  wants: "#F59E0B",
  savings: "#3B82F6",
  vr: "#EC4899",
};

/* Application State */
const state = {
  user: null,
  settings: {
    monthly_income_cents: 0,
    vr_initial_balance_cents: 0,
    budget_goals_cents: { needs: 0, wants: 0 },
  },
  months: {},
  deficits: [],
  goals: [],
  transfers: [],
  rawEntries: [],
  filteredEntries: [],
  summary: null,
  currentView: "overview",
  filters: defaultFilters(),
  activePreset: "current-month",
};

/* DOM Elements Object */
let els = {};

function initDOM() {
  els = {
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

    // Dynamic Workspace & Goals
    dynamicWorkspace: document.querySelector("#dynamic-workspace"),
    goalsView: document.querySelector("#goals-view"),
    goalsList: document.querySelector("#goals-list"),
    goalsForm: document.querySelector("#goal-form"),

    // Filters
    filtersForm: document.querySelector("#filters-form"),
    presetButtons: document.querySelectorAll("[data-preset]"),

    // Entry Dialog
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
}

let authMode = "login";
let searchDebounceTimer = null;
let toastTimeout = null;
let toastFadeTimeout = null;
let confirmResolve = null;
let unsubscribeSettings = null;
let unsubscribeEntries = null;
let unsubscribeMonths = null;
let unsubscribeDeficits = null;
let unsubscribeGoals = null;
let unsubscribeTransfers = null;

/* ==========================================================================
   INITIALIZATION & AUTO-UPDATES
   ========================================================================== */

const CURRENT_APP_VERSION = "1.0.9";
const CURRENT_VERSION_CODE = 9;

function initApp() {
  initDOM();
  initLiveUpdates();
  setupEventListeners();
  setupCurrencyMasks();
  initAuthObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

async function initLiveUpdates() {
  if (!window.Capacitor?.isNativePlatform()) return;

  try {
    const { CapacitorUpdater } = window.Capacitor.Plugins || {};
    if (!CapacitorUpdater) return;

    CapacitorUpdater.notifyAppReady();

    const response = await fetch("https://fin-flow-app.web.app/version.json", {
      cache: "no-store",
    });
    if (!response.ok) return;

    const remoteInfo = await response.json();
    if (remoteInfo.versionCode > CURRENT_VERSION_CODE || isNewerVersion(remoteInfo.version, CURRENT_APP_VERSION)) {
      showUpdateDialog(remoteInfo);
    }
  } catch (err) {
    console.warn("Verificação de Live Update:", err);
  }
}

function isNewerVersion(remote, local) {
  const r = remote.split(".").map(Number);
  const l = local.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

function showUpdateDialog(updateInfo) {
  const updateDialog = document.querySelector("#update-dialog");
  if (!updateDialog) return;

  const versionEl = document.querySelector("#update-modal-version");
  const notesEl = document.querySelector("#update-modal-notes");
  const dateEl = document.querySelector("#update-modal-date");
  const downloadBtn = document.querySelector("#update-modal-download");

  if (versionEl) versionEl.textContent = `FinFlow v${updateInfo.version}`;
  if (notesEl) notesEl.textContent = updateInfo.notes || "Melhorias de desempenho e novas funcionalidades.";
  if (dateEl) dateEl.textContent = updateInfo.releasedAt || "Hoje";
  if (downloadBtn) downloadBtn.href = updateInfo.apkUrl;

  updateDialog.showModal();
}

/* ==========================================================================
   EVENT LISTENERS SETUP
   ========================================================================== */

function setupEventListeners() {
  // Settings Accordion Toggle
  if (els.toggleSettingsBtn) {
    els.toggleSettingsBtn.addEventListener("click", () => {
      const isHidden = els.settingsForm.hidden;
      els.settingsForm.hidden = !isHidden;
      if (els.toggleSettingsText) els.toggleSettingsText.textContent = isHidden ? "Ocultar Bases" : "Ajustar Bases";
      if (els.toggleSettingsIcon) els.toggleSettingsIcon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
    });
  }

  if (els.settingsForm) {
    els.settingsForm.addEventListener("submit", handleSettingsSubmit);
  }

  // Filters Events
  if (els.filtersForm) {
    els.filtersForm.addEventListener("submit", (e) => e.preventDefault());
    
    const startInput = els.filtersForm.querySelector('input[name="start_date"], input[name="start"]');
    const endInput = els.filtersForm.querySelector('input[name="end_date"], input[name="end"]');
    const searchInput = els.filtersForm.querySelector('input[name="search"]');

    if (startInput) startInput.addEventListener("change", handleCustomDateChange);
    if (endInput) endInput.addEventListener("change", handleCustomDateChange);
    if (searchInput) searchInput.addEventListener("input", handleSearchInput);
  }

  if (els.presetButtons) {
    els.presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => handlePresetChange(btn.dataset.preset));
    });
  }

  // Auth Triggers
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
  if (els.closeAuth) els.closeAuth.addEventListener("click", () => els.authDialog?.close());

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

  if (els.authForm) els.authForm.addEventListener("submit", handleAuthSubmit);
  if (els.logoutButton) els.logoutButton.addEventListener("click", handleLogout);

  // Views Navigation (Desktop & Mobile)
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Goals Form
  if (els.goalsForm) els.goalsForm.addEventListener("submit", handleGoalSubmit);

  // Entry Modal Triggers (Desktop & Mobile)
  const triggerEntry = () => openEntryDialog();

  const openEntryDesktop = document.querySelector("#open-entry");
  if (openEntryDesktop) openEntryDesktop.addEventListener("click", triggerEntry);
  if (els.mobileOpenEntry) els.mobileOpenEntry.addEventListener("click", triggerEntry);

  const mobileDockNewBtn = document.querySelector("#mobile-dock-new-btn");
  if (mobileDockNewBtn) mobileDockNewBtn.addEventListener("click", triggerEntry);

  document.querySelector("#close-entry")?.addEventListener("click", () => els.entryDialog?.close());
  document.querySelector("#cancel-entry")?.addEventListener("click", () => els.entryDialog?.close());
  if (els.entryForm) els.entryForm.addEventListener("submit", handleEntrySubmit);
  if (els.deleteEntry) els.deleteEntry.addEventListener("click", handleEntryDelete);

  // Budget Chips Selection
  if (els.budgetChips) {
    els.budgetChips.forEach((chip) => {
      chip.addEventListener("click", () => setEntryBudget(chip.dataset.budget));
    });
  }

  // VR Movement Kind Toggle
  if (els.vrSegmentBtns) {
    els.vrSegmentBtns.forEach((btn) => {
      btn.addEventListener("click", () => setEntryKind(btn.dataset.kind));
    });
  }

  // Quick Category Pills
  if (els.catPills) {
    els.catPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        if (els.categoryInput) els.categoryInput.value = pill.dataset.cat;
        els.catPills.forEach((p) => p.classList.toggle("active", p === pill));
      });
    });
  }

  // Confirm Modal
  if (els.confirmOk) {
    els.confirmOk.addEventListener("click", () => {
      els.confirmDialog?.close();
      if (confirmResolve) confirmResolve(true);
    });
  }
  if (els.confirmCancel) {
    els.confirmCancel.addEventListener("click", () => {
      els.confirmDialog?.close();
      if (confirmResolve) confirmResolve(false);
    });
  }

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
  els.authDialog?.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authMode === mode);
  });

  if (mode === "register") {
    if (els.authModalTitle) els.authModalTitle.textContent = "Crie sua conta";
    if (els.authModalSubtitle) els.authModalSubtitle.textContent = "Comece sua jornada de gestão financeira inteligente";
    if (els.authSubmitBtn) els.authSubmitBtn.querySelector("span").textContent = "Criar conta";
    if (els.nameField) els.nameField.hidden = false;
  } else {
    if (els.authModalTitle) els.authModalTitle.textContent = "Acesse sua conta";
    if (els.authModalSubtitle) els.authModalSubtitle.textContent = "Sincronize seus dados com segurança na nuvem";
    if (els.authSubmitBtn) els.authSubmitBtn.querySelector("span").textContent = "Entrar no FinFlow";
    if (els.nameField) els.nameField.hidden = true;
  }
  hideAlert(els.authMessage);
}

function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    renderUserWidget(user);

    if (user) {
      initFirestoreListeners(user);
    } else {
      cleanupListeners();
      loadGuestData();
    }
  });
}

function renderUserWidget(user) {
  if (user) {
    if (els.authUnloggedWidget) els.authUnloggedWidget.hidden = true;
    if (els.authLoggedWidget) els.authLoggedWidget.hidden = false;
    if (els.userDisplayName) els.userDisplayName.textContent = user.displayName || user.email.split("@")[0];
    if (els.userEmail) els.userEmail.textContent = user.email;

    const initial = (user.displayName || user.email)[0].toUpperCase();
    if (els.userAvatarInitials) els.userAvatarInitials.textContent = initial;

    if (els.mobileUserAvatar) {
      els.mobileUserAvatar.textContent = initial;
      els.mobileUserAvatar.classList.remove("avatar-guest");
    }
  } else {
    if (els.authUnloggedWidget) els.authUnloggedWidget.hidden = false;
    if (els.authLoggedWidget) els.authLoggedWidget.hidden = true;
    if (els.mobileUserAvatar) {
      els.mobileUserAvatar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      els.mobileUserAvatar.classList.add("avatar-guest");
    }
  }
}

async function handleGoogleAuth() {
  hideAlert(els.authMessage);
  try {
    if (window.Capacitor?.isNativePlatform()) {
      const { FirebaseAuthentication } = window.Capacitor.Plugins || {};
      if (FirebaseAuthentication) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (idToken) {
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
          showToast(`Conectado como ${auth.currentUser.displayName || auth.currentUser.email}!`);
          els.authDialog?.close();
          return;
        }
        if (result.user) {
          showToast(`Conectado como ${result.user.displayName || result.user.email}!`);
          els.authDialog?.close();
          return;
        }
      }
    }

    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    showToast(`Bem-vindo(a), ${user.displayName || user.email}!`);
    els.authDialog?.close();
  } catch (error) {
    console.error("Google Auth Error:", error);
    if (
      error.code === "auth/popup-closed-by-user" ||
      error.code === "auth/cancelled-popup-request" ||
      error.message?.includes("CANCELED") ||
      error.message?.includes("canceled") ||
      error.message?.includes("12501")
    ) {
      return;
    }
    let msg = "Erro ao autenticar com o Google.";
    if (error.code === "auth/unauthorized-domain") {
      msg = "Domínio não autorizado pelo Firebase. Utilize login por E-mail e Senha ou adicione fin-flow-app.web.app nos domínios autorizados.";
    } else if (error.code === "auth/operation-not-allowed") {
      msg = "O login com o Google precisa ser ativado no Firebase Console (Authentication > Sign-in method).";
    } else if (error.message) {
      msg = `${error.message} (${error.code || "erro"})`;
    }
    showAlert(els.authMessage, msg);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  hideAlert(els.authMessage);

  const btn = els.authSubmitBtn;
  const btnSpan = btn?.querySelector("span");
  const origText = btnSpan?.textContent || "Entrar";
  if (btnSpan) btnSpan.textContent = "Processando...";
  if (btn) btn.disabled = true;

  const data = Object.fromEntries(new FormData(els.authForm));
  const email = (data.email || "").trim();
  const password = data.password;

  try {
    if (authMode === "register") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (data.name?.trim()) {
        await updateProfile(cred.user, { displayName: data.name.trim() });
      }
      showToast("Conta criada com sucesso!");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Sessão iniciada com sucesso!");
    }
    els.authForm?.reset();
    els.authDialog?.close();
  } catch (err) {
    console.error(err);
    let msg = "Erro ao processar autenticação.";
    if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      msg = "E-mail ou senha incorretos.";
    } else if (err.code === "auth/email-already-in-use") {
      msg = "Este e-mail já está cadastrado. Faça login.";
    } else if (err.code === "auth/weak-password") {
      msg = "A senha deve ter pelo menos 6 caracteres.";
    } else if (err.code === "auth/invalid-email") {
      msg = "Formato de e-mail inválido.";
    }
    showAlert(els.authMessage, msg);
  } finally {
    if (btnSpan) btnSpan.textContent = origText;
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  const confirmed = await showConfirm("Deseja sair da conta?", "Seus dados continuarão salvos e seguros no Firebase.");
  if (confirmed) {
    await signOut(auth);
    showToast("Você saiu da sua conta.");
  }
}

/* ==========================================================================
   FIRESTORE REALTIME SYNC & LOCAL DATA
   ========================================================================== */

function cleanupListeners() {
  if (unsubscribeSettings) unsubscribeSettings();
  if (unsubscribeEntries) unsubscribeEntries();
  if (unsubscribeMonths) unsubscribeMonths();
  if (unsubscribeDeficits) unsubscribeDeficits();
  if (unsubscribeGoals) unsubscribeGoals();
  if (unsubscribeTransfers) unsubscribeTransfers();
}

function loadGuestData() {
  const savedSettings = localStorage.getItem("finflow_guest_settings");
  const savedEntries = localStorage.getItem("finflow_guest_entries");
  const savedDynamic = JSON.parse(localStorage.getItem("finflow_guest_dynamic") || "{}");

  if (savedSettings || savedEntries || savedDynamic.goals) {
    state.settings = savedSettings ? JSON.parse(savedSettings) : { monthly_income_cents: 0, vr_initial_balance_cents: 0, budget_goals_cents: { needs: 0, wants: 0 } };
    state.settings.budget_goals_cents ||= { needs: 0, wants: 0 };
    state.rawEntries = savedEntries ? JSON.parse(savedEntries) : [];
    state.months = savedDynamic.months || {};
    state.deficits = savedDynamic.deficits || [];
    state.goals = savedDynamic.goals || [];
    state.transfers = savedDynamic.transfers || [];
  } else {
    state.settings = { monthly_income_cents: 0, vr_initial_balance_cents: 0, budget_goals_cents: { needs: 0, wants: 0 } };
    state.rawEntries = [];
    state.months = {};
    state.deficits = [];
    state.goals = [];
    state.transfers = [];
  }

  recalculateAndRender();
}

function saveGuestData() {
  localStorage.setItem("finflow_guest_settings", JSON.stringify(state.settings));
  localStorage.setItem("finflow_guest_entries", JSON.stringify(state.rawEntries));
  localStorage.setItem(
    "finflow_guest_dynamic",
    JSON.stringify({
      months: state.months,
      deficits: state.deficits,
      goals: state.goals,
      transfers: state.transfers,
    })
  );
}

function initFirestoreListeners(user) {
  cleanupListeners();

  const settingsDocRef = doc(db, "users", user.uid, "meta", "settings");
  unsubscribeSettings = onSnapshot(settingsDocRef, (snap) => {
    if (snap.exists()) {
      state.settings = { ...state.settings, ...snap.data() };
      state.settings.budget_goals_cents ||= { needs: 0, wants: 0 };
    } else {
      state.settings = { monthly_income_cents: 0, vr_initial_balance_cents: 0, budget_goals_cents: { needs: 0, wants: 0 } };
    }
    recalculateAndRender();
  });

  const entriesRef = collection(db, "users", user.uid, "entries");
  const entriesQuery = query(entriesRef, orderBy("date", "desc"));
  unsubscribeEntries = onSnapshot(entriesQuery, (snap) => {
    state.rawEntries = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    recalculateAndRender();
  });

  const bindSub = (subName, onUpdate) =>
    onSnapshot(collection(db, "users", user.uid, subName), (snap) => {
      onUpdate(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      recalculateAndRender();
    });

  unsubscribeMonths = bindSub("months", (items) => {
    state.months = Object.fromEntries(items.map((item) => [item.month_key || item.id, item]));
  });
  unsubscribeDeficits = bindSub("deficits", (items) => {
    state.deficits = items;
  });
  unsubscribeGoals = bindSub("goals", (items) => {
    state.goals = items;
  });
  unsubscribeTransfers = bindSub("transfers", (items) => {
    state.transfers = items;
  });
}

/* ==========================================================================
   SETTINGS & BASES ORÇAMENTÁRIAS
   ========================================================================== */

async function handleSettingsSubmit(event) {
  event.preventDefault();
  hideAlert(els.settingsMessage);

  try {
    const monthly_income_cents = parseMoney(els.settingsForm.monthly_income.value);
    const vr_initial_balance_cents = parseMoney(els.settingsForm.vr_initial.value);
    const needs_goal_cents = parseMoney(els.settingsForm.needs_goal.value);
    const wants_goal_cents = parseMoney(els.settingsForm.wants_goal.value);

    const ceilings = budgetFromIncome(monthly_income_cents);
    if (needs_goal_cents > ceilings.needs || wants_goal_cents > ceilings.wants) {
      throw new Error("A meta de gastos não pode ser maior que o teto da categoria.");
    }

    const payload = {
      monthly_income_cents,
      vr_initial_balance_cents,
      budget_goals_cents: { needs: needs_goal_cents, wants: wants_goal_cents },
      updatedAt: new Date().toISOString(),
    };

    if (state.user) {
      const settingsDocRef = doc(db, "users", state.user.uid, "meta", "settings");
      await setDoc(settingsDocRef, payload, { merge: true });
      showToast("Bases orçamentárias salvas na nuvem!");
    } else {
      state.settings = payload;
      saveGuestData();
      recalculateAndRender();
      showToast("Bases salvas localmente!");
    }

    if (els.settingsForm) els.settingsForm.hidden = true;
    if (els.toggleSettingsText) els.toggleSettingsText.textContent = "Ajustar Bases";
    if (els.toggleSettingsIcon) els.toggleSettingsIcon.style.transform = "rotate(0deg)";
  } catch (err) {
    console.error(err);
    showAlert(els.settingsMessage, err.message || "Erro ao salvar configurações.");
  }
}

/* ==========================================================================
   ENTRY TRANSACTIONS (CRUD)
   ========================================================================== */

function openEntryDialog(entry = null) {
  hideAlert(els.entryMessage);
  if (els.entryForm) els.entryForm.reset();

  if (entry) {
    if (els.entryDialogTitle) els.entryDialogTitle.textContent = "Editar Lançamento";
    if (els.entryForm?.id) els.entryForm.id.value = entry.id;
    if (els.entryValueInput) els.entryValueInput.value = formatInputMoney(entry.value_cents);
    if (els.entryForm?.description) els.entryForm.description.value = entry.description;
    if (els.entryForm?.category) els.entryForm.category.value = entry.category;
    if (els.entryForm?.date) els.entryForm.date.value = entry.date;
    if (els.entryForm?.payment_method) els.entryForm.payment_method.value = entry.payment_method;
    if (els.entryForm?.note) els.entryForm.note.value = entry.note || "";
    setEntryBudget(entry.budget_type);
    setEntryKind(entry.entry_kind || "expense");
    if (els.deleteEntry) els.deleteEntry.hidden = false;
  } else {
    if (els.entryDialogTitle) els.entryDialogTitle.textContent = "Novo Lançamento";
    if (els.entryForm?.id) els.entryForm.id.value = "";
    if (els.entryValueInput) els.entryValueInput.value = "";
    if (els.entryForm?.date) els.entryForm.date.value = toDateInput(new Date());
    setEntryBudget("needs");
    setEntryKind("expense");
    if (els.deleteEntry) els.deleteEntry.hidden = true;
  }

  if (els.catPills) els.catPills.forEach((p) => p.classList.remove("active"));
  els.entryDialog?.showModal();
}

function setEntryBudget(budget) {
  if (els.hiddenBudgetType) els.hiddenBudgetType.value = budget;
  if (els.budgetChips) {
    els.budgetChips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.budget === budget);
    });
  }

  if (budget === "vr") {
    if (els.vrKindWrapper) els.vrKindWrapper.hidden = false;
  } else {
    if (els.vrKindWrapper) els.vrKindWrapper.hidden = true;
    setEntryKind("expense");
  }
}

function setEntryKind(kind) {
  if (els.hiddenEntryKind) els.hiddenEntryKind.value = kind;
  if (els.vrSegmentBtns) {
    els.vrSegmentBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.kind === kind);
    });
  }
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  hideAlert(els.entryMessage);

  const data = Object.fromEntries(new FormData(els.entryForm));

  try {
    const rawVal = data.value || els.entryValueInput?.value;
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
    const budget_type = els.hiddenBudgetType?.value || "needs";
    const entry_kind = els.hiddenEntryKind?.value || "expense";
    const note = (data.note || "").trim();

    const isEdit = Boolean(data.id);

    // Alerta e confirmação de ultrapassagem de teto
    if (["needs", "wants"].includes(budget_type) && entry_kind === "expense") {
      const monthKey = monthKeyFromDate(date);
      const activeCalc = calculateMonth(monthKey);
      const budget = activeCalc.budgets[budget_type];
      if (budget) {
        const currentSpent = budget.spent_cents - (isEdit ? (state.rawEntries.find((e) => e.id === data.id)?.value_cents || 0) : 0);
        const newRealized = currentSpent + value_cents;
        if (newRealized > budget.ceiling_cents) {
          const diff = newRealized - budget.ceiling_cents;
          const confirmed = await showConfirm(
            "Ultrapassar teto do orçamento?",
            `Este lançamento fará ${labels[budget_type]} ultrapassar o teto em ${money(diff)} (Teto: ${money(budget.ceiling_cents)} | Novo total: ${money(newRealized)}). Deseja registrar o déficit?`,
            "Registrar mesmo assim"
          );
          if (!confirmed) return;
        }
      }
    }

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

    if (state.user) {
      const uid = state.user.uid;
      if (isEdit) {
        const entryRef = doc(db, "users", uid, "entries", data.id);
        await updateDoc(entryRef, payload);
        showToast("Lançamento atualizado!");
      } else {
        payload.createdAt = new Date().toISOString();
        const docRef = await addDoc(collection(db, "users", uid, "entries"), payload);
        payload.id = docRef.id;
        showToast("Novo lançamento salvo!");
      }
    } else {
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

    await syncDeficitsForMonth(monthKeyFromDate(date));
    els.entryDialog?.close();
  } catch (error) {
    console.error("Erro ao salvar lançamento:", error);
    showAlert(els.entryMessage, error.message);
    showToast(error.message, 3500);
  }
}

async function handleEntryDelete() {
  const id = els.entryForm?.id?.value;
  if (!id) return;

  const confirmed = await showConfirm("Deseja excluir este lançamento?", "Esta movimentação será apagada e os cálculos atualizados.");
  if (!confirmed) return;

  try {
    const entry = state.rawEntries.find((e) => e.id === id);
    const monthKey = entry ? monthKeyFromDate(entry.date) : getActiveMonthKey();

    if (state.user) {
      await deleteDoc(doc(db, "users", state.user.uid, "entries", id));
      showToast("Lançamento excluído!");
    } else {
      state.rawEntries = state.rawEntries.filter((e) => e.id !== id);
      saveGuestData();
      recalculateAndRender();
      showToast("Lançamento excluído!");
    }

    await syncDeficitsForMonth(monthKey);
    els.entryDialog?.close();
  } catch (err) {
    console.error(err);
    showAlert(els.entryMessage, "Erro ao excluir transação.");
  }
}

/* ==========================================================================
   DYNAMIC MONTHLY LOGIC & DEFICITS / TRANSFERS
   ========================================================================== */

function getActiveMonthKey() {
  if (state.filters.startDate) return state.filters.startDate.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function getMonthState(monthKey) {
  const existing = state.months[monthKey];
  if (existing) return { ...existing };
  return {
    month_key: monthKey,
    status: "aberto",
    carry_cents: { needs: 0, wants: 0 },
    allocation_cents: { needs: 0, wants: 0, savings: 0 },
    compensation_outflows_cents: { needs: 0, wants: 0 },
    investment_change_cents: 0,
    goals_cents: state.settings.budget_goals_cents || { needs: 0, wants: 0 },
    pending_funds: [],
  };
}

function calculateMonth(monthKey) {
  const monthState = getMonthState(monthKey);
  const entries = state.rawEntries.filter((entry) => monthKeyFromDate(entry.date) === monthKey);
  return calculateMonthlyBudget({
    incomeCents: state.settings.monthly_income_cents,
    goals: monthState.goals_cents || state.settings.budget_goals_cents || {},
    entries,
    carry: monthState.carry_cents || {},
    allocation: monthState.allocation_cents || {},
    compensationOutflows: monthState.compensation_outflows_cents || {},
    investmentChangeCents: monthState.investment_change_cents || 0,
  });
}

async function persistMonthState(month) {
  state.months[month.month_key] = month;
  if (state.user) {
    await setDoc(doc(db, "users", state.user.uid, "months", month.month_key), month, { merge: true });
  } else {
    saveGuestData();
  }
}

async function logTransfer(transfer) {
  const payload = {
    ...transfer,
    createdAt: new Date().toISOString(),
  };
  if (state.user) {
    await addDoc(collection(db, "users", state.user.uid, "transfers"), payload);
  } else {
    state.transfers.unshift({ id: `local_tr_${Date.now()}`, ...payload });
    saveGuestData();
  }
}

async function syncDeficitsForMonth(monthKey) {
  const summary = calculateMonth(monthKey);
  for (const key of ["needs", "wants"]) {
    const budget = summary.budgets[key];
    const deficitId = `${monthKey}_${key}`;
    const existing = state.deficits.find((d) => d.id === deficitId || (d.month_key === monthKey && d.budget_type === key));

    if (budget.deficit_cents > 0) {
      const compensated = existing?.compensated_cents || 0;
      const remaining = Math.max(0, budget.deficit_cents - compensated);
      const record = {
        id: deficitId,
        month_key: monthKey,
        budget_type: key,
        amount_cents: budget.deficit_cents,
        compensated_cents: compensated,
        remaining_cents: remaining,
        status: remaining === 0 ? "resolvido" : "pendente",
        updatedAt: new Date().toISOString(),
      };
      if (state.user) {
        await setDoc(doc(db, "users", state.user.uid, "deficits", deficitId), record, { merge: true });
      } else {
        const idx = state.deficits.findIndex((d) => d.id === deficitId);
        if (idx !== -1) state.deficits[idx] = record;
        else state.deficits.push(record);
        saveGuestData();
      }
    } else if (existing && existing.status === "pendente") {
      const record = { ...existing, remaining_cents: 0, status: "resolvido", updatedAt: new Date().toISOString() };
      if (state.user) {
        await setDoc(doc(db, "users", state.user.uid, "deficits", existing.id), record, { merge: true });
      } else {
        const idx = state.deficits.findIndex((d) => d.id === existing.id);
        if (idx !== -1) state.deficits[idx] = record;
        saveGuestData();
      }
    }
  }
}

async function compensateDeficit(card) {
  const deficit = state.deficits.find((item) => item.id === card.dataset.deficitId);
  const source = card.querySelector("[data-compensation-source]").value;
  const amount = parseMoney(card.querySelector("[data-compensation-value]").value);
  const active = calculateMonth(getActiveMonthKey());

  if (!deficit || amount <= 0 || amount > deficit.remaining_cents) return showToast("Informe um valor até o saldo pendente.");
  if (amount > active.budgets[source].remaining_cents) return showToast("A origem escolhida não possui saldo disponível suficiente.");

  const confirmed = await showConfirm(
    "Compensar pendência?",
    `${money(amount)} sairão do saldo disponível de ${labels[source]}. Investimentos não participam desta operação.`,
    "Confirmar compensação"
  );
  if (!confirmed) return;

  const month = getMonthState(getActiveMonthKey());
  month.compensation_outflows_cents = {
    ...(month.compensation_outflows_cents || {}),
    [source]: (month.compensation_outflows_cents?.[source] || 0) + amount,
  };

  const updatedDeficit = {
    ...deficit,
    compensated_cents: (deficit.compensated_cents || 0) + amount,
    remaining_cents: deficit.remaining_cents - amount,
    status: deficit.remaining_cents === amount ? "resolvido" : "pendente",
    updatedAt: new Date().toISOString(),
  };

  await persistMonthState(month);
  if (state.user) {
    await setDoc(doc(db, "users", state.user.uid, "deficits", deficit.id), updatedDeficit, { merge: true });
  } else {
    state.deficits = state.deficits.map((item) => (item.id === deficit.id ? updatedDeficit : item));
    saveGuestData();
  }

  await logTransfer({
    type: "compensacao_deficit",
    source,
    destination: deficit.budget_type,
    amount_cents: amount,
    month_key: getActiveMonthKey(),
    reference_month_key: deficit.month_key,
    deficit_id: deficit.id,
    reason: "Compensação de déficit",
  });

  recalculateAndRender();
  showToast("Compensação registrada no histórico.");
}

async function allocateFund(card, equalSplit = false) {
  const monthKey = getActiveMonthKey();
  const month = getMonthState(monthKey);
  const fund = (month.pending_funds || []).find((item) => item.id === card.dataset.fundId);
  if (!fund) return;

  const target = card.querySelector("[data-fund-target]")?.value || "savings";
  const amount = equalSplit ? fund.remaining_cents : parseMoney(card.querySelector("[data-fund-value]").value);

  if (amount <= 0 || amount > fund.remaining_cents) return showToast("Informe um valor até o saldo disponível desta sobra.");

  const confirmed = await showConfirm(
    "Direcionar saldo disponível?",
    `${money(amount)} serão enviados para ${target.startsWith("goal:") ? "o objetivo selecionado" : labels[target]}. A movimentação ficará registrada.`,
    "Confirmar direcionamento"
  );
  if (!confirmed) return;

  if (equalSplit) {
    const distribution = splitEqually(amount, BUDGET_KEYS);
    for (const [key, value] of Object.entries(distribution)) {
      await applyFundTarget(month, fund, key, value);
    }
  } else {
    await applyFundTarget(month, fund, target, amount);
  }

  fund.remaining_cents -= amount;
  month.pending_funds = month.pending_funds.filter((item) => item.remaining_cents > 0);
  await persistMonthState(month);
  recalculateAndRender();
  showToast("Saldo direcionado e registrado no histórico.");
}

async function applyFundTarget(month, fund, target, amount) {
  if (target.startsWith("goal:")) {
    const goalId = target.slice(5);
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) throw new Error("Objetivo não encontrado.");
    const updated = {
      ...goal,
      current_cents: (goal.current_cents || 0) + amount,
      updatedAt: new Date().toISOString(),
    };
    if (state.user) {
      await setDoc(doc(db, "users", state.user.uid, "goals", goal.id), updated, { merge: true });
    } else {
      state.goals = state.goals.map((item) => (item.id === goal.id ? updated : item));
    }
  } else {
    month.allocation_cents = {
      ...(month.allocation_cents || {}),
      [target]: (month.allocation_cents?.[target] || 0) + amount,
    };
  }

  await logTransfer({
    type: fund.type,
    source: fund.source_label,
    destination: target,
    amount_cents: amount,
    month_key: month.month_key,
    reference_month_key: fund.source_month,
    reason: "Redistribuição autorizada",
  });
}

async function splitFund(card) {
  return allocateFund(card, true);
}

async function closeCurrentMonth() {
  const monthKey = getActiveMonthKey();
  const current = getMonthState(monthKey);
  if (current.status === "fechado") return;

  const confirmed = await showConfirm(
    "Fechar este mês?",
    "O FinFlow registrará sobras, economias, pendências e o troco de investimentos para o próximo mês. Nenhuma transferência arbitrária será feita.",
    "Fechar mês"
  );
  if (!confirmed) return;

  const summary = calculateMonth(monthKey);
  const [year, month] = monthKey.split("-").map(Number);
  const nextKey = `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}`;

  const funds = ["needs", "wants"].flatMap((key) => {
    const budget = summary.budgets[key];
    const output = [];
    if (budget.surplus_cents > 0) {
      output.push({
        id: `${monthKey}-${key}-sobra`,
        type: "sobra",
        source_label: labels[key],
        source_month: monthKey,
        remaining_cents: budget.surplus_cents,
      });
    }
    if (budget.savings_cents > 0) {
      output.push({
        id: `${monthKey}-${key}-economia`,
        type: "economia",
        source_label: `Economia em ${labels[key]}`,
        source_month: monthKey,
        remaining_cents: budget.savings_cents,
      });
    }
    return output;
  });

  const next = getMonthState(nextKey);
  next.investment_change_cents = (next.investment_change_cents || 0) + summary.budgets.savings.investment_change_cents;
  next.pending_funds = [
    ...(next.pending_funds || []),
    ...funds.filter((fund) => !(next.pending_funds || []).some((item) => item.id === fund.id)),
  ];

  current.status = "fechado";
  current.closed_summary = { ...summary, closedAt: new Date().toISOString() };

  await persistMonthState(current);
  await persistMonthState(next);
  await logTransfer({
    type: "fechamento_mensal",
    source: monthKey,
    destination: nextKey,
    amount_cents: summary.budgets.savings.investment_change_cents,
    month_key: monthKey,
    reason: "Troco de investimentos transportado",
  });

  recalculateAndRender();
  showToast(`Mês ${monthKey} fechado! Sobras encaminhadas para ${nextKey}.`);
}

async function reopenCurrentMonth() {
  const monthKey = getActiveMonthKey();
  const current = getMonthState(monthKey);
  if (current.status !== "fechado") return;

  const confirmed = await showConfirm(
    "Reabrir este mês?",
    `A competência ${monthKey} voltará ao status aberto para inclusão ou edição de lançamentos.`,
    "Reabrir Mês"
  );
  if (!confirmed) return;

  current.status = "aberto";
  await persistMonthState(current);
  recalculateAndRender();
  showToast(`Competência ${monthKey} reaberta.`);
}

/* ==========================================================================
   GOALS LOGIC & WORKSPACE
   ========================================================================== */

function goalOptions() {
  return state.goals
    .filter((goal) => goal.status !== "arquivado")
    .map((goal) => `<option value="goal:${goal.id}">${escapeHtml(goal.name)}</option>`)
    .join("");
}

function statusLabel(status) {
  const map = {
    atingido: "Atingido",
    adiantado: "Adiantado",
    no_ritmo: "No ritmo",
    abaixo_do_ritmo: "Abaixo do ritmo",
    atrasado: "Atrasado",
    sem_prazo: "Sem prazo",
  };
  return map[status] || status;
}

async function handleGoalSubmit(event) {
  event.preventDefault();
  if (!els.goalsForm) return;

  const form = new FormData(els.goalsForm);
  const name = String(form.get("name") || "").trim();
  const target_cents = parseMoney(form.get("target"));
  if (!name || target_cents <= 0) return showToast("Informe nome e valor-alvo maior que zero.");

  const goal = {
    name,
    type: String(form.get("type") || "").trim(),
    target_cents,
    current_cents: parseMoney(form.get("current")),
    start_date: form.get("start") || new Date().toISOString().slice(0, 10),
    due_date: form.get("due") || "",
    desired_contribution_cents: parseMoney(form.get("contribution")),
    priority: form.get("priority") || "normal",
    description: String(form.get("description") || "").trim(),
    status: "ativo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (state.user) {
    await addDoc(collection(db, "users", state.user.uid, "goals"), goal);
  } else {
    state.goals.push({ id: `local_goal_${Date.now()}`, ...goal });
    saveGuestData();
    recalculateAndRender();
  }

  els.goalsForm.reset();
  showToast("Objetivo financeiro cadastrado!");
}

function renderGoals() {
  if (!els.goalsList) return;
  if (!state.goals.length) {
    els.goalsList.innerHTML = `
      <div class="chart-empty-state" style="grid-column: 1 / -1;">
        <div class="chart-empty-icon" aria-hidden="true">+</div>
        <strong>Seu primeiro objetivo começa aqui</strong>
        <span>Crie uma meta financeira com valor, prazo e prioridade para acompanhar seu ritmo de aportes.</span>
      </div>`;
    return;
  }

  els.goalsList.innerHTML = state.goals
    .filter((goal) => goal.status !== "arquivado")
    .map((goal) => {
      const info = calculateGoalStatus(goal);
      return `
        <article class="goal-card">
          <div class="goal-card-head">
            <div>
              <h3>${escapeHtml(goal.name)}</h3>
              <p>${escapeHtml(goal.type || "Objetivo financeiro")}</p>
            </div>
            <span class="status-badge status-${info.status}">${statusLabel(info.status)}</span>
          </div>
          <div class="goal-amounts">
            <strong>${money(goal.current_cents || 0)}</strong>
            <span>de ${money(goal.target_cents || 0)}</span>
          </div>
          <div class="goal-progress-track">
            <div class="goal-progress-fill" style="width:${Math.min(100, info.progress).toFixed(2)}%"></div>
          </div>
          <div class="goal-meta">
            <div>
              <span>Progresso</span>
              <strong>${info.progress.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Falta</span>
              <strong>${money(info.remaining)}</strong>
            </div>
            <div>
              <span>${goal.due_date ? "Aporte necessário" : "Aporte desejado"}</span>
              <strong>${money(info.requiredMonthly || goal.desired_contribution_cents || 0)}/mês</strong>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function renderDynamicWorkspace() {
  if (!els.dynamicWorkspace) return;
  const monthKey = getActiveMonthKey();
  const summary = calculateMonth(monthKey);
  const monthState = getMonthState(monthKey);
  const isClosed = monthState.status === "fechado";

  const openDeficits = state.deficits.filter((d) => d.status === "pendente" && d.remaining_cents > 0);
  const pendingFunds = monthState.pending_funds || [];

  const [y, m] = monthKey.split("-").map(Number);
  const nextMonthKey = `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const nextMonthState = state.months[nextMonthKey] || {};
  const nextPendingFunds = nextMonthState.pending_funds || [];

  const ledgerRows = BUDGET_KEYS.map((key) => {
    const budget = summary.budgets[key];
    const isOver = budget.deficit_cents > 0;
    return `
      <div class="budget-ledger-row">
        <div class="ledger-name">
          <span class="ledger-dot" style="background:${colors[key]}"></span>
          ${labels[key].split(" ")[0]}
        </div>
        <div class="ledger-value">
          <span>Teto</span>
          <strong>${money(budget.ceiling_cents)}</strong>
        </div>
        <div class="ledger-value">
          <span>Meta</span>
          <strong>${budget.target_cents ? money(budget.target_cents) : "-"}</strong>
        </div>
        <div class="ledger-value">
          <span>Gasto</span>
          <strong>${money(budget.realized_cents || budget.spent_cents)}</strong>
        </div>
        <div class="ledger-value ${isOver ? "negative" : "positive"}">
          <span>Saldo</span>
          <strong>${isOver ? `-${money(budget.deficit_cents)}` : money(budget.remaining_cents)}</strong>
        </div>
        <div class="ledger-value">
          <span>Uso</span>
          <strong>${budget.usage_percent.toFixed(1)}%</strong>
        </div>
      </div>`;
  }).join("");

  // 1. Pendências e Compensações
  let noticesHtml = "";
  if (openDeficits.length) {
    noticesHtml = `
      <div class="notice-list">
        ${openDeficits
          .map(
            (deficit) => `
            <div class="notice-card deficit" data-deficit-id="${deficit.id}">
              <div class="notice-title">
                <span class="status-badge status-atrasado">Pendência aberta</span>
                ${labels[deficit.budget_type]} ultrapassou o teto
              </div>
              <p class="notice-copy">
                Faltam <strong>${money(deficit.remaining_cents)}</strong> para compensar o limite. 
                Investimentos permanecem protegidos e não podem ser usados.
              </p>
              <div class="compensation-form">
                <select data-compensation-source aria-label="Origem da compensação">
                  ${["needs", "wants"]
                    .filter((k) => k !== deficit.budget_type)
                    .map((k) => `<option value="${k}">${labels[k]} (${money(summary.budgets[k].remaining_cents)} disp.)</option>`)
                    .join("")}
                </select>
                <input data-compensation-value inputmode="numeric" placeholder="${formatInputMoney(deficit.remaining_cents)}" value="${formatInputMoney(deficit.remaining_cents)}">
                <button class="btn btn-secondary btn-sm" type="button" data-action="compensate">Compensar</button>
              </div>
            </div>`
          )
          .join("")}
      </div>`;
  } else {
    const needsSpent = summary.budgets.needs.realized_cents || summary.budgets.needs.spent_cents;
    const needsCeil = summary.budgets.needs.ceiling_cents;
    const needsPct = Math.min(100, Math.round(summary.budgets.needs.usage_percent || 0));

    const wantsSpent = summary.budgets.wants.realized_cents || summary.budgets.wants.spent_cents;
    const wantsCeil = summary.budgets.wants.ceiling_cents;
    const wantsPct = Math.min(100, Math.round(summary.budgets.wants.usage_percent || 0));

    noticesHtml = `
      <div class="status-showcase-box showcase-success">
        <div class="showcase-header">
          <div class="showcase-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div class="showcase-title-wrap">
            <h3 class="showcase-headline">Tetos orçamentários sob controle</h3>
            <p class="showcase-text">Nenhuma ultrapassagem identificada neste período. Gastos de 50% e 30% estão em conformidade com a regra.</p>
          </div>
        </div>
        <div class="showcase-stats-grid">
          <div class="showcase-stat-item">
            <div class="showcase-stat-top">
              <span class="showcase-stat-name"><span class="ledger-dot" style="background:var(--color-needs)"></span> Necessidades (50%)</span>
              <span class="showcase-stat-pct">${needsPct}%</span>
            </div>
            <div class="showcase-stat-bar"><div class="showcase-stat-fill fill-needs" style="width:${needsPct}%"></div></div>
            <div class="showcase-stat-values">
              <span>Gasto: <strong>${money(needsSpent)}</strong></span>
              <span>Teto: ${money(needsCeil)}</span>
            </div>
          </div>
          <div class="showcase-stat-item">
            <div class="showcase-stat-top">
              <span class="showcase-stat-name"><span class="ledger-dot" style="background:var(--color-wants)"></span> Desejos (30%)</span>
              <span class="showcase-stat-pct">${wantsPct}%</span>
            </div>
            <div class="showcase-stat-bar"><div class="showcase-stat-fill fill-wants" style="width:${wantsPct}%"></div></div>
            <div class="showcase-stat-values">
              <span>Gasto: <strong>${money(wantsSpent)}</strong></span>
              <span>Teto: ${money(wantsCeil)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  // 2. Sobras & Decisões de Saldo
  const surplusNeeds = summary.budgets.needs.surplus_cents;
  const surplusWants = summary.budgets.wants.surplus_cents;
  const totalSurplus = surplusNeeds + surplusWants;
  const investChange = summary.budgets.savings.investment_change_cents;

  let fundsHtml = "";
  if (pendingFunds.length) {
    fundsHtml = `
      <div class="fund-list">
        ${pendingFunds
          .map(
            (fund) => `
            <div class="fund-row" data-fund-id="${fund.id}">
              <div class="fund-title">
                <span class="fund-type">${fund.type === "economia" ? "Economia" : "Sobra"}</span>
                ${fund.source_label} (${money(fund.remaining_cents)})
              </div>
              <p class="fund-copy">Saldo liberado do período ${fund.source_month}. Escolha o direcionamento autorizado:</p>
              <div class="fund-actions">
                <select data-fund-target aria-label="Destino">
                  <option value="savings">Investimentos (20%)</option>
                  <option value="needs">Necessidades (50%)</option>
                  <option value="wants">Desejos (30%)</option>
                  ${goalOptions()}
                </select>
                <input data-fund-value inputmode="numeric" value="${formatInputMoney(fund.remaining_cents)}">
                <button class="btn btn-primary btn-sm" type="button" data-action="allocate">Direcionar</button>
                <button class="btn btn-secondary btn-sm" type="button" data-action="split">Dividir (33/33/33)</button>
              </div>
            </div>`
          )
          .join("")}
      </div>`;
  } else if (isClosed && nextPendingFunds.length) {
    fundsHtml = `
      <div class="status-showcase-box showcase-info">
        <div class="showcase-header">
          <div class="showcase-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="showcase-title-wrap">
            <h3 class="showcase-headline">Sobras geradas para a competência ${nextMonthKey}</h3>
            <p class="showcase-text">Este mês foi consolidado e gerou <strong>${nextPendingFunds.length} saldo(s)</strong> prontos para direcionamento na próxima competência.</p>
          </div>
        </div>
        <div class="showcase-highlight-row">
          <button class="btn btn-primary btn-sm" type="button" data-nav-month="${nextMonthKey}">Ver Sobras em ${nextMonthKey} →</button>
        </div>
      </div>`;
  } else {
    fundsHtml = `
      <div class="status-showcase-box showcase-info">
        <div class="showcase-header">
          <div class="showcase-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
          </div>
          <div class="showcase-title-wrap">
            <h3 class="showcase-headline">Nenhum saldo pendente de destinação</h3>
            <p class="showcase-text">Ao encerrar a competência mensal, as economias e sobras apuradas ficarão disponíveis aqui para direcionamento a <strong>Objetivos</strong> ou <strong>Investimentos</strong>.</p>
          </div>
        </div>
        <div class="showcase-highlight-row">
          <div class="highlight-item">
            <span class="highlight-label">Sobra projetada no mês</span>
            <strong class="highlight-val text-gold">${money(totalSurplus)}</strong>
          </div>
          <div class="highlight-item">
            <span class="highlight-label">Destino permitido</span>
            <span class="highlight-sub">Objetivos ou Aportes (20%)</span>
          </div>
        </div>
      </div>`;
  }

  const hasRelevantGoal = state.goals.some((g) => ["abaixo_do_ritmo", "atrasado"].includes(calculateGoalStatus(g).status));
  const recHtml = hasRelevantGoal
    ? `<div class="recommendation-list" style="margin-top: 10px;">
        <div class="recommendation-card">
          <strong>Recomendação Inteligente:</strong>
          <p>Você possui objetivos abaixo do ritmo. Ao receber sobras de orçamento, priorize o aporte na meta para manter o prazo planejado.</p>
        </div>
      </div>`
    : "";

  // 3. Fechamento do Mês
  let monthCloseHtml = `
    <article class="dynamic-panel dynamic-panel-wide competence-control-panel">
      <div class="competence-top-row">
        <div class="competence-title-group">
          <div class="competence-status-pill ${isClosed ? 'closed' : 'open'}">
            ${isClosed 
              ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Competência ${monthKey} Fechada & Consolidada`
              : `<span class="status-pulse-dot"></span> Competência ${monthKey} em Aberto`}
          </div>
          <p class="competence-subtitle">
            ${isClosed 
              ? `O troco de aportes e as sobras foram devidamente transportados para a competência ${nextMonthKey}.`
              : `Lançamentos e ajustes em andamento. Feche o mês para consolidar sobras e troco de investimentos.`}
          </p>
        </div>
        <div class="competence-actions-group">
          ${isClosed 
            ? `<button class="btn btn-primary" type="button" data-nav-month="${nextMonthKey}">Ir para ${nextMonthKey} →</button>
               <button class="btn btn-secondary" type="button" id="reopen-month-btn">Reabrir Mês</button>`
            : `<button class="btn btn-primary btn-close-month" type="button" id="close-month-btn">
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                 Fechar Mês ${monthKey}
               </button>`}
        </div>
      </div>

      <div class="competence-kpi-grid">
        <div class="competence-kpi-card">
          <div class="kpi-icon-pill icon-blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Troco de Investimentos (20% Protegido)</span>
            <strong class="kpi-value text-savings">${money(investChange)}</strong>
            <span class="kpi-hint">${isClosed ? 'Transportado para acumular em ' + nextMonthKey : 'Acumula automaticamente no teto de aportes de ' + nextMonthKey}</span>
          </div>
        </div>

        <div class="competence-kpi-card">
          <div class="kpi-icon-pill icon-gold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Sobras de Orçamento (Necessidades + Desejos)</span>
            <strong class="kpi-value text-gold">${money(totalSurplus)}</strong>
            <span class="kpi-hint">${isClosed ? 'Liberadas para destinação em ' + nextMonthKey : 'Prontas para direcionar a Metas ou Investimentos em ' + nextMonthKey}</span>
          </div>
        </div>
      </div>
    </article>`;

  els.dynamicWorkspace.innerHTML = `
    <article class="dynamic-panel dynamic-panel-wide">
      <div class="dynamic-panel-head">
        <div>
          <h2 class="dynamic-title">Execução Orçamentária Dinâmica</h2>
          <p class="dynamic-desc">Teto planejado, metas de economia e disciplina da metodologia 50/30/20.</p>
        </div>
        <span class="month-label">Competência ${monthKey}</span>
      </div>
      <div class="budget-ledger">${ledgerRows}</div>
      <div class="investment-commitment" style="margin-top: 16px;">
        <div class="dynamic-title">Compromisso de Investimentos (20% Protegido)</div>
        <div class="commitment-grid">
          <div><span>Obrigatório (20%)</span><strong>${money(summary.budgets.savings.mandatory_cents)}</strong></div>
          <div><span>Troco transportado</span><strong>${money(summary.budgets.savings.carried_change_cents)}</strong></div>
          <div><span>Total disponível</span><strong>${money(summary.budgets.savings.ceiling_cents)}</strong></div>
          <div><span>Aportado</span><strong>${money(summary.budgets.savings.spent_cents)}</strong></div>
          <div><span>Troco acumulado</span><strong style="color:var(--color-savings)">${money(summary.budgets.savings.investment_change_cents)}</strong></div>
        </div>
      </div>
    </article>

    <article class="dynamic-panel dynamic-panel-equal">
      <div class="dynamic-panel-head">
        <div>
          <h2 class="dynamic-title">Pendências e Compensações</h2>
          <p class="dynamic-desc">Compensação disciplinada entre Necessidades e Desejos.</p>
        </div>
        <span class="panel-status-pill ${openDeficits.length ? "status-pill-danger" : "status-pill-success"}">
          ${openDeficits.length 
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${openDeficits.length} pendência(s)` 
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> 0 pendências`}
        </span>
      </div>
      ${noticesHtml}
    </article>

    <article class="dynamic-panel dynamic-panel-equal">
      <div class="dynamic-panel-head">
        <div>
          <h2 class="dynamic-title">Sobras & Decisões de Saldo</h2>
          <p class="dynamic-desc">Destinação deliberada de economias após fechamento.</p>
        </div>
        <span class="panel-status-pill ${pendingFunds.length ? "status-pill-warning" : "status-pill-neutral"}">
          ${pendingFunds.length ? `${pendingFunds.length} saldo(s)` : "Destinação"}
        </span>
      </div>
      ${fundsHtml}
      ${recHtml}
    </article>

    ${monthCloseHtml}`;

  // Listeners dinâmicos
  els.dynamicWorkspace.querySelectorAll('[data-action="compensate"]').forEach((btn) => {
    btn.addEventListener("click", () => compensateDeficit(btn.closest(".notice-card")));
  });
  els.dynamicWorkspace.querySelectorAll('[data-action="allocate"]').forEach((btn) => {
    btn.addEventListener("click", () => allocateFund(btn.closest(".fund-row"), false));
  });
  els.dynamicWorkspace.querySelectorAll('[data-action="split"]').forEach((btn) => {
    btn.addEventListener("click", () => splitFund(btn.closest(".fund-row")));
  });
  els.dynamicWorkspace.querySelectorAll('[data-nav-month]').forEach((btn) => {
    btn.addEventListener("click", () => setFilterMonth(btn.dataset.navMonth));
  });
  els.dynamicWorkspace.querySelector("#close-month-btn")?.addEventListener("click", closeCurrentMonth);
  els.dynamicWorkspace.querySelector("#reopen-month-btn")?.addEventListener("click", reopenCurrentMonth);
}

/* ==========================================================================
   RENDERERS & VIEWS
   ========================================================================== */

function setView(view) {
  state.currentView = view;

  // Update active state in sidebar and bottom navigation
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  // Switch active panel with clean animation trigger
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.remove("active");
  });

  const targetId =
    view === "overview"
      ? "overview-view"
      : view === "entries"
      ? "entries-view"
      : view === "goals"
      ? "goals-view"
      : "category-view";
  const targetPanel = document.querySelector(`#${targetId}`);
  if (targetPanel) {
    targetPanel.classList.add("active");
    targetPanel.style.animation = "none";
    targetPanel.offsetHeight; // trigger reflow
    targetPanel.style.animation = "";
  }

  // Update Headings with smooth animation
  const titleText = labels[view] || "FinFlow";
  const subText = viewSubtitles[view] || "";

  const mainTitle = document.querySelector("#page-main-title");
  const mainSubtitle = document.querySelector("#page-main-subtitle");
  if (mainTitle) {
    mainTitle.classList.remove("view-title-animate");
    mainTitle.offsetHeight;
    mainTitle.textContent = titleText;
    mainTitle.classList.add("view-title-animate");
  }
  if (mainSubtitle) {
    mainSubtitle.classList.remove("view-title-animate");
    mainSubtitle.offsetHeight;
    mainSubtitle.textContent = subText;
    mainSubtitle.classList.add("view-title-animate");
  }

  if (els.mobileViewTitle) {
    els.mobileViewTitle.classList.remove("view-title-animate");
    els.mobileViewTitle.offsetHeight;
    els.mobileViewTitle.textContent = titleText;
    els.mobileViewTitle.classList.add("view-title-animate");
  }
  if (els.mobileViewSubtitle) {
    els.mobileViewSubtitle.classList.remove("view-title-animate");
    els.mobileViewSubtitle.offsetHeight;
    els.mobileViewSubtitle.textContent = subText;
    els.mobileViewSubtitle.classList.add("view-title-animate");
  }

  render();
}

function render() {
  if (!state.summary) recalculateSummary();

  // Sync settings inputs
  if (els.settingsForm?.monthly_income) els.settingsForm.monthly_income.value = formatInputMoney(state.settings.monthly_income_cents);
  if (els.settingsForm?.vr_initial) els.settingsForm.vr_initial.value = formatInputMoney(state.settings.vr_initial_balance_cents);
  if (els.settingsForm?.needs_goal) els.settingsForm.needs_goal.value = formatInputMoney(state.settings.budget_goals_cents?.needs || 0);
  if (els.settingsForm?.wants_goal) els.settingsForm.wants_goal.value = formatInputMoney(state.settings.budget_goals_cents?.wants || 0);

  renderMetrics();
  renderBudgetBars();
  renderCharts();
  renderEntries();
  renderDynamicWorkspace();
  renderGoals();

  if (!["overview", "entries", "goals"].includes(state.currentView)) {
    renderCategory(state.currentView);
  }
}

function recalculateAndRender() {
  recalculateSummary();
  filterEntries();
  render();
}

function recalculateSummary() {
  const income = state.settings.monthly_income_cents || 0;
  const vrInitial = state.settings.vr_initial_balance_cents || 0;

  const planned = budgetFromIncome(income);

  const spent = { needs: 0, wants: 0, savings: 0 };
  let vrSpent = 0;
  let vrReceived = 0;

  state.filteredEntries.forEach((entry) => {
    const val = entry.value_cents || 0;
    if (entry.budget_type === "vr") {
      if (entry.entry_kind === "income") vrReceived += val;
      else vrSpent += val;
    } else if (BUDGET_KEYS.includes(entry.budget_type)) {
      if (entry.entry_kind === "expense") {
        spent[entry.budget_type] += val;
      }
    }
  });

  const totalSpent503020 = spent.needs + spent.wants + spent.savings;
  const available503020 = income - totalSpent503020;
  const vrBalance = vrInitial + vrReceived - vrSpent;

  const buildBudget = (key) => {
    const p = planned[key];
    const s = spent[key];
    const rem = p - s;
    const usage = p > 0 ? (s / p) * 100 : 0;
    return {
      planned_cents: p,
      spent_cents: s,
      remaining_cents: rem,
      usage_percent: usage,
    };
  };

  state.summary = {
    income_cents: income,
    spent_total_cents: totalSpent503020,
    available_cents: available503020,
    budgets: {
      needs: buildBudget("needs"),
      wants: buildBudget("wants"),
      savings: buildBudget("savings"),
    },
    vr: {
      initial_cents: vrInitial,
      received_cents: vrReceived,
      spent_cents: vrSpent,
      balance_cents: vrBalance,
    },
  };
}

function renderMetrics() {
  const s = state.summary;
  text("#metric-income", money(s.income_cents));
  text("#metric-spent", money(s.spent_total_cents));

  const pct = s.income_cents > 0 ? (s.spent_total_cents / s.income_cents) * 100 : 0;
  text("#metric-spent-pct", `${pct.toFixed(1)}% da renda comprometida`);

  const availEl = document.querySelector("#metric-available");
  if (availEl) {
    availEl.textContent = money(s.available_cents);
    availEl.className = `metric-value ${s.available_cents >= 0 ? "text-available" : "text-spent"}`;
  }

  const vrEl = document.querySelector("#metric-vr-balance") || document.querySelector("#metric-vr");
  if (vrEl) {
    vrEl.textContent = money(s.vr.balance_cents);
    vrEl.className = `metric-value ${s.vr.balance_cents >= 0 ? "text-available" : "text-spent"}`;
  }
}

function renderBudgetBars() {
  const container = document.querySelector("#budget-bars");
  if (!container) return;

  const barKeys = [
    { key: "needs", label: "50% Necessidades", color: colors.needs },
    { key: "wants", label: "30% Desejos", color: colors.wants },
    { key: "savings", label: "20% Investimentos", color: colors.savings },
  ];

  container.innerHTML = barKeys
    .map(({ key, label, color }) => {
      const budget = state.summary.budgets[key] || { planned_cents: 0, spent_cents: 0, usage_percent: 0 };
      const pct = Math.min(budget.usage_percent, 100);
      const isOver = budget.usage_percent > 100;
      return `
        <div class="budget-bar-item">
          <div class="budget-bar-header">
            <div class="budget-bar-label-group">
              <span class="budget-dot" style="background-color: ${color}"></span>
              <strong class="budget-name">${label}</strong>
            </div>
            <div class="budget-bar-values">
              <span class="budget-spent-val">${money(budget.spent_cents)}</span>
              <span class="budget-sep">/</span>
              <span class="budget-planned-val">${money(budget.planned_cents)}</span>
              <span class="budget-pct-badge ${isOver ? "badge-over" : ""}">${budget.usage_percent.toFixed(1)}%</span>
            </div>
          </div>
          <div class="budget-progress-track">
            <div class="budget-progress-bar" style="width: ${pct}%; background-color: ${color};"></div>
          </div>
        </div>`;
    })
    .join("");
}

/* ==========================================================================
   PURE SVG CHARTS (NO EXTERNAL DEPENDENCIES)
   ========================================================================== */

function renderCharts() {
  renderDistributionChart();
  renderTimelineChart();
}

function renderDistributionChart() {
  const container = document.querySelector("#distribution-chart-wrap");
  if (!container) return;

  const { spent_total_cents } = state.summary;
  const budgets = state.summary.budgets;

  if (spent_total_cents === 0) {
    container.innerHTML = `
      <div class="chart-empty-state">
        <div class="chart-empty-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
        </div>
        <strong>Sem despesas registradas</strong>
        <span>Adicione lançamentos para visualizar o gráfico de distribuição 50/30/20.</span>
      </div>`;
    return;
  }

  const slices = [
    { key: "needs", label: "50% Necessidades", value: budgets.needs.spent_cents, color: colors.needs },
    { key: "wants", label: "30% Desejos", value: budgets.wants.spent_cents, color: colors.wants },
    { key: "savings", label: "20% Investimentos", value: budgets.savings.spent_cents, color: colors.savings },
  ].filter((s) => s.value > 0);

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const strokeWidth = 22;
  const circ = 2 * Math.PI * r;

  let accOffset = 0;
  const svgArcs = slices
    .map((s) => {
      const ratio = s.value / spent_total_cents;
      const dash = ratio * circ;
      const offset = -accOffset;
      accOffset += dash;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" />`;
    })
    .join("");

  const legendItems = slices
    .map((s) => {
      const pct = ((s.value / spent_total_cents) * 100).toFixed(1);
      return `
      <div class="donut-legend-item">
        <div class="donut-legend-left">
          <span class="donut-legend-dot" style="background-color:${s.color}"></span>
          <span class="donut-legend-name">${s.label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="donut-legend-pct">${pct}%</span>
          <span class="donut-legend-val">${money(s.value)}</span>
        </div>
      </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="donut-layout-wrap">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="donut-svg" aria-label="Distribuição de Gastos">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" />
          ${svgArcs}
          <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="donut-center-label">TOTAL GASTO</text>
          <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-center-val">${money(spent_total_cents)}</text>
        </svg>
      </div>
      <div class="donut-legend-grid">
        ${legendItems}
      </div>
    </div>`;
}

function getNiceYAxis(maxCents, steps = 4) {
  if (maxCents <= 0) return { max: 10000, values: [0, 2500, 5000, 7500, 10000] };
  const rawStep = maxCents / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let niceNorm = 1;
  if (norm > 5) niceNorm = 10;
  else if (norm > 2.5) niceNorm = 5;
  else if (norm > 1.25) niceNorm = 2.5;
  else niceNorm = 1;
  const step = Math.max(100, Math.round(niceNorm * mag));
  const niceMax = Math.max(maxCents, step * steps);
  const actualSteps = Math.ceil(niceMax / step);
  const values = [];
  for (let i = 0; i <= actualSteps; i++) {
    values.push(i * step);
  }
  return { max: values[values.length - 1], values };
}

function renderTimelineChart() {
  const container = document.querySelector("#timeline-chart-wrap");
  if (!container) return;

  const expenses = state.filteredEntries
    .filter((e) => e.entry_kind === "expense" && e.budget_type !== "vr")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!expenses.length) {
    container.innerHTML = `
      <div class="chart-empty-state">
        <div class="chart-empty-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
        </div>
        <strong>Sem dados para evolução temporal</strong>
        <span>Os gastos acumulados ao longo do tempo aparecerão aqui.</span>
      </div>`;
    return;
  }

  const map = new Map();
  expenses.forEach((e) => {
    map.set(e.date, (map.get(e.date) || 0) + e.value_cents);
  });

  const dates = Array.from(map.keys()).sort();
  let acc = 0;
  const points = dates.map((d) => {
    const daySpent = map.get(d);
    acc += daySpent;
    return { date: d, daySpent, total: acc };
  });

  const finalTotal = points[points.length - 1].total;
  const avgPerEntry = Math.round(finalTotal / expenses.length);
  const lastDate = dates[dates.length - 1];

  const yAxis = getNiceYAxis(finalTotal, 4);
  const max = Math.max(yAxis.max, 1);

  const svgWidth = 840;
  const svgHeight = 260;
  const padL = 95;
  const padR = 40;
  const padT = 32;
  const padB = 45;
  const innerW = svgWidth - padL - padR;
  const innerH = svgHeight - padT - padB;

  let gridLines = "";
  yAxis.values.forEach((yVal) => {
    const yPos = padT + innerH - (yVal / max) * innerH;
    gridLines += `
      <g class="timeline-grid-row">
        <line x1="${padL}" y1="${yPos.toFixed(1)}" x2="${(svgWidth - padR).toFixed(1)}" y2="${yPos.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="4 4" />
        <text x="${(padL - 14).toFixed(1)}" y="${(yPos + 4).toFixed(1)}" text-anchor="end" class="timeline-axis-label">${money(yVal)}</text>
      </g>`;
  });

  const coords = points.map((p, idx) => {
    const x = points.length === 1 ? padL + innerW / 2 : padL + (idx / (points.length - 1)) * innerW;
    const y = padT + innerH - (p.total / max) * innerH;
    return { x, y, date: p.date, daySpent: p.daySpent, total: p.total };
  });

  let areaPath = "";
  let linePath = "";

  if (coords.length === 1) {
    const pt = coords[0];
    areaPath = `M ${padL} ${(padT + innerH).toFixed(1)} L ${padL} ${pt.y.toFixed(1)} L ${(svgWidth - padR).toFixed(1)} ${pt.y.toFixed(1)} L ${(svgWidth - padR).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
    linePath = `M ${padL} ${pt.y.toFixed(1)} L ${(svgWidth - padR).toFixed(1)} ${pt.y.toFixed(1)}`;
  } else {
    const first = coords[0];
    const last = coords[coords.length - 1];
    const lineSegs = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    linePath = lineSegs;
    areaPath = `${lineSegs} L ${last.x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${first.x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
  }

  // X Axis Dates
  const xLabels = coords.map((c, idx) => {
    const show = coords.length <= 8 || idx === 0 || idx === coords.length - 1 || idx % Math.ceil(coords.length / 6) === 0;
    if (!show) return "";
    const [y, m, d] = c.date.split("-");
    const label = `${d}/${m}`;
    return `
      <g class="timeline-x-tick">
        <line x1="${c.x.toFixed(1)}" y1="${(padT + innerH).toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${(padT + innerH + 6).toFixed(1)}" stroke="rgba(255,255,255,0.15)" />
        <text x="${c.x.toFixed(1)}" y="${(padT + innerH + 22).toFixed(1)}" text-anchor="middle" class="timeline-axis-label timeline-x-label">${label}</text>
      </g>`;
  }).join("");

  // Point dots
  const pointCircles = coords.map((c) => {
    return `
      <g class="timeline-dot-group" tabindex="0">
        <title>${formatDate(c.date)}: ${money(c.daySpent)} adicionados (Acumulado: ${money(c.total)})</title>
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="7" fill="#F59E0B" opacity="0.25" />
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.5" fill="#F59E0B" stroke="#0C0A09" stroke-width="2" />
      </g>`;
  }).join("");

  // Callout badge for the last point
  const lastCoord = coords[coords.length - 1];
  const calloutText = money(finalTotal);
  const calloutW = Math.max(92, calloutText.length * 8 + 14);
  const calloutH = 26;
  const calloutX = Math.min(Math.max(lastCoord.x - calloutW / 2, padL), svgWidth - padR - calloutW);
  const calloutY = Math.max(padT - 22, lastCoord.y - 34);

  const callout = `
    <g class="timeline-callout">
      <rect x="${calloutX.toFixed(1)}" y="${calloutY.toFixed(1)}" width="${calloutW}" height="${calloutH}" rx="7" fill="#1C1917" stroke="#F59E0B" stroke-width="1.5" />
      <text x="${(calloutX + calloutW / 2).toFixed(1)}" y="${(calloutY + 16.5).toFixed(1)}" text-anchor="middle" class="timeline-callout-text">${calloutText}</text>
    </g>`;

  container.innerHTML = `
    <div class="timeline-chart-card-inner">
      <div class="timeline-kpi-bar">
        <div class="timeline-kpi-item">
          <span class="timeline-kpi-label">Total Acumulado</span>
          <strong class="timeline-kpi-val text-gold">${money(finalTotal)}</strong>
        </div>
        <div class="timeline-kpi-item">
          <span class="timeline-kpi-label">Média por Lançamento</span>
          <strong class="timeline-kpi-val">${money(avgPerEntry)}</strong>
        </div>
        <div class="timeline-kpi-item">
          <span class="timeline-kpi-label">Dias c/ Movimentação</span>
          <strong class="timeline-kpi-val">${dates.length} ${dates.length === 1 ? "dia" : "dias"}</strong>
        </div>
        <div class="timeline-kpi-item">
          <span class="timeline-kpi-label">Último Lançamento</span>
          <strong class="timeline-kpi-val">${formatDate(lastDate)}</strong>
        </div>
      </div>
      <div class="timeline-svg-wrapper">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" class="timeline-svg" aria-label="Gráfico de Evolução Acumulada">
          <defs>
            <linearGradient id="timelineGoldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.35"/>
              <stop offset="60%" stop-color="#F59E0B" stop-opacity="0.08"/>
              <stop offset="100%" stop-color="#F59E0B" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          ${gridLines}
          <path d="${areaPath}" fill="url(#timelineGoldGrad)" />
          <path d="${linePath}" fill="none" stroke="#F59E0B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
          ${xLabels}
          ${pointCircles}
          ${callout}
        </svg>
      </div>
    </div>`;
}

function renderCategory(key) {
  const summaryEl = document.querySelector("#category-summary");
  const listEl = document.querySelector("#category-list");
  const titleEl = document.querySelector("#category-list-title");

  if (summaryEl) summaryEl.innerHTML = "";
  if (listEl) listEl.innerHTML = "";
  if (titleEl) titleEl.textContent = `Lançamentos de ${labels[key] || key}`;

  if (!summaryEl || !listEl) return;

  if (key === "vr") {
    const vr = state.summary.vr;
    summaryEl.insertAdjacentHTML(
      "beforeend",
      `<div class="category-summary-title">Resumo da Carteira VR</div>
      <div class="category-kpi-grid">
        <div class="kpi-tile"><span>Saldo Inicial</span><strong>${money(vr.initial_cents)}</strong></div>
        <div class="kpi-tile"><span>Total Recebido</span><strong style="color:var(--success)">+${money(vr.received_cents)}</strong></div>
        <div class="kpi-tile"><span>Total Gasto</span><strong style="color:var(--danger)">-${money(vr.spent_cents)}</strong></div>
        <div class="kpi-tile"><span>Saldo Atual</span><strong style="color:var(--primary)">${money(vr.balance_cents)}</strong></div>
      </div>`
    );
  } else {
    const budget = state.summary.budgets[key] || { planned_cents: 0, spent_cents: 0, remaining_cents: 0, usage_percent: 0 };
    summaryEl.insertAdjacentHTML(
      "beforeend",
      `<div class="category-summary-title">Resumo - ${labels[key]}</div>
      <div class="category-kpi-grid">
        <div class="kpi-tile"><span>Planejado (${key === "needs" ? "50%" : key === "wants" ? "30%" : "20%"})</span><strong>${money(budget.planned_cents)}</strong></div>
        <div class="kpi-tile"><span>Realizado</span><strong>${money(budget.spent_cents)}</strong></div>
        <div class="kpi-tile"><span>Saldo Restante</span><strong style="color:${budget.remaining_cents >= 0 ? "var(--success)" : "var(--danger)"}">${money(budget.remaining_cents)}</strong></div>
        <div class="kpi-tile"><span>% Utilizado</span><strong>${budget.usage_percent.toFixed(1)}%</strong></div>
      </div>`
    );
  }

  const filtered = state.filteredEntries.filter((entry) => entry.budget_type === key);
  renderEntryList(listEl, filtered);
}

function renderEntries() {
  const listEl = document.querySelector("#entries-list");
  if (listEl) renderEntryList(listEl, state.filteredEntries);

  const total = state.filteredEntries
    .filter((entry) => entry.entry_kind === "expense")
    .reduce((sum, entry) => sum + entry.value_cents, 0);
  text("#entries-total", money(total));
}

function renderEntryList(container, entries) {
  if (!container) return;
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

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

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
                  ${noteText ? "<span>•</span>" + noteText : ""}
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
    els.settingsForm?.monthly_income,
    els.settingsForm?.vr_initial,
    els.settingsForm?.needs_goal,
    els.settingsForm?.wants_goal,
    els.entryValueInput,
    document.querySelector("#goal-target"),
    document.querySelector("#goal-current"),
    document.querySelector("#goal-contribution"),
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
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/[R$\s.]/g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

function formatInputMoney(cents) {
  if (typeof cents !== "number" || Number.isNaN(cents) || cents === 0) return "";
  const num = cents / 100;
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function money(cents) {
  const num = (Number(cents) || 0) / 100;
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(isoStr) {
  if (!isoStr) return "--";
  const [y, m, d] = isoStr.split("-");
  return `${d}/${m}/${y}`;
}

function toDateInput(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function text(selector, val) {
  const el = document.querySelector(selector);
  if (el) el.textContent = val;
}

function showAlert(target, text) {
  if (!target) return;
  target.textContent = text;
  target.hidden = false;
}

function hideAlert(target) {
  if (!target) return;
  target.textContent = "";
  target.hidden = true;
}

function showToast(message, duration = 3000) {
  if (!els.toast) return;
  if (els.toastText) els.toastText.textContent = message;
  els.toast.hidden = false;

  clearTimeout(toastTimeout);
  clearTimeout(toastFadeTimeout);

  toastTimeout = setTimeout(() => {
    if (els.toast) els.toast.hidden = true;
  }, duration);
}

function showConfirm(title, description, okText = "Confirmar") {
  if (!els.confirmDialog) return Promise.resolve(true);
  if (els.confirmTitle) els.confirmTitle.textContent = title;
  if (els.confirmDesc) els.confirmDesc.textContent = description;
  if (els.confirmOk) els.confirmOk.textContent = okText;
  els.confirmDialog.showModal();

  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ==========================================================================
   FILTERING & PRESETS ENGINE
   ========================================================================== */

function defaultFilters() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    preset: "current-month",
    startDate: toDateInput(firstDay),
    endDate: toDateInput(lastDay),
    search: "",
  };
}

function handlePresetChange(preset) {
  state.activePreset = preset;
  state.filters.preset = preset;

  const now = new Date();
  let start = null;
  let end = null;

  if (preset === "current-month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (preset === "last-month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === "last-30") {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    end = now;
  } else if (preset === "last-90") {
    start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    end = now;
  } else if (preset === "current-year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  } else if (preset === "all") {
    start = null;
    end = null;
  }

  state.filters.startDate = start ? toDateInput(start) : "";
  state.filters.endDate = end ? toDateInput(end) : "";

  if (els.filtersForm) {
    const startInput = els.filtersForm.querySelector('input[name="start_date"], input[name="start"]');
    const endInput = els.filtersForm.querySelector('input[name="end_date"], input[name="end"]');
    if (startInput) startInput.value = state.filters.startDate;
    if (endInput) endInput.value = state.filters.endDate;
  }

  updatePresetButtonsUI();
  recalculateAndRender();
}

function handleCustomDateChange() {
  if (els.filtersForm) {
    const startInput = els.filtersForm.querySelector('input[name="start_date"], input[name="start"]');
    const endInput = els.filtersForm.querySelector('input[name="end_date"], input[name="end"]');
    state.filters.startDate = startInput?.value || "";
    state.filters.endDate = endInput?.value || "";
  }
  state.activePreset = "custom";
  state.filters.preset = "custom";

  updatePresetButtonsUI();
  recalculateAndRender();
}

function setFilterMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);

  state.filters.startDate = toDateInput(firstDay);
  state.filters.endDate = toDateInput(lastDay);
  state.activePreset = "custom";
  state.filters.preset = "custom";

  if (els.filtersForm) {
    const startInput = els.filtersForm.querySelector('input[name="start_date"], input[name="start"]');
    const endInput = els.filtersForm.querySelector('input[name="end_date"], input[name="end"]');
    if (startInput) startInput.value = state.filters.startDate;
    if (endInput) endInput.value = state.filters.endDate;
  }

  updatePresetButtonsUI();
  recalculateAndRender();
  showToast(`Exibindo competência ${monthKey}`);
}

function handleSearchInput(event) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    state.filters.search = (event.target.value || "").trim().toLowerCase();
    filterEntries();
    render();
  }, 200);
}

function updatePresetButtonsUI() {
  if (!els.presetButtons) return;
  els.presetButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === state.activePreset);
  });
}

function filterEntries() {
  const { startDate, endDate, search } = state.filters;

  state.filteredEntries = state.rawEntries.filter((entry) => {
    if (startDate && entry.date < startDate) return false;
    if (endDate && entry.date > endDate) return false;

    if (search) {
      const target = `${entry.description} ${entry.category} ${entry.payment_method} ${entry.note || ""}`.toLowerCase();
      if (!target.includes(search)) return false;
    }

    return true;
  });
}
