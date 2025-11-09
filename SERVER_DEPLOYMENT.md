# Server Deployment Guide with Nginx and SSL

**Version:** 1.0.0  
**Last Updated:** November 8, 2025

This guide provides step-by-step instructions for deploying the Gemini Image & Video Generation Platform on a Linux server with nginx as a reverse proxy and SSL/TLS encryption.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installing Nginx](#installing-nginx)
3. [Configuring Nginx](#configuring-nginx)
4. [Setting Up SSL Certificate](#setting-up-ssl-certificate)
5. [Firewall Configuration](#firewall-configuration)
6. [Testing the Deployment](#testing-the-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Security Hardening](#security-hardening)

---

## Prerequisites

Before starting, ensure you have:

- ✅ A Linux server (Ubuntu 20.04+, Debian 11+, CentOS 8+, or similar)
- ✅ Root or sudo access
- ✅ A domain name pointing to your server's IP address (for SSL)
- ✅ Docker and Docker Compose installed
- ✅ Ports 80 and 443 open in your firewall
- ✅ Application running on `localhost:3000` (frontend) and `localhost:8000` (backend)

### Verify Domain DNS

Ensure your domain's A record points to your server's IP:

```bash
# Get your server's public IP
curl ifconfig.me
# or
hostname -I

# Check DNS resolution for main domain
dig your-domain.com +short
# or
nslookup your-domain.com

# Check DNS resolution for www subdomain (if using)
dig www.your-domain.com +short
# or
nslookup www.your-domain.com
```

**Important**: If you plan to use `www.your-domain.com`, ensure it has a DNS A record pointing to the same IP as your main domain. Both domains must resolve to your server's IP for Let's Encrypt to issue a certificate covering both.

---

## Installing Nginx

### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install nginx
sudo apt install nginx -y

# Start and enable nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify installation
sudo systemctl status nginx
```

### CentOS/RHEL/Rocky Linux

```bash
# Install EPEL repository (if not already installed)
sudo yum install epel-release -y

# Install nginx
sudo yum install nginx -y

# Start and enable nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify installation
sudo systemctl status nginx
```

### Verify Nginx is Running

```bash
# Check if nginx is listening on port 80
sudo netstat -tlnp | grep :80
# or
sudo ss -tlnp | grep :80

# Test nginx in browser
curl http://localhost
```

You should see the default nginx welcome page.

---

## Configuring Nginx

We'll configure nginx in two phases:
1. **Phase 1**: HTTP-only configuration (works without SSL certificates)
2. **Phase 2**: Add SSL after obtaining certificates

### Phase 1: HTTP-Only Configuration (Before SSL)

Create a new configuration file for your application:

```bash
sudo nano /etc/nginx/sites-available/gemini-app
```

**For Ubuntu/Debian** (uses `sites-available`):
```nginx
# HTTP server - serves application (will add HTTPS redirect after SSL setup)
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Allow Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Logging
    access_log /var/log/nginx/gemini-app-access.log;
    error_log /var/log/nginx/gemini-app-error.log;

    # Frontend (Next.js) - Proxy to port 3000
    location /HdMImageVideo/ {
        proxy_pass http://localhost:3000/HdMImageVideo/;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Cache control
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings for long-running API calls
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 300s;
        
        # File upload size limit
        client_max_body_size 10M;
    }

    # Backend API (FastAPI) - Proxy to port 8000
    location /HdMImageVideo/api/ {
        # Rate limiting (requires limit_req_zone in http context - optional)
        # limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://localhost:8000/HdMImageVideo/api/;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        
        # Timeout settings for long-running video generation
        proxy_read_timeout 600s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 600s;
        
        # File upload size limit
        client_max_body_size 10M;
    }

    # Health check endpoint
    location /HdMImageVideo/health {
        proxy_pass http://localhost:8000/HdMImageVideo/health;
        access_log off;
    }
}
```

**For CentOS/RHEL** (uses `conf.d`):
```bash
sudo nano /etc/nginx/conf.d/gemini-app.conf
```

Use the same configuration content as above.

### Step 1.5: Configure Rate Limiting (Optional)

The `limit_req_zone` directive must be in the `http` context, not in a server block. Add it to your main nginx configuration:

```bash
sudo nano /etc/nginx/nginx.conf
```

Find the `http {` block and add the rate limiting zone inside it (before any `include` directives that load your site configs):

```nginx
http {
    # Rate limiting zone (must be in http context)
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    
    # ... rest of http block configuration
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

**Note:** If you don't want rate limiting, you can skip this step and remove the `limit_req zone=api_limit burst=20 nodelay;` line from the backend API location block in your site configuration.

### Step 2: Enable the Configuration

**Ubuntu/Debian:**
```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/gemini-app /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default
```

**CentOS/RHEL:**
The configuration is already enabled if placed in `/etc/nginx/conf.d/`.

### Step 3: Test Nginx Configuration

```bash
# Test configuration syntax
sudo nginx -t

# If successful, reload nginx
sudo systemctl reload nginx
```

### Step 4: Verify HTTP Configuration

At this point, you should be able to access your site via HTTP:

```bash
# Test nginx configuration
sudo nginx -t

# If successful, reload nginx
sudo systemctl reload nginx

# Test HTTP endpoint
curl -I http://your-domain.com/HdMImageVideo/
```

You should see a `200 OK` response. The site is now working over HTTP.

---

## Setting Up SSL Certificate

We'll use **Let's Encrypt** with **Certbot** for free SSL certificates.

### Step 1: Install Certbot

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

**CentOS/RHEL:**
```bash
sudo yum install certbot python3-certbot-nginx -y
# or for newer versions
sudo dnf install certbot python3-certbot-nginx -y
```

**If the nginx plugin is not available**, you can use the standalone method:

```bash
# Install certbot without nginx plugin
sudo apt install certbot -y  # Ubuntu/Debian
sudo yum install certbot -y  # CentOS/RHEL

# Stop nginx temporarily for standalone mode
sudo systemctl stop nginx

# Obtain certificate using standalone method
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Start nginx again
sudo systemctl start nginx
```

### Step 2: Obtain SSL Certificate

**Option A: Automatic Configuration with Nginx Plugin (Recommended if available):**

Certbot can automatically configure nginx:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts:
- Enter your email address (for renewal notifications)
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

Certbot will automatically:
- Obtain the certificate
- Update your nginx configuration with SSL settings
- Add HTTPS redirect if you choose

**Option B: Manual Configuration (If nginx plugin unavailable):**

If you used the standalone method or prefer manual setup:

1. **Obtain certificate** (if not already done):
```bash
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com
```

2. **Update nginx configuration** to add HTTPS server block. Edit your config file:
```bash
sudo nano /etc/nginx/sites-available/gemini-app
```

Add this HTTPS server block **after** your HTTP server block:

```nginx
# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/gemini-app-access.log;
    error_log /var/log/nginx/gemini-app-error.log;

    # Frontend (Next.js) - Proxy to port 3000
    location /HdMImageVideo/ {
        proxy_pass http://localhost:3000/HdMImageVideo/;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Cache control
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings for long-running API calls
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 300s;
        
        # File upload size limit
        client_max_body_size 10M;
    }

    # Backend API (FastAPI) - Proxy to port 8000
    location /HdMImageVideo/api/ {
        # Rate limiting (optional)
        # limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://localhost:8000/HdMImageVideo/api/;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        
        # Timeout settings for long-running video generation
        proxy_read_timeout 600s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 600s;
        
        # File upload size limit
        client_max_body_size 10M;
    }

    # Health check endpoint
    location /HdMImageVideo/health {
        proxy_pass http://localhost:8000/HdMImageVideo/health;
        access_log off;
    }
}
```

3. **Update HTTP server block** to redirect to HTTPS. Change the HTTP server block to:

```nginx
# HTTP server - redirects to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Allow Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

4. **Test and reload**:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 3: Verify Certificate Installation

```bash
# Check certificate files
sudo ls -la /etc/letsencrypt/live/your-domain.com/

# Test SSL connection
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

### Step 4: Set Up Auto-Renewal

Let's Encrypt certificates expire every 90 days. Set up automatic renewal:

**Important:** If you used `--standalone` mode to get your certificate, you need to update the renewal configuration to use `webroot` method so renewals work without stopping nginx.

**Fix Renewal Configuration (If using standalone mode):**

```bash
# Edit the renewal configuration
sudo nano /etc/letsencrypt/renewal/kay.fyi.conf
```

Find the line that says:
```ini
authenticator = standalone
```

Change it to:
```ini
authenticator = webroot
webroot_path = /var/www/html,
```

The file should look something like this:
```ini
[renewalparams]
account = ...
authenticator = webroot
webroot_path = /var/www/html,
server = https://acme-v02.api.letsencrypt.org/directory
```

**Now test renewal:**

```bash
# Test renewal process (should work without stopping nginx)
sudo certbot renew --dry-run

# Certbot automatically creates a systemd timer, verify it's active
sudo systemctl status certbot.timer

# Enable the timer (if not already enabled)
sudo systemctl enable certbot.timer
```

**If you used nginx plugin** (not standalone), renewal should work automatically without changes.

**Optional: Add renewal hook to reload nginx:**

```bash
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Add:
```bash
#!/bin/bash
systemctl reload nginx
```

Make it executable:
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### Step 5: Verify HTTPS is Working

```bash
# Test HTTPS endpoint
curl -I https://your-domain.com/HdMImageVideo/

# Check SSL rating (optional)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com
```

---

## Firewall Configuration

**IMPORTANT:** If SSL works from localhost but not from outside, your firewall is likely blocking port 443!

### Ubuntu/Debian (UFW)

```bash
# Check current firewall status
sudo ufw status

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'
# or individually:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If firewall is inactive, enable it
sudo ufw enable

# Verify HTTPS port is allowed
sudo ufw status | grep 443
```

**If UFW is blocking, you'll see output like:**
```
Status: active
To                         Action      From
--                         ------      ----
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere  # Should see this
```

### CentOS/RHEL (firewalld)

```bash
# Allow HTTP and HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# Reload firewall
sudo firewall-cmd --reload

# Check status
sudo firewall-cmd --list-all
```

### Alternative: iptables

```bash
# Allow HTTP
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Allow HTTPS
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Save rules (varies by distribution)
sudo iptables-save > /etc/iptables/rules.v4
```

---

## Testing the Deployment

### 1. Test Frontend

```bash
# Test frontend endpoint
curl -I https://your-domain.com/HdMImageVideo/

# Should return 200 OK
```

### 2. Test Backend API

```bash
# Test health endpoint
curl https://your-domain.com/HdMImageVideo/health

# Test API docs
curl https://your-domain.com/HdMImageVideo/docs
```

### 3. Test in Browser

1. Open `https://your-domain.com/HdMImageVideo/`
2. Verify SSL certificate (green lock icon)
3. Test image generation
4. Test video generation
5. Check browser console for errors

### 4. Monitor Logs

```bash
# Nginx access logs
sudo tail -f /var/log/nginx/gemini-app-access.log

# Nginx error logs
sudo tail -f /var/log/nginx/gemini-app-error.log

# Application logs (Docker)
docker-compose logs -f frontend
docker-compose logs -f backend
```

---

## Troubleshooting

### Issue: Nginx won't start

```bash
# Check configuration syntax
sudo nginx -t

# Check for port conflicts
sudo netstat -tlnp | grep -E ':(80|443)'

# Check nginx error log
sudo tail -50 /var/log/nginx/error.log
```

### Issue: 502 Bad Gateway

This usually means nginx can't reach your application:

```bash
# Verify application is running
docker ps

# Check if ports are accessible
curl http://localhost:3000/HdMImageVideo/
curl http://localhost:8000/HdMImageVideo/health

# Check nginx error log
sudo tail -f /var/log/nginx/gemini-app-error.log
```

**Solution:** Ensure Docker containers are running:
```bash
cd /path/to/your/app
docker-compose up -d
```

### Issue: SSL Certificate Errors

```bash
# Verify certificate exists
sudo ls -la /etc/letsencrypt/live/your-domain.com/

# Check certificate expiration
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Verify nginx config references correct paths
sudo grep -r "ssl_certificate" /etc/nginx/
```

### Issue: Certificate Works for Main Domain but Not www Subdomain

This is almost always a **DNS configuration issue**. Let's Encrypt needs to verify that both domains point to your server.

**Step 1: Verify DNS Records**

Check if both domains resolve to the same IP:

```bash
# Check main domain
dig your-domain.com +short
# or
nslookup your-domain.com

# Check www subdomain
dig www.your-domain.com +short
# or
nslookup www.your-domain.com
```

Both should return the **same IP address** (your server's IP).

**Step 2: Fix DNS (If www doesn't point to your server)**

You need to add a DNS A record for the www subdomain:

1. **Log into your domain registrar or DNS provider** (e.g., Cloudflare, Namecheap, GoDaddy)
2. **Add an A record**:
   - **Type**: A
   - **Name**: `www` (or `www.your-domain.com` depending on provider)
   - **Value/IP**: Your server's IP address (same as main domain)
   - **TTL**: 3600 (or default)

3. **Wait for DNS propagation** (can take a few minutes to 48 hours):
```bash
# Check if DNS has propagated
dig www.your-domain.com +short

# Or use online tools:
# https://www.whatsmydns.net/#A/www.your-domain.com
```

**Step 3: Retry Certificate Request**

Once DNS is correct, retry:

```bash
# Stop nginx temporarily
sudo systemctl stop nginx

# Get certificate for both domains
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Start nginx
sudo systemctl start nginx
```

**Alternative: Get Certificate Without www (Temporary Solution)**

If you can't fix DNS right now, you can get a certificate for just the main domain:

```bash
# Get certificate for main domain only
sudo certbot certonly --standalone -d your-domain.com
```

Then update your nginx config to only use the main domain:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;  # Remove www.your-domain.com
    
    # ... rest of config
}
```

You can add www later by:
1. Fixing DNS
2. Re-running certbot with both domains
3. Updating nginx config

**Common DNS Issues:**

- **CNAME instead of A record**: Some providers use CNAME for www. This works, but make sure it points to the main domain or directly to your IP.
- **DNS propagation delay**: Changes can take time. Use `dig` or online DNS checkers to verify.
- **Wrong IP address**: Double-check your server's public IP with `curl ifconfig.me` or `hostname -I`.

### Issue: Connection Timeout

```bash
# Check firewall
sudo ufw status
# or
sudo firewall-cmd --list-all

# Test connectivity
telnet your-domain.com 443

# Check if application is listening
sudo netstat -tlnp | grep -E ':(3000|8000)'
```

### Issue: 404 Not Found

```bash
# Verify basePath configuration
# Check NEXT_PUBLIC_BASE_PATH in docker-compose.yml
# Check ROOT_PATH in backend/.env

# Test direct backend access
curl http://localhost:8000/HdMImageVideo/health
```

### Issue: CORS Errors

Ensure your nginx config includes proper headers:
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

### Issue: SSL Handshake Error - "tlsv1 alert internal error"

If you get this error when trying to access HTTPS:
```
error:1404B438:SSL routines:ST_CONNECT:tlsv1 alert internal error
```

This usually means nginx isn't properly configured to serve HTTPS or the HTTPS server block is missing.

**Step 1: Check if nginx is listening on port 443**

```bash
# Check if nginx is listening on port 443
sudo netstat -tlnp | grep :443
# or
sudo ss -tlnp | grep :443
```

If nothing shows up, nginx isn't listening on port 443.

**Step 2: Verify HTTPS server block exists**

```bash
# Check your nginx configuration
sudo cat /etc/nginx/sites-enabled/gemini-app
# or
sudo cat /etc/nginx/conf.d/gemini-app.conf
```

Look for a `server` block with `listen 443 ssl`. If it's missing, you need to add it (see "Option B: Manual Configuration" in the SSL setup section).

**Step 3: Check nginx configuration syntax**

```bash
# Test nginx configuration
sudo nginx -t
```

Fix any errors shown.

**Step 4: Check nginx error logs**

```bash
# Check for SSL-related errors
sudo tail -50 /var/log/nginx/error.log | grep -i ssl
```

Common errors:
- Certificate file not found
- Permission denied on certificate files
- SSL configuration syntax errors

**Step 5: Verify certificate files exist and are readable**

```bash
# Check certificate files
sudo ls -la /etc/letsencrypt/live/kay.fyi/

# Verify nginx can read them
sudo nginx -t
```

**Step 6: Ensure HTTPS server block is configured**

Your nginx config should have both HTTP and HTTPS server blocks. The HTTPS block should look like:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kay.fyi;

    ssl_certificate /etc/letsencrypt/live/kay.fyi/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kay.fyi/privkey.pem;
    
    # ... rest of SSL and location config
}
```

**Step 7: Reload nginx**

After fixing the configuration:

```bash
# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx

# Or restart if reload doesn't work
sudo systemctl restart nginx
```

**Step 8: Test again**

```bash
# Test HTTPS connection
curl -I https://kay.fyi/HdMImageVideo/

# Or test with openssl
openssl s_client -connect kay.fyi:443 -servername kay.fyi
```

**Common causes:**
- HTTPS server block not added to nginx config
- Certificate paths incorrect in nginx config
- Nginx not reloaded after adding HTTPS config
- Firewall blocking port 443
- SSL configuration syntax errors

### Issue: HTTP Returns 404 or HTTPS SSL Handshake Fails

If you get 404 on HTTP or SSL handshake errors on HTTPS, check the following:

**Step 1: Verify nginx is using your configuration**

```bash
# Check which config files nginx is loading
sudo nginx -T 2>&1 | grep -A 5 "server_name kay.fyi"

# Or check all server blocks
sudo nginx -T 2>&1 | grep -E "server_name|listen"
```

**Step 2: Check if nginx is listening on both ports**

```bash
# Check what nginx is listening on
sudo netstat -tlnp | grep nginx
# or
sudo ss -tlnp | grep nginx
```

You should see both port 80 and 443.

**Step 3: Check for conflicting server blocks**

```bash
# List all enabled sites
ls -la /etc/nginx/sites-enabled/

# Check if default site is interfering
sudo cat /etc/nginx/sites-enabled/default
```

If there's a default site, it might be catching requests. Remove or disable it:
```bash
sudo rm /etc/nginx/sites-enabled/default
```

**Step 4: Verify your config file is enabled**

```bash
# Ubuntu/Debian - check if symlink exists
ls -la /etc/nginx/sites-enabled/gemini-app

# If missing, create it:
sudo ln -s /etc/nginx/sites-available/gemini-app /etc/nginx/sites-enabled/gemini-app
```

**Step 5: Check nginx error logs for specific errors**

```bash
# Check recent errors
sudo tail -100 /var/log/nginx/error.log

# Watch errors in real-time
sudo tail -f /var/log/nginx/error.log
```

Look for:
- "no server name matching" - server_name mismatch
- "could not build server_names_hash" - duplicate server_name
- SSL certificate errors
- Permission denied errors

**Step 6: Test nginx configuration**

```bash
# Test configuration (will show errors)
sudo nginx -t

# If there are errors, fix them before proceeding
```

**Step 7: Ensure server_name matches your domain exactly**

In your config, make sure:
```nginx
server_name kay.fyi www.kay.fyi;
```

Matches exactly (no typos, correct domain).

**Step 8: Check if there's a default_server conflict**

If you have multiple server blocks, one might be set as default. Check:
```bash
sudo nginx -T 2>&1 | grep default_server
```

**Step 9: Restart nginx (not just reload)**

Sometimes a full restart helps:
```bash
sudo systemctl restart nginx
sudo systemctl status nginx
```

**Step 10: Verify certificate paths are correct**

```bash
# Check if certificate files exist
sudo ls -la /etc/letsencrypt/live/kay.fyi/

# Verify paths in config match
sudo grep ssl_certificate /etc/nginx/sites-enabled/gemini-app
```

**Quick Fix: Ensure default server is set correctly**

If you have multiple server blocks, explicitly set your HTTPS block as default:

```nginx
server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name kay.fyi www.kay.fyi;
    # ... rest of config
}
```

And for HTTP:
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name kay.fyi www.kour-domain.com;
    # ... rest of config
}
```

### Issue: SSL Works Locally but Fails Externally - "no peer certificate available"

If SSL works from `localhost` but fails from outside with "no peer certificate available", this usually means:

1. **Multiple server blocks conflicting** - Another server block is catching the request
2. **SNI (Server Name Indication) issue** - Nginx needs the correct server_name
3. **Certificate path issue** - Nginx can't read the certificate files

**Step 1: Check for conflicting server blocks**

```bash
# List all server blocks listening on 443
sudo nginx -T 2>&1 | grep -B 5 -A 10 "listen.*443"
```

If you see multiple blocks, ensure your domain's block has `default_server`.

**Step 2: Verify certificate paths are absolute and correct**

In your nginx config, ensure paths are absolute:
```nginx
ssl_certificate /etc/letsencrypt/live/kay.fyi/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/kay.fyi/privkey.pem;
```

**Step 3: Check if nginx can read certificate files**

```bash
# Test as nginx user (Ubuntu/Debian uses www-data)
sudo -u www-data test -r /etc/letsencrypt/live/kay.fyi/fullchain.pem && echo "Readable" || echo "NOT readable"
sudo -u www-data test -r /etc/letsencrypt/live/kay.fyi/privkey.pem && echo "Readable" || echo "NOT readable"
```

**Step 4: Ensure SSL directives are in the correct order**

Your HTTPS server block must have SSL directives before location blocks:
```nginx
server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name kay.fyi www.kay.fyi;
    
    # SSL directives MUST come before location blocks
    ssl_certificate /etc/letsencrypt/live/kay.fyi/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kay.fyi/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    # ... other SSL settings
    
    # Then location blocks
    location / {
        # ...
    }
}
```

**Step 5: Check nginx error logs for specific SSL errors**

```bash
# Watch error log in real-time while testing
sudo tail -f /var/log/nginx/error.log
```

Then from another terminal, try:
```bash
curl https://kay.fyi/
```

Look for errors like:
- `SSL_CTX_use_certificate_file() failed`
- `could not build server_names_hash`
- `no "ssl_certificate" is defined`

**Step 6: Restart nginx (not just reload)**

Sometimes a full restart is needed:
```bash
sudo systemctl restart nginx
sudo systemctl status nginx
```

**Step 7: Verify the actual config nginx is using**

```bash
# Show the actual configuration nginx loaded
sudo nginx -T 2>&1 | grep -A 30 "server_name kay.fyi"
```

This shows exactly what nginx sees, which might differ from your config file.

### Issue: Redirect Loop (308/301 Loop)

If you see a redirect loop in the browser (alternating 308 and 301 status codes), this is usually caused by:

1. **Trailing slash redirect conflicts** - Nginx and Next.js both trying to handle trailing slashes
2. **HTTP to HTTPS redirect conflicting with app redirects**
3. **Multiple redirect rules conflicting**

**Solution: Fix redirect logic in nginx config**

Update your HTTPS server block to handle redirects properly:

```nginx
server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name kay.fyi www.kay.fyi;

    # ... SSL config ...

    # Handle root - redirect to app
    location = / {
        return 301 https://$server_name/HdMImageVideo/;
    }

    # Normalize trailing slash - redirect /HdMImageVideo to /HdMImageVideo/
    location = /HdMImageVideo {
        return 301 https://$server_name/HdMImageVideo/;
    }

    # Frontend (Next.js) - Proxy to port 3000
    location /HdMImageVideo/ {
        proxy_pass http://localhost:3000/HdMImageVideo/;
        proxy_http_version 1.1;
        
        # ... rest of proxy config ...
    }

    # Backend API - no trailing slash redirect needed
    location /HdMImageVideo/api/ {
        proxy_pass http://localhost:8000/HdMImageVideo/api/;
        # ... rest of config ...
    }
}
```

**Key points:**
- Use `location = /HdMImageVideo` (exact match) to redirect without trailing slash to with trailing slash
- Use `location /HdMImageVideo/` (prefix match) for the actual proxy
- Don't add redirects in the proxy location blocks
- Ensure Next.js isn't also redirecting (check `next.config.js`)

**Test the fix:**
```bash
# Test redirect
curl -I https://kay.fyi/HdMImageVideo

# Should return 301 to /HdMImageVideo/
# Then test the final URL
curl -I https://kay.fyi/HdMImageVideo/
```

### Issue: Certificate Renewal Fails - Port 80 Already in Use

If you get this error when running `certbot renew --dry-run`:
```
Could not bind TCP port 80 because it is already in use by another process
```

This happens because certbot is trying to use `standalone` mode, which requires stopping nginx.

**Solution: Update renewal configuration to use webroot method**

```bash
# Edit your renewal configuration file
sudo nano /etc/letsencrypt/renewal/your-domain.com.conf
```

Find the `[renewalparams]` section and change:
```ini
authenticator = standalone
```

To:
```ini
authenticator = webroot
webroot_path = /var/www/html,
```

The renewal config should look like:
```ini
[renewalparams]
account = YOUR_ACCOUNT_ID
authenticator = webroot
webroot_path = /var/www/html,
server = https://acme-v02.api.letsencrypt.org/directory
```

**Verify nginx serves the webroot directory:**

Your nginx config should already have this (from the HTTP server block):
```nginx
location /.well-known/acme-challenge/ {
    root /var/www/html;
}
```

**Test renewal again:**
```bash
sudo certbot renew --dry-run
```

This should now work without stopping nginx.

**Alternative: If webroot doesn't work, use nginx plugin:**

If you have the nginx plugin installed, you can also change to:
```ini
authenticator = nginx
```

But webroot is simpler and doesn't require the nginx plugin.

---

## Security Hardening

### 1. Hide Nginx Version

Edit `/etc/nginx/nginx.conf`:
```nginx
http {
    server_tokens off;
    # ... other settings
}
```

### 2. Rate Limiting

Rate limiting is configured in the `http` context of `/etc/nginx/nginx.conf`. Adjust limits as needed:
```nginx
# In /etc/nginx/nginx.conf, inside http { } block:
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

Then use it in location blocks:
```nginx
location /HdMImageVideo/api/ {
    limit_req zone=api_limit burst=20 nodelay;
    # ... rest of config
}
```

### 3. Block Bad User Agents

```nginx
# In server block
if ($http_user_agent ~* (bot|crawler|spider|scraper)) {
    return 403;
}
```

### 4. Restrict Access to Admin Endpoints

```nginx
# Protect health endpoint (optional)
location /HdMImageVideo/health {
    allow 127.0.0.1;
    deny all;
    proxy_pass http://localhost:8000/HdMImageVideo/health;
}
```

### 5. Enable Fail2Ban (Optional)

Protect against brute force attacks:

```bash
# Install fail2ban
sudo apt install fail2ban -y  # Ubuntu/Debian
sudo yum install fail2ban -y  # CentOS/RHEL

# Create nginx filter
sudo nano /etc/fail2ban/filter.d/nginx-limit-req.conf
```

Add:
```ini
[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>
ignoreregex =
```

Create jail:
```bash
sudo nano /etc/fail2ban/jail.d/nginx.conf
```

Add:
```ini
[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/*error.log
maxretry = 10
findtime = 600
bantime = 3600
```

Restart fail2ban:
```bash
sudo systemctl restart fail2ban
```

### 6. Regular Security Updates

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

---

## Maintenance

### Update SSL Certificate

Certificates auto-renew, but you can manually renew:

```bash
sudo certbot renew
sudo systemctl reload nginx
```

### Update Nginx Configuration

After making changes:

```bash
# Test configuration
sudo nginx -t

# Reload nginx (zero downtime)
sudo systemctl reload nginx
```

### Monitor Logs

Set up log rotation (usually automatic):

```bash
# Check logrotate config
cat /etc/logrotate.d/nginx
```

### Backup Configuration

```bash
# Backup nginx config
sudo tar -czf nginx-backup-$(date +%Y%m%d).tar.gz /etc/nginx/

# Backup SSL certificates
sudo tar -czf ssl-backup-$(date +%Y%m%d).tar.gz /etc/letsencrypt/
```

---

## Quick Reference Commands

```bash
# Nginx
sudo systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo nginx -t

# Certbot
sudo certbot certificates
sudo certbot renew
sudo certbot renew --dry-run

# Logs
sudo tail -f /var/log/nginx/gemini-app-access.log
sudo tail -f /var/log/nginx/gemini-app-error.log

# Firewall (UFW)
sudo ufw status
sudo ufw allow 'Nginx Full'

# Firewall (firewalld)
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-service=https
```

---

## Next Steps

After successful deployment:

1. ✅ Set up monitoring (e.g., UptimeRobot, Pingdom)
2. ✅ Configure log aggregation (e.g., ELK stack, CloudWatch)
3. ✅ Set up automated backups
4. ✅ Review and adjust rate limits
5. ✅ Monitor SSL certificate expiration
6. ✅ Set up alerts for application errors

---

## Support

For issues:
1. Check nginx error logs: `/var/log/nginx/gemini-app-error.log`
2. Check application logs: `docker-compose logs`
3. Verify DNS resolution
4. Test SSL: https://www.ssllabs.com/ssltest/
5. Review this guide and DEPLOYMENT.md

---

*Last Updated: November 8, 2025*  
*Version: 1.0.0*

