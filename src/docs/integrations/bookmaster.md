# BookMaster Integration

## Overview
BookMaster connects to the gateway service for inventory and accounting sync.

## Authentication
- API Key required in headers
- Client mapping through `externalId`

## Data Flow
1. BookMaster -> Gateway:
    - Product updates
    - Operation records
    - Vendor data

2. Gateway -> BookMaster:
    - Inventory levels
    - Transaction records
    - Status updates

## Configuration
```typescript
{
  "baseUrl": "https://bookmaster.omnistackhub.xyz/api",
  "apiVersion": "v1",
  "webhooks": {
    "inventory": "/webhook/inventory",
    "operations": "/webhook/operations"
  }
}