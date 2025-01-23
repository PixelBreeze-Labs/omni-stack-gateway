// src/controllers/product-variation.controller.ts
import {Body, Controller, Get, Param, Post, Req, UseGuards} from "@nestjs/common";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {CreateVariationDto} from "../dtos/variation.dto";
import {Client} from "../schemas/client.schema";
import {GenerateMatrixDto} from "../dtos/template.dto";
import {ProductVariationService} from "../services/product-variation-service";

@Controller('products')
@UseGuards(ClientAuthGuard)
export class ProductVariationController {
    constructor(
        private variationService: ProductVariationService
    ) {}

    @Post(':id/variations')
    async createVariations(
        @Param('id') id: string,
        @Body() createVariationDto: CreateVariationDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.variationService.createVariations(id, createVariationDto);
    }

    @Get(':id/variations')
    async getVariations(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.variationService.findByProduct(id);
    }

    @Post(':id/matrix')
    async generateMatrix(
        @Param('id') id: string,
        @Body() matrixDto: GenerateMatrixDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.variationService.generateMatrix(id, matrixDto);
    }
}