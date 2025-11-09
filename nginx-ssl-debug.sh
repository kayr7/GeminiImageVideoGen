#!/bin/bash
# Debug nginx SSL configuration

echo "=== Nginx SSL Debugging ==="
echo ""

echo "1. Checking nginx SSL configuration:"
sudo nginx -T 2>&1 | grep -A 20 "listen 443" | head -30
echo ""

echo "2. Checking certificate paths in config:"
sudo grep -E "ssl_certificate|ssl_certificate_key" /etc/nginx/sites-enabled/gemini-app
echo ""

echo "3. Verifying certificate files are readable:"
sudo test -r /etc/letsencrypt/live/kay.fyi/fullchain.pem && echo "✓ fullchain.pem readable" || echo "✗ fullchain.pem NOT readable"
sudo test -r /etc/letsencrypt/live/kay.fyi/privkey.pem && echo "✓ privkey.pem readable" || echo "✗ privkey.pem NOT readable"
echo ""

echo "4. Checking certificate file contents (first few lines):"
sudo head -3 /etc/letsencrypt/live/kay.fyi/fullchain.pem
echo ""

echo "5. Checking nginx error log for SSL errors:"
sudo tail -30 /var/log/nginx/error.log | grep -i -E "ssl|cert|key" || echo "No SSL errors in recent logs"
echo ""

echo "6. Testing certificate and key match:"
sudo openssl x509 -noout -modulus -in /etc/letsencrypt/live/kay.fyi/fullchain.pem | openssl md5
sudo openssl rsa -noout -modulus -in /etc/letsencrypt/live/kay.fyi/privkey.pem 2>/dev/null | openssl md5 || \
sudo openssl ec -noout -modulus -in /etc/letsencrypt/live/kay.fyi/privkey.pem 2>/dev/null | openssl md5
echo "(If these match, certificate and key are paired correctly)"
echo ""

echo "7. Checking nginx process and user:"
ps aux | grep nginx | grep -v grep | head -2
echo ""

echo "8. Full nginx configuration test:"
sudo nginx -t
echo ""

echo "9. Checking if there are multiple server blocks on 443:"
sudo nginx -T 2>&1 | grep -B 2 -A 5 "listen.*443"
echo ""

echo "=== Debug Complete ==="

