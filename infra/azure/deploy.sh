#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-tamcp-rg}"
LOCATION="${LOCATION:-eastus}"
NAME_PREFIX="${NAME_PREFIX:-tamcp}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "=== Test Automation MCP - Azure Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "Name Prefix: $NAME_PREFIX"
echo ""

# Create resource group
echo "1. Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# Deploy Bicep template
echo "2. Deploying infrastructure..."
DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters namePrefix="$NAME_PREFIX" imageTag="$IMAGE_TAG" \
  --query 'properties.outputs' \
  --output json)

ACR_NAME=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['acrName']['value'])")
ACR_LOGIN_SERVER=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['acrLoginServer']['value'])")

echo "   ACR: $ACR_LOGIN_SERVER"

# Login to ACR
echo "3. Logging into container registry..."
az acr login --name "$ACR_NAME"

# Build and push images
echo "4. Building and pushing API server image..."
docker build -f docker/Dockerfile.api -t "$ACR_LOGIN_SERVER/${NAME_PREFIX}-api:${IMAGE_TAG}" .
docker push "$ACR_LOGIN_SERVER/${NAME_PREFIX}-api:${IMAGE_TAG}"

echo "5. Building and pushing Dashboard image..."
docker build -f docker/Dockerfile.dashboard -t "$ACR_LOGIN_SERVER/${NAME_PREFIX}-dashboard:${IMAGE_TAG}" .
docker push "$ACR_LOGIN_SERVER/${NAME_PREFIX}-dashboard:${IMAGE_TAG}"

# Update container apps with pushed images
echo "6. Updating container apps..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters namePrefix="$NAME_PREFIX" imageTag="$IMAGE_TAG" acrLoginServer="$ACR_LOGIN_SERVER" \
  --output none

# Output results
API_URL=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiUrl']['value'])")
DASHBOARD_URL=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['dashboardUrl']['value'])")

echo ""
echo "=== Deployment Complete ==="
echo "Dashboard: $DASHBOARD_URL"
echo "API Server: $API_URL"
echo ""
echo "Next steps:"
echo "  1. Configure LLM: Set LLM_PROVIDER, LLM_API_KEY env vars on the API container app"
echo "  2. Access the dashboard at: $DASHBOARD_URL"
echo "  3. Upload a requirements document to start testing"
