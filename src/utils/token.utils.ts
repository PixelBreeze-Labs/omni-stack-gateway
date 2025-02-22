// src/utils/token.utils.ts
import * as crypto from 'crypto';

export function generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
}