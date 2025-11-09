# Deployment Guide
# Gemini Image & Video Generation Platform

**Version:** 1.0.0  
**Last Updated:** November 8, 2025

---

## Quick Start

### Prerequisites
- Docker (recommended) OR Node.js 18+
- Google Gemini API key
- At least 2GB RAM
- 10GB disk space

### Using Docker (Recommended)

1. **Clone and configure**:
```bash
cd /Users/kayrottmann/Coding/GeminiImagVideoGen
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

2. **Build and run**:
```bash
docker-compose up -d
```

3. **Access**:
```
http://localhost:3000/HdMImageVideo
```

### Using Node.js

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

3. **Run development server**:
```bash
npm run dev
```

4. **Or build and run production**:
```bash
npm run build
npm start
```

---

## Environment Configuration

### Required Variables

```bash
GEMINI_API_KEY=your_api_key_here
```

### Optional Variables

```bash
# Application
NEXT_PUBLIC_BASE_PATH=/HdMImageVideo
NODE_ENV=production

# Rate Limiting
RATE_LIMIT_STORAGE=memory
REDIS_URL=redis://localhost:6379

# Image Generation Limits
IMAGE_MAX_PER_HOUR=50
IMAGE_MAX_PER_DAY=200

# Video Generation Limits
VIDEO_MAX_PER_HOUR=3
VIDEO_MAX_PER_DAY=10

# Music Generation Limits
MUSIC_MAX_PER_HOUR=10
MUSIC_MAX_PER_DAY=50
```

---

## Production Deployment

### Docker Deployment

1. **Build production image**:
```bash
docker build -t gemini-playground:latest .
```

2. **Run container**:
```bash
docker run -d \
  --name gemini-playground \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  gemini-playground:latest
```

3. **Check health**:
```bash
curl http://localhost:3000/HdMImageVideo
```

### Docker Compose (with Redis)

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - RATE_LIMIT_STORAGE=redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

---

## Reverse Proxy Configuration

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /HdMImageVideo/ {
        proxy_pass http://localhost:3000/HdMImageVideo/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings for long-running API calls
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        
        # File upload size limit
        client_max_body_size 10M;
    }
}
```

### Apache

```apache
<VirtualHost *:80>
    ServerName your-domain.com

    ProxyPreserveHost On
    ProxyTimeout 300

    <Location /HdMImageVideo/>
        ProxyPass http://localhost:3000/HdMImageVideo/
        ProxyPassReverse http://localhost:3000/HdMImageVideo/
    </Location>

    # File upload size limit
    LimitRequestBody 10485760
</VirtualHost>
```

### Traefik (Docker)

```yaml
services:
  app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gemini.rule=PathPrefix(`/HdMImageVideo`)"
      - "traefik.http.services.gemini.loadbalancer.server.port=3000"
```

---

## Cloud Deployment

### AWS ECS

1. **Create ECR repository**:
```bash
aws ecr create-repository --repository-name gemini-playground
```

2. **Build and push**:
```bash
docker build -t gemini-playground .
docker tag gemini-playground:latest YOUR_ECR_URI:latest
docker push YOUR_ECR_URI:latest
```

3. **Create ECS task definition** with environment variables
4. **Create ECS service** with load balancer

### Google Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/gemini-playground

# Deploy
gcloud run deploy gemini-playground \
  --image gcr.io/PROJECT_ID/gemini-playground \
  --platform managed \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=your_key \
  --allow-unauthenticated
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gemini-playground
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gemini-playground
  template:
    metadata:
      labels:
        app: gemini-playground
    spec:
      containers:
      - name: app
        image: your-registry/gemini-playground:latest
        ports:
        - containerPort: 3000
        env:
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: gemini-secrets
              key: api-key
        - name: RATE_LIMIT_STORAGE
          value: "redis"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: gemini-playground
spec:
  selector:
    app: gemini-playground
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

---

