// src/controllers/product-variation.controller.ts
import {Body, Controller, Get, Param, Post, Req, UseGuards} from "@nestjs/common";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {CreateVariationDto} from "../dtos/variation.dto";
import {Client} from "../schemas/client.schema";
import {GenerateMatrixDto} from "../dtos/template.dto";
import {ProductVariationService} from "../services/product-variation-service";
import {ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Product Variations')
@Controller('products')
@UseGuards(ClientAuthGuard)
export class ProductVariationController {
    constructor(
        private variationService: ProductVariationService
    ) {}

    @ApiOperation({ summary: 'Create product variations' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @ApiBody({ type: CreateVariationDto })
    @ApiResponse({ status: 201, description: 'Variations created' })
    @Post(':id/variations')
    async createVariations(
        @Param('id') id: string,
        @Body() createVariationDto: CreateVariationDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.variationService.createVariations(id, createVariationDto);
    }

    @ApiOperation({ summary: 'Get product variations' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @ApiResponse({ status: 200, description: 'Variations retrieved' })
    @Get(':id/variations')
    async getVariations(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.variationService.findByProduct(id);
    }

    @ApiOperation({ summary: 'Generate variation matrix' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @ApiBody({ type: GenerateMatrixDto })
    @ApiResponse({ status: 200, description: 'Matrix generated' })
    @Post(':id/matrix')
    async generateMatrix(
        @Param('id') id: string,
        @Body() matrixDto: GenerateMatrixDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.variationService.generateMatrix(id, matrixDto);
    }
}