// src/services/import/processors/base-processor.ts
import {Injectable} from "@nestjs/common";
import {ValidationResult} from "../../../interfaces/import.interface";

@Injectable()
export abstract class BaseImportProcessor {
    abstract validateRow(row: any): Promise<ValidationResult>;
    abstract processRow(row: any): Promise<any>;
    abstract afterProcess(results: any[]): Promise<void>;
}