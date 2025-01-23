`/docs/auth/api-keys.md`:
```markdown
# API Key Management

## Structure
- Prefix: `sk_live_` (production) or `sk_test_` (development)
- Length: 32 characters

## Security
- SSL/TLS required
- Keys stored with encryption
- Rotation every 90 days

## Headers
```typescript
{
  "x-api-key": "sk_live_...",
  "x-client-id": "client_id",
  "x-platform": "bookmaster|qytetaret"
}