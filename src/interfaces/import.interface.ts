// src/interfaces/import.interface.ts
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export interface ImportResult {
    success: number;
    failed: number;
    errors: { row: number; errors: string[] }[];
}
