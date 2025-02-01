# External IDs Synchronization Guide

## Overview
This document explains how to maintain synchronization of external IDs across different platforms in our microservices architecture:
- OmniStack Gateway (User Management)
- Trackmaster (CRM)
- Bookmaster (ERP)
- Supabase (Authentication)

## Data Models

### CRM (Trackmaster)
```typescript
// Prisma Schema
model User {
  id           String     @id @default(auto()) @map("_id") @db.ObjectId
  email        String     @unique
  name         String?
  password     String?    // Hashed password
  supabaseId   String     @unique
  role         Role       @default(SALES)
  clientId     String?    @db.ObjectId
  client       Client?    @relation(fields: [clientId], references: [id])
  externalIds  Json?      // Stores IDs from other platforms
}

model Client {
  id                String       @id @default(auto()) @map("_id") @db.ObjectId
  name              String
  omniGatewayId     String?      @unique
  omniGatewayApiKey String?      @unique
  // ... other fields
}
```

### OmniStack Gateway
```typescript
// MongoDB Schema
export class User extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    surname: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ type: [String], default: [] })
    external_ids: string[];      // Array of IDs from other platforms

    @Prop({ type: Map, of: String })
    metadata: Map<string, any>;  // Additional platform-specific data
}

export class Client extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop()
    externalId?: string;        // Reference to CRM client ID
}
```

## ID Relationships

### User ID Mapping
```typescript
interface ExternalIds {
  supabase: string;    // Supabase auth user ID
  omnistack: string;   // OmniStack Gateway user ID
  bookmaster?: string; // Bookmaster user ID if applicable
  // Add other platform IDs as needed
}

// Example of externalIds in CRM User
{
  "externalIds": {
    "supabase": "auth0|123456789",
    "omnistack": "omni_987654321",
    "bookmaster": "bm_456789123"
  }
}

// Example of external_ids in OmniStack User
{
  "external_ids": [
    "crm_123456789",    // CRM user ID
    "bm_456789123"      // Bookmaster user ID
  ]
}
```

## Synchronization Workflows

### 1. Creating New Staff Member

```typescript
async function createStaffMember(staffData: StaffCreateInput) {
  // 1. Create Supabase user
  const supabaseUser = await createSupabaseUser(staffData);

  // 2. Create OmniStack user with CRM reference
  const omniStackUser = await createOmniStackUser({
    ...staffData,
    external_ids: [staffData.id] // Reference to CRM ID
  });

  // 3. Update CRM user with external IDs
  await updateCRMUser(staffData.id, {
    externalIds: {
      supabase: supabaseUser.id,
      omnistack: omniStackUser.id
    }
  });
}
```

### 2. Updating User Information

```typescript
async function updateUserAcrossPlatforms(userId: string, updateData: UserUpdateInput) {
  // 1. Get user with external IDs
  const user = await getCRMUser(userId);
  
  // 2. Update in each platform
  if (user.externalIds?.supabase) {
    await updateSupabaseUser(user.externalIds.supabase, updateData);
  }
  
  if (user.externalIds?.omnistack) {
    await updateOmniStackUser(user.externalIds.omnistack, updateData);
  }
}
```

## Best Practices

### 1. ID Storage
- Store all external IDs in both source and target systems
- Use consistent key names across platforms
- Include platform prefix in IDs for easy identification

### 2. Error Handling
```typescript
async function syncExternalIds(userId: string) {
  try {
    const user = await getCRMUser(userId);
    
    // Check for missing IDs
    const missingIds = checkMissingExternalIds(user.externalIds);
    if (missingIds.length > 0) {
      await repairExternalIds(user, missingIds);
    }
    
  } catch (error) {
    // Log sync failure
    await logSyncError({
      userId,
      error,
      timestamp: new Date()
    });
  }
}
```

### 3. Validation
```typescript
function validateExternalIds(externalIds: ExternalIds): boolean {
  return (
    typeof externalIds.supabase === 'string' &&
    typeof externalIds.omnistack === 'string' &&
    (!externalIds.bookmaster || typeof externalIds.bookmaster === 'string')
  );
}
```

## Troubleshooting

### 1. Missing IDs
If external IDs are missing:
1. Check creation logs in each platform
2. Verify API responses
3. Run repair script:

```typescript
async function repairMissingIds(userId: string) {
  const user = await getCRMUser(userId);
  const platforms = ['supabase', 'omnistack', 'bookmaster'];
  
  for (const platform of platforms) {
    if (!user.externalIds?.[platform]) {
      await repairPlatformId(user, platform);
    }
  }
}
```

### 2. ID Mismatch
When IDs don't match across platforms:
1. Compare creation timestamps
2. Check for failed updates
3. Use the most recent valid ID

## Monitoring

### 1. Sync Status Check
```typescript
interface SyncStatus {
  userId: string;
  platformsInSync: string[];
  lastSyncCheck: Date;
  issues?: string[];
}

async function checkSyncStatus(userId: string): Promise<SyncStatus> {
  const user = await getCRMUser(userId);
  const status: SyncStatus = {
    userId,
    platformsInSync: [],
    lastSyncCheck: new Date()
  };

  // Check each platform
  for (const [platform, id] of Object.entries(user.externalIds || {})) {
    const isValid = await validatePlatformId(platform, id);
    if (isValid) {
      status.platformsInSync.push(platform);
    } else {
      status.issues = status.issues || [];
      status.issues.push(`Invalid ID for platform: ${platform}`);
    }
  }

  return status;
}
```

### 2. Regular Audits
Run periodic checks to ensure synchronization:
```typescript
// Schedule daily sync check
cron.schedule('0 0 * * *', async () => {
  const users = await getAllActiveUsers();
  for (const user of users) {
    await checkSyncStatus(user.id);
  }
});
```

## Maintenance Tasks

1. **Daily**
   - Monitor sync errors
   - Handle failed synchronizations

2. **Weekly**
   - Run full audit of external IDs
   - Repair any inconsistencies

3. **Monthly**
   - Clean up orphaned IDs
   - Update documentation with new platforms