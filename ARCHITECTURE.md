# Gateway Service Architecture

## Overview
The gateway service manages connections between different platforms and clients in our microservices architecture.

## Components

### ClientApp
Platform representation (e.g., BookMaster, Qytetaret)  
**Key features:**
- API key management
- Platform configurations
- Domain settings

### Client
Business entity representation (e.g., ByBest Duty Free)  
**Core attributes:**
- `clientAppId`: Platform link
- `externalId`: BookMaster reference (e.g., id of Bybest Duty Free on BookMaster Platform)
- Base configuration

## System Connections

```mermaid
graph TB
    BookMaster[BookMaster] --> Gateway[Gateway Service]
    MetroShop[MetroShop] --> Gateway
    Gateway --> ClientApp[ClientApp Collection]
    Gateway --> Client[Client Collection]
    Client -- clientAppId --> ClientApp
    Client -- externalId --> BookMaster


## Authentication Flow

```typescript
// External system auth
const client = await Client.findOne({ 
  clientAppId: 'bookmaster123',
  externalId: 'bybest456'
});

## Key Identifiers

| Identifier     | Purpose               | Example        |
|----------------|-----------------------|----------------|
| `clientAppId`  | Platform linking      | `bookmaster123`|
| `externalId`   | BookMaster mapping    | `bybest456`    |
| `apiKey`       | Request authentication| `sk_live_...`  |

## Related Documentation
- [/docs/integrations/bookmaster.md](#)
- [/docs/integrations/metroshop.md](#)
- [/docs/auth/api-keys.md](#)


