# FinFlow · Gestão Financeira Pessoal (50/30/20 & VR)

**FinFlow** é uma aplicação web moderna e serverless para gestão financeira pessoal baseada na consagrada metodologia **50/30/20** com suporte a controle independente de **Carteira VR (Vale-Refeição/Alimentação)**.

Construído com frontend nativo em JavaScript moderno (ES Modules) e infraestrutura em nuvem no ecossistema **Firebase (Authentication, Cloud Firestore e Hosting)**.

---

## ✨ Funcionalidades Principais

- **Metodologia 50/30/20**:
  - **50% Necessidades**: Gastos essenciais (moradia, contas básicas, supermercado, saúde).
  - **30% Desejos**: Estilo de vida, lazer, hobbies, passeios e compras.
  - **20% Investimentos / Reserva**: Aportes e reserva de emergência.
- **Carteira VR Isolada**:
  - Controle dedicado de saldo inicial, recebimentos (créditos) e despesas sem distorcer o fluxo de renda líquida principal.
- **Autenticação Firebase & Multi-Tenant**:
  - Cadastro e login seguros com e-mail e senha via Firebase Auth.
  - Dados isolados por usuário no Cloud Firestore (`users/{uid}`).
- **Interface Moderna & Fluida**:
  - Modal de login minimalista incorporado no canto inferior esquerdo.
  - Seleção ágil no modal de lançamento através de **Chips Interativos** coloridos e atalhos rápidos de categoria.
  - Formatação monetária com máscara em tempo real (`R$ 0,00`).
  - Notificações toast e alertas com auto-dismiss inteligente (3 segundos).
  - Gráficos de alta resolução (DPI Retina) para distribuição e evolução acumulada de despesas.
  - Filtros rápidos por período (*Este Mês*, *Mês Anterior*, *Últimos 30 dias*, *Ano Atual*) e busca instantânea com *debounce*.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 Moderno (Custom Properties, Grid, Flexbox, Glassmorphism, Keyframes), JavaScript Vanilla ES Modules (ESM).
- **Autenticação**: [Firebase Authentication](https://firebase.google.com/docs/auth)
- **Banco de Dados NoSQL**: [Cloud Firestore](https://firebase.google.com/docs/firestore)
- **Hospedagem**: [Firebase Hosting](https://firebase.google.com/docs/hosting)

---

## 🚀 Como Executar Localmente

Como o projeto é uma SPA (Single Page Application) estática que se comunica diretamente com o Firebase, você pode rodar qualquer servidor HTTP simples:

### Opção 1: Servidor Python
```bash
python -m http.server 8080 --directory static
```
Acesse no navegador: `http://localhost:8080`

### Opção 2: Firebase CLI Emulator / Serve
```bash
# Instale a CLI do Firebase se ainda não tiver:
npm install -g firebase-tools

# Teste localmente
firebase emulators:start
# ou
firebase serve
```

---

## 🌐 Deploy no Firebase Hosting

1. Faça login na sua conta Firebase:
   ```bash
   firebase login
   ```
2. Realize o deploy para produção:
   ```bash
   firebase deploy
   ```

---

## 🔒 Regras de Segurança do Firestore

As regras de segurança (`firestore.rules`) garantem que apenas o próprio usuário autenticado possa ler e gravar suas configurações e lançamentos:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
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

## 📁 Estrutura de Diretórios

```
fin-flow/
├── firebase.json          # Configuração do Firebase Hosting
├── firestore.rules        # Regras de segurança do Cloud Firestore
├── .gitignore             # Arquivos ignorados no versionamento
├── README.md              # Documentação do projeto
└── static/                # Arquivos da aplicação estática
    ├── index.html         # Estrutura e marcação SPA
    ├── styles.css         # Design System e estilos visuais
    └── app.js             # Lógica reativa e integração com Firebase SDK v12
```

---

## 📄 Licença

Distribuído sob a licença MIT.
