// src/utils/business-api-key.utils.ts
import { randomBytes } from 'crypto';

/**
 * Generate a secure random API key
 * @returns A 64-character hex API key
 */
export function generateBusinessApiKey(): string {
  return randomBytes(32).toString('hex');
}