## Monitoring & Logging

### Health Checks

**Endpoint**: `http://localhost:3000/HdMImageVideo`

**Docker Health Check**:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/HdMImageVideo', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

### Logging

**View Docker logs**:
```bash
docker logs -f gemini-playground
```

**Kubernetes logs**:
```bash
kubectl logs -f deployment/gemini-playground
```

### Monitoring Metrics

Key metrics to monitor:
- Response times (API routes)
- Error rates
- Rate limit hits
- Memory usage
- CPU usage
- Gemini API quota usage

---

## Security Hardening

### 1. API Key Management

- Never commit `.env` to version control
- Use secrets management (AWS Secrets Manager, Vault, etc.)
- Rotate API keys regularly
- Monitor API usage for anomalies

### 2. Network Security

```nginx
# Rate limiting at nginx level
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;

# Block bad user agents
if ($http_user_agent ~* (bot|crawler|spider)) {
    return 403;
}
```

### 3. Container Security

```dockerfile
# Run as non-root user
USER nextjs

# Read-only filesystem where possible
docker run --read-only --tmpfs /tmp gemini-playground
```

### 4. HTTPS Configuration

```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    # ... rest of config
}
```

---

## Scaling

### Horizontal Scaling

When using Redis for rate limiting:

```bash
# Multiple Docker containers
docker-compose up -d --scale app=3
```

### Load Balancing

```nginx
upstream gemini_backend {
    least_conn;
    server app1:3000;
    server app2:3000;
    server app3:3000;
}

server {
    location /HdMImageVideo/ {
        proxy_pass http://gemini_backend/HdMImageVideo/;
    }
}
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs gemini-playground

# Verify environment variables
docker exec gemini-playground env | grep GEMINI

# Test API key
docker exec gemini-playground node -e "console.log(process.env.GEMINI_API_KEY)"
```

### Rate limiting not working

```bash
# Check storage backend
# If using Redis, verify connection
docker exec gemini-playground npm run test-redis

# Check rate limit configuration
docker exec gemini-playground env | grep MAX_PER
```

### API errors

```bash
# Test Gemini API connectivity
curl -H "x-goog-api-key: YOUR_KEY" \
  https://generativelanguage.googleapis.com/v1/models

# Check application logs
docker logs -f gemini-playground | grep ERROR
```

### Performance issues

```bash
# Monitor resource usage
docker stats gemini-playground

# Check memory leaks
docker exec gemini-playground node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"

# Profile slow requests
# Enable Node.js profiling and analyze
```

---

## Backup & Recovery

### Configuration Backup

```bash
# Backup environment
cp .env .env.backup.$(date +%Y%m%d)

# Backup Docker volumes
docker run --rm \
  -v gemini_redis-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/redis-backup.tar.gz /data
```

### Disaster Recovery

1. **Have API key backed up securely**
2. **Keep docker-compose.yml in version control**
3. **Document custom configurations**
4. **Test recovery procedures regularly**

---

## Maintenance

### Update Procedure

1. **Backup current state**:
```bash
docker-compose down
docker commit gemini-playground gemini-playground:backup
```

2. **Pull new version**:
```bash
git pull origin main
```

3. **Rebuild and restart**:
```bash
docker-compose build
docker-compose up -d
```

4. **Verify**:
```bash
curl http://localhost:3000/HdMImageVideo
docker logs gemini-playground
```

### Regular Maintenance Tasks

- **Weekly**: Check logs for errors
- **Monthly**: Review and adjust rate limits
- **Quarterly**: Update dependencies (`npm update`)
- **Annually**: Rotate API keys and secrets

---

## Support

For deployment issues:
1. Check logs first
2. Review this deployment guide
3. Consult ARCHITECTURE.md for system design
4. Check PRD.md for feature requirements
5. Review Changelog.md for recent changes

---

*Last Updated: November 8, 2025*  
*Version: 1.0.0*

