# FinFlow · Gestão Financeira Pessoal Multiplataforma (50/30/20 & VR)

[![Versão](https://img.shields.io/badge/vers%C3%A3o-1.1.0-amber.svg)](https://github.com/juanalenca/fin-flow)
[![Deploy](https://img.shields.io/badge/deploy-Firebase%20Hosting-blue.svg)](https://fin-flow-app.web.app)
[![Plataformas](https://img.shields.io/badge/plataformas-Web%20%7C%20Android%20%7C%20iOS-green.svg)](https://github.com/juanalenca/fin-flow)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-lightgrey.svg)](LICENSE)

O **FinFlow** é uma aplicação progressiva e nativa multiplataforma (Web, Android e iOS via Capacitor) de alta performance para planejamento e controle financeiro pessoal. O sistema implementa a metodologia orçamentária **50/30/20** de forma dinâmica, combinada com controle isolado de **Carteira VR (Vale-Refeição / Alimentação)**, fechamento de competência com gestão de sobras/troco de aportes e telemetria vetorial em tempo real.

---

## 🌐 Acesso em Produção

- **Aplicação Web Oficial**: [https://fin-flow-app.web.app](https://fin-flow-app.web.app)
- **Domínio Alternativo**: [https://fn-flow.web.app](https://fn-flow.web.app)
- **Repositório GitHub**: [https://github.com/juanalenca/fin-flow](https://github.com/juanalenca/fin-flow)

---

## ✨ Funcionalidades Principais

### 1. Metodologia 50/30/20 Dinâmica
- **50% Necessidades**: Despesas essenciais (moradia, contas básicas, saúde, transporte, supermercado).
- **30% Desejos**: Estilo de vida, lazer, hobbies, gastronomia, assinaturas e compras pessoais.
- **20% Investimentos & Reserva**: Aportes protegidos e construção de reserva de emergência.

### 2. Carteira VR Isolada (Benefícios)
- Gestão dedicada para saldo inicial, recebimentos (créditos de benefício) e despesas de alimentação sem inflar ou distorcer o fluxo de caixa da renda líquida principal.

### 3. Command Center & Fechamento de Competência
- **Cálculo de Sobras Orçamentárias**: Apuração automática da economia não gasta nas faixas de 50% e 30%.
- **Troco de Investimentos Protegido**: Rastreamento da margem não aportada da faixa de 20%.
- **Histórico de Fechamentos**: Persistência de competências anteriores para comparação de evolução temporal.

### 4. Telemetria Vetorial Pura (Pure SVG)
- **Gráficos em SVG Nativo**: Gráfico de rosca (*Donut*) com legenda responsiva e gráfico de evolução acumulada com gradiente e marcadores luminescentes.
- Imunes a problemas de escala e distorção em telas de alta densidade de pixels (Retina / Android DPI elevado).

### 5. Ergonomia Mobile First & Design Impeccable
- **Dock Inferior Simétrico**: Grid balanceado de 7 colunas no mobile `[Geral] [50%] [30%] [+] [20%] [Metas] [Extrato]`.
- **Bottom Sheet de Gestão de Conta**: Acesso instantâneo a perfil, status de sincronização e logout seguro ao tocar no avatar.
- **Transições Físicas Suaves**: Animações com curvas de desaceleração natural (`cubic-bezier`), micro-transições de visualização e feedback tátil.

### 6. Sincronização em Nuvem & Resiliência Offline
- **Multi-Tenant Seguro**: Autenticação via Firebase Auth (E-mail/Senha e Google Sign-In) com persistência em tempo real via listeners `onSnapshot` do Cloud Firestore.
- **Fallback Local**: Operação contínua via `localStorage` com sincronização automática após autenticação.

### 7. Atualização Automática no App (In-App Update)
- Verificação de versão com base em `version.json` e download direto de novas versões.

---

## 🛠️ Arquitetura & Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARQUITETURA DO FINFLOW                            │
├────────────────────────┬──────────────────────────┬─────────────────────────┤
│    Camada Visual       │   Engenharia de Regras   │     Infraestrutura      │
│  (UI/UX & Mobile First)│    (Módulo Financeiro)   │  (Cloud & Multi-Plat)   │
├────────────────────────┼──────────────────────────┼─────────────────────────┤
│ • HTML5 / CSS3 Tokens  │ • Regras 50/30/20        │ • Firebase Auth         │
│ • SVG Charts Nativos   │ • Carteira VR            │ • Cloud Firestore Sync  │
│ • Safe Area Insets     │ • Fechamento de Mês      │ • Firebase Multi-Site   │
│ • Dock Simétrico       │ • Testes Automatizados   │ • Capacitor (Android/iOS│
└────────────────────────┴──────────────────────────┴─────────────────────────┘
```

- **Frontend**: HTML5 Semântico, CSS3 (Design Tokens, Grid, Flexbox, Keyframes), Vanilla JavaScript (ES Modules).
- **Motor Financeiro**: [`static/financial-engine.js`](static/financial-engine.js) (Módulo desacoplado com testes unitários automatizados).
- **Mobile Runtime**: [Capacitor 7](https://capacitorjs.com/) (Plugins oficiais de SplashScreen, StatusBar e Updater).
- **Autenticação & Backend**: [Firebase Authentication](https://firebase.google.com/docs/auth) e [Cloud Firestore](https://firebase.google.com/docs/firestore).
- **Hosting & CI/CD**: [Firebase Hosting](https://firebase.google.com/docs/hosting) e [GitHub Actions](.github/workflows/) (Deploy Contínuo e Build de APK Android).

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** (versão 18 ou superior)
- **Git**
- **Firebase CLI** (opcional para emulação: `npm install -g firebase-tools`)

### 1. Clonar o Repositório
```bash
git clone https://github.com/juanalenca/fin-flow.git
cd fin-flow
npm install
```

### 2. Executar os Testes Unitários
Validação da integridade matemática do motor financeiro:
```bash
npm test
```

### 3. Iniciar Servidor Web Local
Você pode rodar localmente com qualquer servidor estático HTTP:

```bash
# Opção A: Python
python -m http.server 8080 --directory static

# Opção B: Firebase Serve
firebase serve
```
Acesse no navegador: `http://localhost:8080` (ou a porta informada pelo Firebase).

---

## 📱 Execução e Build Mobile (Android & iOS)

### Sincronizar Assets da Web com as Plataformas Nativas
```bash
npm run sync
```

### 🤖 Android (Android Studio / APK)
```bash
# Abrir o projeto no Android Studio:
npm run open:android

# Gerar APK de Debug via CLI:
npm run build:apk
```
O APK gerado estará localizado em `android/app/build/outputs/apk/debug/app-debug.apk`.

### 🍎 iOS (Xcode)
```bash
# Abrir o projeto no Xcode (Requer macOS):
npm run open:ios
```

---

## 🌐 Deploy em Produção (Firebase Hosting)

1. Autentique na CLI do Firebase:
   ```bash
   firebase login
   ```
2. Realize o deploy para as instâncias de Hosting e regras do Firestore:
   ```bash
   firebase deploy
   ```

> **Nota de CI/CD**: O repositório possui integração contínua configurada via GitHub Actions. Qualquer `push` ou `merge` na branch `main` executa automaticamente o deploy para produção.

---

## 🔒 Regras de Segurança do Cloud Firestore

As regras de segurança ([`firestore.rules`](firestore.rules)) garantem isolamento por usuário autenticado (*row-level security*):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // FinFlow: isolamento estrito por UID autenticado
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 📁 Estrutura do Projeto

```
fin-flow/
├── .github/
│   └── workflows/
│       ├── build-apk.yml               # Pipeline de compilação automatizada do APK Android
│       ├── firebase-hosting-merge.yml  # Deploy automático no merge da branch main
│       └── firebase-hosting-pull-request.yml
├── android/                            # Projeto nativo Android (Gradle, Manifest, Assets)
├── ios/                                # Projeto nativo iOS (Xcode Workspace, Pods)
├── static/                             # Core da Aplicação Web e PWA
│   ├── app.js                          # Orquestrador da interface e listeners Firestore
│   ├── financial-engine.js             # Motor matemático desacoplado de regras 50/30/20
│   ├── financial-engine.test.mjs       # Suíte de testes unitários do motor financeiro
│   ├── icon.svg                        # Ícone vetorial da aplicação
│   ├── index.html                      # Markup SPA semântico com Safe Area Insets
│   ├── manifest.json                   # Manifesto PWA
│   ├── styles.css                      # Design Tokens, Transições e Regras Responsivas
│   └── version.json                    # Metadados de versão para o motor In-App Update
├── capacitor.config.json               # Configurações de ponte nativa Capacitor
├── firebase.json                       # Configuração de múltiplos targets do Hosting
├── firestore.rules                     # Regras de segurança de banco NoSQL
├── package.json                        # Dependências do ecossistema e scripts de build
├── DESIGN.md                           # Especificação de Design System & Tokens
├── PRODUCT.md                          # Diretrizes de Produto e Posicionamento
├── DOCUMENTO_CONSOLIDADO_FINFLOW.md    # Relatório executivo consolidado de evolução
└── README.md                           # Documentação principal
```

---

## 📄 Licença

Este projeto está licenciado sob os termos da licença **MIT**. Consulte o arquivo de licença para mais detalhes.
