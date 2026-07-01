# Crucible — Deployment (crucible.hypexio.com, neben hypexio)

Crucible läuft als eigener Docker-Compose-Stack auf **demselben Hetzner-Server** wie hypexio
(`178.104.229.200`). Es bringt **eigene Postgres + Redis** mit (rührt hypexios Daten nicht an)
und hängt sich nur für das Reverse-Proxying an hypexios **geteilten Caddy** (Ports 80/443).

```
                crucible.hypexio.com (DNS A -> 178.104.229.200)
                          │ 443
                          ▼
                  hypexio-caddy  (bereits vorhanden, ein Site-Block je Domain)
              /health, /api/*  ┘        └  /*
                     ▼                        ▼
              crucible-api:8000        crucible-web:3000     (Next.js standalone)
                     │  (FastAPI + arq worker)
                     ▼
             crucible-db (pg16)   crucible-redis (7)   ← eigenes internes Netz
```

- **Bilder:** GHCR, gepusht von `.github/workflows/deploy.yml` als
  `ghcr.io/devhamburg/crucible-api:<sha>` und `-web:<sha>`. Der Worker nutzt das api-Image (arq).
- **Frontend↔API:** same-origin über `/api/*` (Caddy strippt `/api`) → keine CORS-Probleme.
  Das web-Image backt `NEXT_PUBLIC_API_URL=https://crucible.hypexio.com/api` zur Build-Zeit ein.
- **Migrationen:** keine — die API legt Tabellen bei Start an (`create_all`) und seedet
  Modelle/Benchmarks automatisch beim ersten Start.

## Server-Verzeichnis
```
/opt/crucible/
  docker-compose.prod.yml   # rsynced vom Repo
  deploy-recreate.sh        # rsynced vom Repo
  .env                      # geheim, einmalig anlegen (siehe .env.prod.example)
```

## Einmaliges Setup

### 1. GitHub-Repo `DevHamburg/crucible`
Leeres Repo in GitHub anlegen (privat empfohlen). Dann lokal:
```bash
cd /home/guber/dev/ai-benchmark
git remote add origin git@github.com:DevHamburg/crucible.git
git push -u origin main
```

### 2. GitHub Secrets (Settings → Secrets and variables → Actions)
| Secret            | Wert                                                              |
| ----------------- | ---------------------------------------------------------------- |
| `HETZNER_HOST`    | `178.104.229.200`                                                |
| `HETZNER_USER`    | `deploy`                                                         |
| `HETZNER_SSH_KEY` | kompletter Inhalt von `hypexio/SSH/hypexio_deploy_key` (PEM)     |
| `DEPLOY_PATH`     | `/opt/crucible`                                                  |
| `HEALTH_URL`      | `https://crucible.hypexio.com/health` (optional, default ok)        |

`GITHUB_TOKEN` ist automatisch da (GHCR-Push).

### 3. GHCR-Pull-Auth
Nach dem ersten `images`-Run entweder die Pakete `crucible-api` / `crucible-web` in GitHub auf
**public** stellen, **oder** auf dem Server einmal `docker login ghcr.io` (PAT mit
`read:packages`).

### 4. DNS
Beim Domain-Provider (Strato) einen Record setzen:
| Type | Host    | Wert                | TTL  |
| ---- | ------- | ------------------- | ---- |
| `A`  | `crucible` | `178.104.229.200`   | 3600 |

Prüfen: `dig +short crucible.hypexio.com @1.1.1.1` → `178.104.229.200`.

### 5. Caddy-Block in **hypexios** Repo ergänzen (dauerhaft)
Den Inhalt von `infra/caddy/crucible.hypexio.com.caddy` **an hypexios**
`infra/caddy/Caddyfile` anhängen, committen, pushen — hypexios Deploy rollt den geänderten
Caddyfile aus und Caddy holt automatisch das TLS-Zert für `crucible.hypexio.com`.

> Warum in hypexios Repo? Weil hypexios Deploy den Caddyfile per rsync überschreibt — ein nur
> auf dem Server angehängter Block würde beim nächsten hypexio-Deploy verschwinden. Der Block
> ist rein additiv und ändert die bestehenden hypexio-Sites nicht.

Alternativ ohne hypexio-Deploy (nur wenn nötig): Block direkt in `/opt/hypexio/Caddyfile`
einfügen und `docker exec hypexio-caddy caddy reload --config /etc/caddy/Caddyfile` — **muss**
aber zusätzlich ins hypexio-Repo, sonst verloren beim nächsten Deploy.

### 6. Server-`.env` anlegen
```bash
ssh deploy@178.104.229.200
sudo mkdir -p /opt/crucible && sudo chown deploy:deploy /opt/crucible
cd /opt/crucible
# .env.prod.example wird beim ersten Deploy hierher rsynced; als Vorlage nutzen:
cp .env.prod.example .env   # (oder manuell anlegen)
# Secrets erzeugen:
echo "SECRET_KEY=$(openssl rand -base64 48)" >> .env
python3 -c "from cryptography.fernet import Fernet;print('ENCRYPTION_KEY='+Fernet.generate_key().decode())" >> .env
# POSTGRES_PASSWORD, FIRST_ADMIN_PASSWORD, EDGE_NETWORK prüfen/setzen.
# EDGE_NETWORK: echtes Netz von hypexios Caddy verifizieren:
docker inspect hypexio-caddy -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

### 7. Erster Deploy
`git push origin main` → Workflow baut Images, pusht zu GHCR, deployt. Danach:
```bash
curl -fsSL https://crucible.hypexio.com/health   # {"status":"ok"}
```
(TLS-Erstausstellung kann 30–60 s dauern.)

## Umami-Analytics (geteilte Instanz stats.hypexio.com)
Dein bestehendes Umami trackt auch crucible.hypexio.com:
1. In der Umami-UI (`https://stats.hypexio.com`) **Settings → Websites → Add**: Name `Crucible`,
   Domain `crucible.hypexio.com` → generierte **Website-UUID** kopieren.
2. In GitHub die **Repository-Variable** (nicht Secret) setzen: Settings → Secrets and variables →
   Actions → **Variables** → `UMAMI_WEBSITE_ID` = die UUID. (Optional `UMAMI_SRC`, default
   `https://stats.hypexio.com/script.js`.)
3. Nächster Deploy backt die ID ins web-Image → das Umami-Script lädt automatisch. Pageviews
   erscheinen in Umami → Realtime. Ohne gesetzte ID wird kein Tracking-Script ausgeliefert.

## Rollback
```bash
ssh deploy@178.104.229.200 && cd /opt/crucible
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<vorheriger-sha>/" .env
docker compose --env-file .env -f docker-compose.prod.yml up -d --remove-orphans
```

## Betrieb
```bash
cd /opt/crucible
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f crucible-api
# DB-Backup (analog hypexios pg-backup):
docker exec crucible-db pg_dump -U crucible crucible | gzip > backup-$(date +%F).sql.gz
```

## Sicherheit
- Crucible-`db`/`redis` sind im internen Netz, **nicht** öffentlich.
- Der Caddy-Block terminiert TLS und setzt HSTS/Nosniff-Header.
- Code-Ausführung (Coding-Benchmarks) läuft im Worker-Container mit rlimits — für einen
  öffentlichen Multi-User-Betrieb den Worker zusätzlich isolieren (eigener Host/gVisor), falls
  anonyme Nutzer beliebigen Code einreichen können.
