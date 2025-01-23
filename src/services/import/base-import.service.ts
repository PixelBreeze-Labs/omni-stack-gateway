import { Injectable } from '@nestjs/common';
import { ValidationResult, ImportResult } from '../../interfaces/import.interface';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';

@Injectable()
export abstract class BaseImportService {
    abstract validateRow(row: any, brandId?: string): Promise<ValidationResult>;
    abstract transformRow(row: any, brandId?: string): Promise<any>;

    protected parseFile(file: Buffer, filename: string): any[] {
        const extension = filename.split('.').pop()?.toLowerCase();

        if (extension === 'csv') {
            const content = file.toString('utf-8');
            return Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.toLowerCase().trim()
            }).data;
        }

        if (['xlsx', 'xls'].includes(extension)) {
            const workbook = XLSX.read(file);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            return XLSX.utils.sheet_to_json(sheet);
        }

        throw new Error('Unsupported file format');
    }

    async processFile(file: Buffer, filename: string, brandId?: string): Promise<ImportResult> {
        const rows = this.parseFile(file, filename);
        const results: ImportResult = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < rows.length; i++) {
            const validation = await this.validateRow(rows[i], brandId);

            if (!validation.valid) {
                results.failed++;
                results.errors.push({ row: i + 1, errors: validation.errors });
                continue;
            }

            try {
                const transformedRow = await this.transformRow(rows[i], brandId);
                await this.saveRow(transformedRow);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ row: i + 1, errors: [error.message] });
            }
        }

        return results;
    }

    protected abstract saveRow(row: any): Promise<void>;
}