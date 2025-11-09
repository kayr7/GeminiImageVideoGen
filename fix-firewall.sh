#!/bin/bash
# Fix firewall to allow HTTPS traffic

echo "Checking firewall status..."

# Check UFW (Ubuntu/Debian)
if command -v ufw &> /dev/null; then
    echo "UFW firewall detected"
    echo "Current status:"
    sudo ufw status
    
    echo ""
    echo "Allowing HTTPS..."
    sudo ufw allow 443/tcp
    sudo ufw allow 'Nginx Full'
    
    echo ""
    echo "New status:"
    sudo ufw status
fi

# Check firewalld (CentOS/RHEL)
if command -v firewall-cmd &> /dev/null; then
    echo "firewalld detected"
    echo "Current status:"
    sudo firewall-cmd --list-all
    
    echo ""
    echo "Allowing HTTPS..."
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
    
    echo ""
    echo "New status:"
    sudo firewall-cmd --list-all
fi

# Check iptables
echo ""
echo "Checking iptables rules for port 443:"
sudo iptables -L -n | grep 443 || echo "No iptables rules found for 443"

echo ""
echo "=== Firewall check complete ==="
echo "Try accessing https://kay.fyi from outside now"

