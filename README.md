# VideoVault

**Coffre-fort de médias chiffrés** — vidéos, scans et documents stockés en AES-256-GCM,
lisibles uniquement avec votre mot de passe, depuis un navigateur.

---

## Table des matières

1. [Aperçu de l'architecture](#architecture)
2. [Décisions de sécurité](#sécurité)
   - Algorithme de chiffrement
   - Dérivation de clé (KDF)
   - Authentification JWT
   - Protection SQL
   - Headers HTTP
   - Gestion des fichiers temporaires
3. [Structure du projet](#structure)
4. [Installation](#installation)
5. [Variables d'environnement](#variables)
6. [API Reference](#api)
7. [Ce qui a changé vs l'app Python originale](#diff)

---

## Architecture

```
Browser (React/Vite)
  │   HTTPS + cookies httpOnly
  ▼
FastAPI (Python)          ← toute la logique de chiffrement vit ici
  │   SQLAlchemy async
  ▼
SQLite / PostgreSQL        ← métadonnées uniquement (jamais le plaintext)
  │
  ▼
vault/                     ← fichiers .enc (AES-256-GCM, jamais de clair)
```

Le frontend ne touche **jamais** les fichiers `.enc` directement.
Il envoie le mot de passe via HTTPS → le backend déchiffre à la volée →
streame le plaintext en mémoire → le Blob vit dans le navigateur le temps
de la lecture → `URL.revokeObjectURL()` le libère à la fermeture.

---

## Sécurité

### Algorithme de chiffrement : AES-256-GCM

**Pourquoi AES-256-GCM et non Fernet (app originale) ?**

L'app Python originale utilisait `cryptography.Fernet`, qui est AES-128-CBC + HMAC-SHA256.
Solide, mais avec deux limitations :

| Critère | Fernet (original) | AES-256-GCM (VideoVault) |
|---|---|---|
| Longueur de clé | 128 bits | **256 bits** |
| Mode | CBC (padding oracle possible si mal implémenté) | **GCM (AEAD)** |
| Authenticité | HMAC séparé | **Tag GCM intégré** |
| Streaming | Non (blocs independants avec overhead) | **Oui (blocs + compteur)** |

AES-GCM est un chiffrement **authentifié** (AEAD) : confidentialité + intégrité +
authenticité en un seul passage. Si un seul bit du ciphertext est modifié, le
déchiffrement lève une `InvalidTag` **avant** de livrer le moindre plaintext.

**Format des fichiers `.enc` :**
```
[4 bytes : magic "VV01"]         ← détecte les fichiers VideoVault
[4 bytes : taille de bloc]       ← 4 Mo par défaut
[12 bytes : IV de base]          ← unique par fichier, stocké en BDD
puis pour chaque bloc :
  [4 bytes : taille ciphertext]
  [N bytes : ciphertext AES-GCM]
  [16 bytes : GCM tag]           ← inclus dans le ciphertext par la lib
```

Chaque bloc a son propre IV dérivé : `block_iv = base_iv XOR counter`.
Compromettre un bloc ne compromet pas les autres.

---

### Dérivation de clé (KDF)

**Architecture à deux niveaux :**

```
mot_de_passe_utilisateur
        │
        ▼
PBKDF2-HMAC-SHA256 (600 000 itérations)
+ sel unique par fichier (32 bytes aléatoires)
        │
        ▼
clé AES-256 (32 bytes)    ← jamais stockée, recalculée à chaque accès
```

**Pourquoi PBKDF2 avec 600 000 itérations ?**
- Recommandation OWASP 2023 pour PBKDF2-HMAC-SHA256.
- Rend le brute-force coûteux : chaque tentative coûte 600 000 hachages SHA-256.
- 600 000 itérations ≈ 300 ms sur un serveur moderne → acceptable pour l'UX,
  prohibitif pour un attaquant (GPU ne peut pas paralléliser un seul PBKDF2).

**Pourquoi un sel par fichier (et non un sel par utilisateur) ?**
- Si un attaquant vole deux fichiers du même utilisateur, il ne peut pas réutiliser
  les tables précalculées d'un fichier pour attaquer l'autre.
- En pratique : même si deux utilisateurs ont le même mot de passe, leurs clés
  dérivées seront différentes (sel différent).

**Ce qui n'est PAS stocké :**
- Le mot de passe (jamais)
- La clé dérivée (jamais)
- Le plaintext (jamais sur disque, seulement en transit mémoire)

**Ce qui EST stocké (en BDD, non secret) :**
- Le sel PBKDF2 spécifique au fichier (`file_kdf_salt`)
- L'IV AES-GCM de base (`file_iv`)

Ces deux valeurs sont nécessaires au déchiffrement mais ne permettent pas de
retrouver le mot de passe ou la clé sans brute-force.

---

### Authentification JWT

**Pourquoi des cookies httpOnly et non des tokens dans `localStorage` ?**

`localStorage` est accessible depuis JavaScript. Un script XSS (injecté via
une XSS vulnérabilité) peut faire `localStorage.getItem('token')` et exfiltrer
le token d'authentification.

Un cookie `httpOnly` :
- Est envoyé automatiquement par le navigateur à chaque requête
- N'est **pas** accessible depuis JavaScript (`document.cookie` ne le voit pas)
- Est donc immunisé contre le XSS

**Attributs des cookies :**
```
Set-Cookie: access_token=...; HttpOnly; SameSite=Lax; Secure; Path=/
```

- `HttpOnly` : inaccessible à JS
- `SameSite=Lax` : le cookie n'est envoyé que pour les requêtes same-site ou
  top-level navigation → protège contre le CSRF
- `Secure` : uniquement sur HTTPS en production

**Pattern access token / refresh token :**
- Access token : 15 minutes → si volé (impossible avec httpOnly, mais par prudence),
  expire vite
- Refresh token : 7 jours → échangé silencieusement par l'intercepteur Axios
- Le frontend ne voit jamais les tokens, il envoie juste les cookies

**Hachage des mots de passe : bcrypt (rounds=12)**
- bcrypt intègre son propre sel → pas de rainbow table possible
- Facteur de coût adaptatif : augmenter rounds sans recalculer tous les hashes
- Distinct de PBKDF2 : bcrypt sert uniquement à vérifier l'identité,
  PBKDF2 sert à dériver la clé de chiffrement

**Protection brute-force à deux niveaux :**
1. Rate limiting réseau : 5 tentatives/minute par IP (middleware)
2. Verrouillage BDD : 10 échecs consécutifs → compte verrouillé 15 minutes

Les deux messages d'erreur ("utilisateur inconnu" et "mot de passe incorrect")
sont **identiques** → pas d'énumération d'utilisateurs possible.

---

### Protection SQL (injection)

**Toutes les requêtes passent par l'ORM SQLAlchemy avec paramètres bindés.**

```python
# ✅ Correct — paramètre bindé
stmt = select(MediaItem).where(MediaItem.owner_id == user_id)

# ❌ Incorrect — interpolation de chaîne (jamais fait dans VideoVault)
stmt = f"SELECT * FROM media_items WHERE owner_id = {user_id}"
```

**Les colonnes de tri sont une whitelist Pydantic :**
```python
class SortField(str, Enum):
    TITLE = "title"
    CREATED_AT = "created_at"
    SIZE = "size_bytes"
    DURATION = "duration_seconds"
```

Un paramètre `?sort_by=id;DROP TABLE users--` sera rejeté par Pydantic
**avant** d'atteindre la couche BDD.

**Contrôle d'accès au niveau des données :**
```python
# Chaque requête filtre par owner_id — même si l'attaquant connaît l'ID d'un fichier
stmt = select(MediaItem).where(
    MediaItem.id == media_id,
    MediaItem.owner_id == user_id  # ← toujours vérifié
)
```

---

### Headers HTTP de sécurité

Posés par `SecurityHeadersMiddleware` sur toutes les réponses :

| Header | Valeur | Raison |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Empêche le MIME sniffing |
| `X-Frame-Options` | `DENY` | Interdit les iframes (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Pas de fuite d'URL |
| `Content-Security-Policy` | `default-src 'self'` | Bloque les ressources externes non autorisées |
| `Permissions-Policy` | `camera=(), microphone=()` | Désactive les APIs sensibles inutilisées |

---

### Gestion des fichiers temporaires

**Problème de l'app originale :**
Le player Python déchiffrait la vidéo dans `temp/fichier.mp4` sur le disque.
Si le player plantait, le fichier en clair restait sur le disque indéfiniment.

**Solution VideoVault :**
```python
async def decrypt_file_stream(...) -> AsyncGenerator[bytes, None]:
    # Générateur async : yield les blocs déchiffrés un à un
    # Le plaintext ne touche jamais le disque
    yield plaintext_block
```

```python
return StreamingResponse(
    generator,           # ← générateur async
    media_type="video/mp4"
)
# Si le client coupe la connexion → le générateur s'arrête
# Aucun fichier temporaire à nettoyer
```

Côté frontend, le Blob reçu est libéré dès la fermeture du lecteur :
```ts
useEffect(() => {
  return () => URL.revokeObjectURL(blobUrl)  // cleanup au unmount
}, [blobUrl])
```

---

### Path traversal

Le nom du fichier chiffré (`encrypted_filename`) est généré par le serveur
(UUID aléatoire), jamais fourni par le client :

```python
encrypted_filename = f"{uuid.uuid4().hex}.enc"  # ex: "a3f9c2...d7.enc"
encrypted_path = settings.VAULT_DIR / encrypted_filename
```

La BDD stocke uniquement le nom (pas le chemin absolu). Le chemin complet
est reconstruit côté serveur. Un attaquant qui accède à la BDD ne sait pas
où se trouve le vault.

---

## Structure

```
videovault/
├── backend/
│   ├── main.py                  # FastAPI app + CORS + middleware
│   ├── config.py                # Settings pydantic-settings
│   ├── database.py              # Engine SQLAlchemy async + session
│   ├── models/
│   │   ├── user.py              # Modèle User (bcrypt hash, kdf_salt)
│   │   └── media_item.py        # Modèle MediaItem (IV, sel, owner)
│   ├── schemas/
│   │   ├── auth.py              # Validation login/register (Pydantic)
│   │   └── media.py             # SortField enum + réponses media
│   ├── services/
│   │   ├── crypto.py            # AES-256-GCM, PBKDF2, streaming
│   │   └── auth.py              # bcrypt, JWT, cookies
│   ├── routers/
│   │   ├── auth.py              # /api/auth/*
│   │   └── media.py             # /api/media/*
│   ├── middleware/
│   │   └── security.py          # Headers de sécurité HTTP
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts        # Axios + intercepteur refresh token
│   │   │   └── index.ts         # Fonctions authApi / mediaApi
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── Sidebar.tsx
│   │   │   ├── media/
│   │   │   │   ├── MediaCard.tsx
│   │   │   │   ├── MediaGrid.tsx
│   │   │   │   ├── PasswordModal.tsx
│   │   │   │   ├── PlayerModal.tsx
│   │   │   │   ├── UploadModal.tsx
│   │   │   │   ├── RenameModal.tsx
│   │   │   │   └── DeleteModal.tsx
│   │   │   └── ui/
│   │   │       ├── StatsBar.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       └── Pagination.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts       # Contexte auth via react-query
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── HomePage.tsx     # Vue principale
│   │   ├── types/index.ts
│   │   ├── utils/index.ts
│   │   └── api/client.ts
│   ├── tailwind.config.ts
│   ├── vite.config.ts           # Proxy /api → backend
│   └── package.json
│
└── README.md
```

---

## Installation

### Prérequis

- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend

# Créer et activer un environnement virtuel
python -m venv venv
source venv/bin/activate          # Linux/macOS
# venv\Scripts\activate           # Windows

# Installer les dépendances
pip install -r requirements.txt

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env : SECRET_KEY obligatoire en production

# Lancer le serveur de développement
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

npm install

# Lancer le serveur de développement
npm run dev
# → http://localhost:5173
```

Le proxy Vite redirige `/api/*` vers `http://localhost:8000`.

### Production

```bash
# Backend
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend
npm run build
# → dist/ à servir avec nginx / Caddy
```

Exemple de config nginx (reverse proxy) :
```nginx
server {
    listen 443 ssl;
    server_name vault.example.com;

    # Frontend (fichiers statiques)
    location / {
        root /var/www/videovault/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Streaming (pas de buffering)
        proxy_buffering off;
        proxy_read_timeout 3600;
    }
}
```

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `SECRET_KEY` | **OBLIGATOIRE** | Clé de signature JWT (≥ 32 bytes hex) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./videovault.db` | URL de la BDD (SQLite ou PostgreSQL) |
| `FRONTEND_URL` | `http://localhost:5173` | Origine autorisée par CORS |
| `DEBUG` | `false` | Active la doc Swagger et les logs SQL |
| `VAULT_DIR` | `vault` | Dossier de stockage des `.enc` |
| `MAX_UPLOAD_SIZE_MB` | `4096` | Taille maximale d'upload (Mo) |
| `PBKDF2_ITERATIONS` | `600000` | Itérations PBKDF2 (≥ 600 000 en prod) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Durée de vie de l'access token |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Durée de vie du refresh token |

Générer `SECRET_KEY` :
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## API Reference

### Auth

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Créer un compte |
| `POST` | `/api/auth/login` | Se connecter (pose les cookies) |
| `POST` | `/api/auth/logout` | Effacer les cookies |
| `POST` | `/api/auth/refresh` | Rafraîchir l'access token |
| `GET`  | `/api/auth/me` | Profil de l'utilisateur connecté |

### Media

| Méthode | Endpoint | Description |
|---|---|---|
| `GET`    | `/api/media` | Lister les fichiers (paginé, filtré, trié) |
| `POST`   | `/api/media/upload` | Uploader + chiffrer un fichier |
| `POST`   | `/api/media/{id}/stream` | Déchiffrer et streamer un fichier |
| `PATCH`  | `/api/media/{id}/title` | Renommer un fichier |
| `DELETE` | `/api/media/{id}` | Supprimer un fichier |

**Notes :**
- `/stream` est un `POST` (et non `GET`) pour que le mot de passe passe
  dans le corps de la requête, jamais dans l'URL (les URLs sont loggées).
- Tous les endpoints `/media` nécessitent le cookie `access_token`.

---

## Ce qui a changé vs l'app Python originale

| Problème original | Solution VideoVault |
|---|---|
| Clé de chiffrement stockée en clair dans `keys/key.key` | **Clé jamais stockée** : dérivée à la volée depuis le mot de passe via PBKDF2 |
| AES-128 (Fernet) | **AES-256-GCM** (AEAD, 256 bits) |
| Pas d'authentification utilisateur | **Auth JWT + bcrypt** avec cookies httpOnly |
| Fichier temporaire en clair dans `temp/` | **Streaming pur** : le plaintext ne touche jamais le disque |
| `sort_by` interpolé en string dans la query SQL | **Enum Pydantic** (whitelist stricte) |
| `encrypted_path` absolu en BDD | **Nom de fichier uniquement** en BDD, chemin reconstruit côté serveur |
| Pas de headers de sécurité | **CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy** |
| Pas de rate limiting | **5 tentatives/min** (réseau) + **verrouillage 15 min** (BDD) |
| Pas de protection brute-force | **bcrypt rounds=12** + PBKDF2 600 000 itérations |
| Un seul utilisateur implicite | **Multi-utilisateurs** avec contrôle d'accès par `owner_id` |
