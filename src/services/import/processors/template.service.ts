// src/services/template.service.ts
import {SimpleImportProcessor} from "./simple-processor";
import {MatrixImportProcessor} from "./matrix-processor";
import {VariationImportProcessor} from "./variation-processor";
import {BaseImportProcessor} from "./base-processor";
import {ImportTemplate} from "../../../schemas/template.schema";
import {InjectModel} from "@nestjs/mongoose";
import {Injectable, NotFoundException} from "@nestjs/common";
import {Model} from "mongoose";
import {CreateTemplateDto} from "../../../dtos/template.dto";

// src/services/template.service.ts
@Injectable()
export class TemplateService {
    constructor(
        @InjectModel(ImportTemplate.name) private templateModel: Model<ImportTemplate>,
        private simpleProcessor: SimpleImportProcessor,
        private variationProcessor: VariationImportProcessor,
        private matrixProcessor: MatrixImportProcessor
    ) {}

    async create(createTemplateDto: CreateTemplateDto): Promise<ImportTemplate> {
        return this.templateModel.create(createTemplateDto);
    }

    async findAll(clientId: string): Promise<ImportTemplate[]> {
        return this.templateModel.find({ clientId });
    }

    async findOne(id: string, clientId: string): Promise<ImportTemplate> {
        const template = await this.templateModel.findOne({ _id: id, clientId });
        if (!template) throw new NotFoundException('Template not found');
        return template;
    }

    getProcessor(type: string): BaseImportProcessor {
        switch(type) {
            case 'simple': return this.simpleProcessor;
            case 'variation': return this.variationProcessor;
            case 'matrix': return this.matrixProcessor;
            default: throw new Error(`Unknown template type: ${type}`);
        }
    }

    async processImport(templateId: string, file: Buffer) {
        const template = await this.templateModel.findById(templateId);
        if (!template) throw new NotFoundException('Template not found');

        const processor = this.getProcessor(template.type);
        const rows = this.parseFile(file);

        const results = {
            success: [],
            errors: []
        };

        for (const row of rows) {
            const validation = await processor.validateRow(row);
            if (!validation.valid) {
                results.errors.push({ row, errors: validation.errors });
                continue;
            }

            try {
                const result = await processor.processRow(row);
                results.success.push(result);
            } catch (error) {
                results.errors.push({ row, errors: [error.message] });
            }
        }

        await processor.afterProcess(results.success);
        return results;
    }

    private parseFile(file: Buffer) {
        // Implementation of file parsing
        return [];
    }
}