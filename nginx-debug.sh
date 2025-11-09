#!/bin/bash
# Nginx SSL Debugging Script
# Run this on your server to diagnose SSL issues

echo "=== Nginx SSL Debugging ==="
echo ""

echo "1. Checking if nginx is listening on port 443:"
sudo netstat -tlnp | grep :443
echo ""

echo "2. Checking certificate files:"
sudo ls -la /etc/letsencrypt/live/kay.fyi/
echo ""

echo "3. Checking certificate file permissions:"
sudo stat /etc/letsencrypt/live/kay.fyi/fullchain.pem
sudo stat /etc/letsencrypt/live/kay.fyi/privkey.pem
echo ""

echo "4. Testing if nginx can read certificate files:"
sudo nginx -t 2>&1 | grep -i ssl
echo ""

echo "5. Checking nginx error log for SSL errors:"
sudo tail -20 /var/log/nginx/error.log | grep -i ssl
echo ""

echo "6. Checking which config nginx is using:"
sudo nginx -T 2>&1 | grep -A 3 "listen 443"
echo ""

echo "7. Testing SSL connection from server:"
echo | openssl s_client -connect localhost:443 -servername kay.fyi 2>&1 | head -20
echo ""

echo "8. Checking if certificate files are readable by nginx user:"
sudo -u www-data test -r /etc/letsencrypt/live/kay.fyi/fullchain.pem && echo "fullchain.pem is readable" || echo "fullchain.pem is NOT readable"
sudo -u www-data test -r /etc/letsencrypt/live/kay.fyi/privkey.pem && echo "privkey.pem is readable" || echo "privkey.pem is NOT readable"
echo ""

echo "9. Checking nginx process user:"
ps aux | grep nginx | grep -v grep | head -1
echo ""

echo "10. Full nginx test:"
sudo nginx -t
echo ""

echo "=== Debugging Complete ==="

