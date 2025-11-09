#!/bin/bash
# Test script to verify subpath deployment

echo "🧪 Testing Subpath Deployment"
echo "=============================="
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Test Backend Health Check
echo "1️⃣ Testing Backend Health Check"
echo "   URL: http://localhost:8000/HdMImageVideo/health"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/HdMImageVideo/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Backend health check passed (HTTP $HTTP_CODE)"
else
    echo "   ❌ Backend health check failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test Backend Root
echo "2️⃣ Testing Backend Root Endpoint"
echo "   URL: http://localhost:8000/HdMImageVideo/"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/HdMImageVideo/)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Backend root endpoint passed (HTTP $HTTP_CODE)"
else
    echo "   ❌ Backend root endpoint failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test API Docs
echo "3️⃣ Testing API Documentation"
echo "   URL: http://localhost:8000/HdMImageVideo/docs"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/HdMImageVideo/docs)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ API docs accessible (HTTP $HTTP_CODE)"
else
    echo "   ❌ API docs not accessible (HTTP $HTTP_CODE)"
fi
echo ""

# Test Usage Status Endpoint
echo "4️⃣ Testing Usage Status API"
echo "   URL: http://localhost:8000/HdMImageVideo/api/usage/status"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/HdMImageVideo/api/usage/status)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Usage status API passed (HTTP $HTTP_CODE)"
else
    echo "   ❌ Usage status API failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test Frontend
echo "5️⃣ Testing Frontend"
echo "   URL: http://localhost:3000/HdMImageVideo"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/HdMImageVideo)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Frontend accessible (HTTP $HTTP_CODE)"
else
    echo "   ❌ Frontend not accessible (HTTP $HTTP_CODE)"
fi
echo ""

echo "=============================="
echo "✅ Subpath testing complete!"
echo ""
echo "📖 Access URLs:"
echo "   Frontend:     http://localhost:3000/HdMImageVideo"
echo "   Backend API:  http://localhost:8000/HdMImageVideo"
echo "   API Docs:     http://localhost:8000/HdMImageVideo/docs"
echo "   Health Check: http://localhost:8000/HdMImageVideo/health"

