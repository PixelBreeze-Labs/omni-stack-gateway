# OmniStack API Gateway Documentation

## Overview
OmniStack API Gateway serves as a core shared infrastructure that manages multiple client applications and their respective clients. It provides centralized authentication, client management, and shared services across different platforms.

## Architecture

### Core Components

1. **Client Apps (Platforms)**
    - Represents different SaaS platforms using the gateway
    - Example: BookMaster (ID: `67957b75172a3de27fd14a98`)
    - Each platform has its own database and client management
    - Platforms are registered in the core shared database
    - Each platform can access shared services through authenticated API calls

2. **Clients**
    - End users/organizations using the client apps
    - Dual Storage Strategy:
        - Primary record in OmniStack Gateway (core shared DB)
        - Secondary record in respective client app's platform DB
    - Example Implementation:
      ```json
      // Core Gateway DB Record
      {
          "_id": "67957d78172a3de27fd14a9a",
          "name": "ByBest Duty Free Shpk.",
          "code": "BBDF25",
          "clientAppId": "67957b75172a3de27fd14a98",
          "externalId": "6795785555dcaaa39e3f5cb1",
          "defaultCurrency": "ALL",
          "isActive": true,
          "createdAt": "2025-01-26T00:10:32.186Z",
          "updatedAt": "2025-01-26T00:10:32.186Z"
      }
      ```

## Database Schema

### Client Schema (Gateway)
```typescript
@Schema({ timestamps: true })
export class Client extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ClientApp' })
    clientAppId: string;

    @Prop()
    externalId?: string;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    defaultCurrency: Currency;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ required: true, unique: true, select: false })
    apiKey: string;
}
```

## Authentication Implementation

### API Client Setup
```typescript
import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_OMNI_GATEWAY_URL;
const API_KEY = process.env.NEXT_PUBLIC_OMNI_GATEWAY_API_KEY;

export const omniGateway = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-api-key': API_KEY,
        'client-x-api-key': '[CLIENT_API_KEY]' // Client-specific API key
    }
});
```

## Authentication Flow

1. **Platform-Level Authentication**
    - Each platform is identified by its unique ID in the gateway
    - Platforms use a gateway-issued API key for base authentication
    - Example Platform Record:
      ```json
      {
          "_id": "67957b75172a3de27fd14a98",
          "name": "BookMaster"
      }
      ```

2. **Client-Level Authentication**
    - Clients have two distinct IDs:
        - Gateway ID (`_id`): Used in shared core DB
        - Platform ID (`externalId`): Used in platform's own DB
    - Authentication requires client-specific API key
    - API key is stored securely and never exposed in responses

3. **Request Flow**
   ```mermaid
   sequenceDiagram
       participant C as Client Application
       participant G as Gateway API
       participant D as Gateway Database
       C->>G: Request with Platform & Client API Keys
       G->>D: Validate Platform API Key
       G->>D: Validate Client API Key
       D->>G: Authentication Result
       G->>C: Protected Resource/Response
   ```

## Security Implementation

1. **API Key Storage**
   ```env
   # Platform Environment Variables
   NEXT_PUBLIC_OMNI_GATEWAY_URL=https://api.gateway.example.com
   NEXT_PUBLIC_OMNI_GATEWAY_API_KEY=[PLATFORM_API_KEY]
   ```

2. **Header Validation Middleware**
   ```typescript
   @Injectable()
   export class ApiKeyMiddleware implements NestMiddleware {
       constructor(
           @InjectModel(Client.name) private clientModel: Model<Client>,
           @InjectModel(ClientApp.name) private clientAppModel: Model<ClientApp>
       ) {}

       async use(req: Request, res: Response, next: NextFunction) {
           const platformApiKey = req.header('x-api-key');
           const clientApiKey = req.header('client-x-api-key');

           // Validate keys and attach client/platform info to request
           // Implementation details...
       }
   }
   ```

## Data Management

### Client Registration Process
1. Client creates account in platform (e.g., BookMaster)
2. Platform creates client record in gateway
3. Gateway generates unique API key for client
4. Platform stores client's gateway ID and API key securely

### ID Mapping Strategy
- Gateway ID (`_id`): Primary identifier in shared infrastructure
- External ID (`externalId`): Reference to platform's internal client ID
- Client App ID (`clientAppId`): Links client to specific platform

## Important Considerations

### Security
- Periodic API key rotation required
- HTTPS-only communication
- API key revocation on client deactivation
- Limited scope platform API keys
- Regular security audits

### Performance
- Efficient caching of authentication results
- Optimized database queries
- Rate limiting implementation
- Monitoring and logging

### Maintenance
- Regular backup of shared database
- Version control of API endpoints
- Documentation updates
- Client notification system for changes

## Development Guidelines

1. **API Versioning**
    - Use semantic versioning
    - Maintain backwards compatibility
    - Document breaking changes

2. **Error Handling**
    - Consistent error response format
    - Detailed logging
    - Client-friendly error messages

3. **Testing Requirements**
    - Unit tests for authentication
    - Integration tests for API endpoints
    - Load testing for performance

## Deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Database backups setup
- [ ] Monitoring tools integrated
- [ ] Error tracking implemented
- [ ] Rate limiting configured
- [ ] Security headers enabled
- [ ] CORS policy defined
- [ ] API documentation updated

## Contact & Support

For technical support or questions about the gateway:

### Technical Lead
- **Name:** Griseld Gerveni
- **Position:** CTO at VenueBoost Inc.
- **Email:** development@venueboost.io
- **Phone:** (844) 248-1465
- **Support Email:** development@omnistackhub.xyz

### Documentation
Our documentation is organized in the following structure at `/src/docs`:
- `/docs`
   - `/auth` - Authentication documentation and API keys
      - `api-keys.md`
   - `/integrations` - Platform-specific integration guides
      - `bookmaster.md`
      - `metroshop.md`
   - `/sync` - Data synchronization documentation
      - `documentation.md`

For detailed implementation guides and API references, please refer to the respective documentation files in our repository structure.