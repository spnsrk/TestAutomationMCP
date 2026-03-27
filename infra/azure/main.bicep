@description('Name prefix for all resources')
param namePrefix string = 'tamcp'

@description('Anthropic API key for AI QA agent')
@secure()
param anthropicApiKey string = ''

@description('LLM provider (ollama, openai, anthropic, azure-openai)')
param llmProvider string = 'anthropic'

@description('LLM model name')
param llmModel string = 'claude-sonnet-4-6'

@description('LLM API key (for non-Anthropic providers)')
@secure()
param llmApiKey string = ''

@description('LLM base URL (for self-hosted providers)')
param llmBaseUrl string = ''

@description('Azure region')
param location string = resourceGroup().location

@description('Container image tag')
param imageTag string = 'latest'

@description('ACR login server')
param acrLoginServer string = '${namePrefix}acr.azurecr.io'

var uniqueSuffix = uniqueString(resourceGroup().id)
var envName = '${namePrefix}-env-${uniqueSuffix}'

// Container Apps Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    zoneRedundant: false
  }
}

// API Server Container App
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3100
        transport: 'auto'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
    }
    template: {
      containers: [
        {
          name: 'api-server'
          image: '${acrLoginServer}/${namePrefix}-api:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'PORT', value: '3100' }
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'DB_PATH', value: '/app/data/tamcp.db' }
            { name: 'ANTHROPIC_API_KEY', secureValue: anthropicApiKey }
            { name: 'LLM_PROVIDER', value: llmProvider }
            { name: 'LLM_MODEL', value: llmModel }
            { name: 'LLM_API_KEY', secureValue: llmApiKey }
            { name: 'LLM_BASE_URL', value: llmBaseUrl }
          ]
          volumeMounts: [
            { volumeName: 'data', mountPath: '/app/data' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
      volumes: [
        {
          name: 'data'
          storageType: 'EmptyDir'
        }
      ]
    }
  }
}

// Dashboard Container App
resource dashboardApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-dashboard'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
    }
    template: {
      containers: [
        {
          name: 'dashboard'
          image: '${acrLoginServer}/${namePrefix}-dashboard:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'NEXT_PUBLIC_API_URL', value: 'https://${apiApp.properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Container Registry
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${namePrefix}acr${uniqueSuffix}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output dashboardUrl string = 'https://${dashboardApp.properties.configuration.ingress.fqdn}'
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
