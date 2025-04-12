import { Injectable } from '@nestjs/common';
import { ValidationResult, ImportResult } from '../../interfaces/import.interface';
import * as Papa from 'papaparse';
import * as nodeXlsx from 'node-xlsx'; // Import node-xlsx

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
            try {
                const workSheetsFromBuffer = nodeXlsx.parse(file);
                if (workSheetsFromBuffer.length > 0) {
                    const data = workSheetsFromBuffer[0].data;
                    if (data.length > 0) {
                        const headers = data[0].map(header => String(header).toLowerCase().trim()); // Normalize headers
                        const jsonData = data.slice(1).map(row => {
                            const obj: any = {};
                            headers.forEach((header, index) => {
                                obj[headers[index]] = row[index];
                            });
                            return obj;
                        });
                        return jsonData;
                    }
                }
                return [];
            } catch (error) {
                console.error("Error parsing excel file: ", error);
                throw new Error("Error parsing excel file");
            }
        }

        throw new Error('Unsupported file format');
    }

    async processFile(file: Buffer, filename: string, brandId: string, clientId: string): Promise<ImportResult> {
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
                await this.saveRow(transformedRow, clientId);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ row: i + 1, errors: [error.message] });
            }
        }

        return results;
    }

    protected abstract saveRow(row: any, clientId: string): Promise<void>;
}