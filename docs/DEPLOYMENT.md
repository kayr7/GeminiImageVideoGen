# Deployment Guide

The app is two services served under one subpath (default `/HdMImageVideo`):

```
https://example.com/HdMImageVideo/        -> Next.js frontend  (port 3000)
https://example.com/HdMImageVideo/api/*   -> FastAPI backend   (port 8000)
```

## 1. Configure

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`. At minimum set `GEMINI_API_KEY`, `APP_USERNAME`, `APP_PASSWORD`
(the bootstrap admin account), and `ROOT_PATH`. All variables are documented in
[`backend/.env.example`](../backend/.env.example). Never commit `.env`.

Frontend variables (`NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_API_URL`) are inlined at
**build time**. The defaults (`/HdMImageVideo`) match `docker-compose.yml`. To use a
different subpath, change `ROOT_PATH`, rebuild the frontend with
`--build-arg NEXT_PUBLIC_BASE_PATH=/other --build-arg NEXT_PUBLIC_API_URL=/other`, and
adapt the nginx config and health check URLs.

## 2. Run

### Docker Compose (recommended)

```bash
docker-compose up --build -d      # or ./start-docker.sh
docker-compose logs -f
docker-compose down
```

- Frontend: http://localhost:3000/HdMImageVideo
- API docs: http://localhost:8000/HdMImageVideo/docs
- Health: http://localhost:8000/HdMImageVideo/health

Persistent data is bind-mounted from `backend/`:

| Host path | Contents |
|---|---|
| `backend/.data` | SQLite database (users, quotas, media index, text history) |
| `backend/.media-storage` | Generated images/videos |
| `backend/.video-jobs` | Video job queue |
| `backend/data` | `admin-config.json` (admin model enable/disable overrides) |

### Local development (no Docker)

Requires Python 3.11+ and Node 18+. `./start-dev.sh` does the following:

```bash
# backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
ROOT_PATH=/HdMImageVideo uvicorn main:app --reload --port 8000 --root-path /HdMImageVideo

# frontend (second terminal, repo root)
npm install && npm run dev        # http://localhost:3000/HdMImageVideo
```

## 3. Production server with nginx + HTTPS

1. Point your DNS A/AAAA record at the server and open ports 80/443
   (e.g. `sudo ufw allow 80,443/tcp`).
2. Install nginx and certbot (`sudo apt install nginx certbot`).
3. Start the containers (section 2). Bind them to localhost only if nginx is the sole entry point.
4. Copy [`nginx.conf.example`](nginx.conf.example) to `/etc/nginx/sites-available/gemini-app`,
   replace `kay.fyi` with your domain, and enable it:
   ```bash
   sudo ln -s /etc/nginx/sites-available/gemini-app /etc/nginx/sites-enabled/
   ```
5. Obtain a certificate before enabling the 443 block (the config references the cert files).
   Either comment out the HTTPS server first and run
   `sudo certbot certonly --webroot -w /var/www/html -d example.com`, or use
   `sudo certbot certonly --standalone -d example.com` with nginx stopped.
6. `sudo nginx -t && sudo systemctl reload nginx`.
7. Certbot installs a systemd timer for renewal; verify with `sudo certbot renew --dry-run`.

Key points in the nginx config:
- `location /HdMImageVideo/api/` must be defined **before** `/HdMImageVideo` and proxies to port 8000
  with long timeouts (video generation can take minutes).
- `/HdMImageVideo` proxies to port 3000 with WebSocket upgrade headers.
- Prompt Lab streams Server-Sent Events: buffering is disabled by the backend's `X-Accel-Buffering: no`
  header (no `proxy_buffering off;` needed), but `proxy_read_timeout` for `/api/` should be at least 120s.
- `client_max_body_size` limits uploads (reference images); the example sets 10M.

## 4. Updating

```bash
git pull
docker-compose up --build -d
```

### One-time: slim the database (installs created before the fast gallery)

Older versions stored students' reference images as base64 inside the SQLite
database, which made it several GB and the gallery slow. The new code serves those
rows fine, but moving the images to files gives the full speed-up and shrinks the DB:

```bash
docker-compose stop backend
cp -a backend/.data backend/.data.bak && cp -a backend/.media-storage backend/.media-storage.bak
docker-compose run --rm backend python scripts/migrate_media_inputs.py \
  --data-dir /app/.data --media-dir /app/.media-storage --dry-run --i-know-this-is-live
docker-compose run --rm backend python scripts/migrate_media_inputs.py \
  --data-dir /app/.data --media-dir /app/.media-storage --vacuum --i-know-this-is-live
docker-compose up -d backend
```

The script is idempotent. VACUUM needs free disk space roughly equal to the DB size.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `GEMINI_API_KEY not found` in logs | Create `backend/.env`; restart the backend container |
| Cannot log in as admin | Run `cd backend && python fix_admin.py` (or `docker-compose exec backend python fix_admin.py`). It reads `ADMIN_USERNAME`/`APP_USERNAME` and the matching password variables from `.env` and creates or resets the admin user in the database |
| 404 on every API call | `ROOT_PATH`, `NEXT_PUBLIC_BASE_PATH` and the nginx `location` blocks must use the same subpath |
| CORS errors in the browser | Add the site origin to `CORS_ORIGINS` (comma-separated) |
| Video requests time out behind nginx | Raise `proxy_read_timeout` on the `/api/` location |
| Redirect loop on `/HdMImageVideo` | Ensure only one place (nginx or Next.js) adds/strips the trailing slash; use the example config unchanged |
| Admin model changes lost after restart | Mount `backend/data` (see the table above) or set `ADMIN_CONFIG_PATH` to a persistent path |
| Port already in use | `docker-compose down`, or change the ports in `docker-compose.yml` |
