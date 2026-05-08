# GPS Tracker

Monorepo de rastreamento GPS em tempo real com `pnpm` + Turborepo: API (`Bun` + `Elysia` + `Drizzle`), Web (`React` + `Vite`) e Mobile (`Expo`).

## Como Rodar

Atalhos:

- [1) Docker](#1-docker-com-zero-setup)
- [2) Local (API + Web)](#2-desenvolvimento-local-api--web-nodepnpmbun)
- [3) Mobile](#3-mobile-expo)

### 0) Configurar `.env` (vale para Docker e local)

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env
```

### 1) Docker com zero setup

Pré-requisito único:

- Docker + Docker Compose

Sobre `.env` nesse modo:

- O `docker-compose.yml` lê segredos/credenciais a partir do ambiente (`.env`).

Suba tudo (API + Web + Postgres + Redis):

```bash
docker compose up --build -d
```

Se alguma porta já estiver em uso, você pode sobrescrever:

```bash
API_PORT=3300 WEB_PORT=5174 docker compose up --build -d
```

Comandos úteis:

```bash
# ver logs
docker compose logs -f

# parar tudo
docker compose down
```

Banco de dados no Docker (rodar dentro do container da API):

```bash
docker compose exec api bun run db:migrate
docker compose exec api bun run db:seed
```

Endpoints locais:

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Web: `http://localhost:5173`

### 2) Desenvolvimento local (API + Web) (Node/pnpm/Bun)

Pré-requisitos:

- Node.js 20+
- [pnpm](https://pnpm.io/)
- [Bun](https://bun.sh/)
- Docker + Docker Compose

#### 1) Configurar ambiente

Use o passo **0) Configurar `.env`** no topo.

Ajuste no mínimo:

- `JWT_SECRET` e `REFRESH_SECRET` com 32+ caracteres
- `SCALAR_USER` e `SCALAR_PASSWORD` (obrigatórios fora de `production`)
- `EXPO_PUBLIC_API_URL` no mobile (emulador Android geralmente usa `http://10.0.2.2:3000`)

Aviso rápido para o mobile (Expo):

- Em dispositivo físico, `localhost` aponta para o próprio celular (não para seu PC).
- Se quiser testar `localhost` no Android físico via USB, use o IP da sua rede local em `EXPO_PUBLIC_API_URL` (ex.: `http://192.168.x.x:3000`).

#### 2) Subir infraestrutura (Postgres + Redis)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
```

#### 3) Instalar dependências

```bash
pnpm install
```

#### 4) Banco de dados (migrate + seed)

No modo local, use os scripts do monorepo:

```bash
pnpm db:migrate
pnpm db:seed
```

Opcional (quando o schema mudar):

```bash
pnpm db:generate
```

#### 5) Rodar aplicações (API + Web)

Escolha **um** dos modos abaixo (não rode Docker e local ao mesmo tempo para API/Web):

- Modo Docker: `docker compose up --build -d` (API + Web + banco + redis).
- Modo local: use os comandos abaixo para subir apps em modo desenvolvimento.

```bash
# tudo
pnpm dev

# individual
pnpm dev:api
pnpm dev:web
```

Resumo rápido de comandos de banco por modo:

```bash
# local
pnpm db:migrate
pnpm db:seed
pnpm db:generate

# docker full (dentro do container "api")
docker compose exec api bun run db:migrate
docker compose exec api bun run db:seed

# gerar migration (somente local/host)
pnpm db:generate
```

#### 6) Credenciais de seed (para login rápido)

Após rodar o seed, você pode usar:

- Admin do sistema
  - Email: `SEED_ADMIN_EMAIL` (padrão no `.env.example`: `admin@gps-tracker.local`)
  - Senha: `SEED_ADMIN_PASSWORD` (padrão no `.env.example`: `ChangeMe123!`)
- Admin de empresa
  - Email: `company.admin@example.com`
  - Senha: `Password123!`
- Usuário
  - Email: `alice.user@example.com`
  - Senha: `Password123!`

### 3) Mobile (Expo)

Rode o mobile em terminal separado do fluxo de API/Web:

```bash
pnpm dev:mobile
```

Atalhos úteis:

```bash
pnpm android
pnpm ios
```
