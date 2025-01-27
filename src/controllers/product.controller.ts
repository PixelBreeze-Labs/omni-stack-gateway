import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { ExchangeRateService } from '../services/exchange-rate.service';
import { CreateProductDto } from '../dtos/product.dto';
import { Currency } from '../enums/currency.enum';
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery } from "@nestjs/swagger";
import { ClientAuthGuard } from '../guards/client-auth.guard';

@ApiTags('Products')
@Controller('products')
@UseGuards(ClientAuthGuard)
export class ProductController {
    constructor(
        private readonly productService: ProductService,
        private readonly exchangeRateService: ExchangeRateService,
    ) {}

    @ApiOperation({ summary: 'Create new product with price conversion' })
    @ApiResponse({ status: 201, description: 'Product created' })
    @Post()
    async create(@Body() dto: CreateProductDto) {
        const rates = await this.exchangeRateService.convertPrice(
            dto.price,
            dto.currency,
            Currency.USD,
            dto.useExternalRates
        );

        const prices = new Map<Currency, number>();
        prices.set(dto.currency, dto.price);
        prices.set(Currency.USD, rates.amount);

        return this.productService.create({
            ...dto,
            prices,
            defaultCurrency: dto.currency
        });
    }

    @ApiOperation({ summary: 'Get all products' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'brandId', required: false })
    @Get()
    async findAll(@Query() query: any) {
        return this.productService.findAll(query);
    }

    @ApiOperation({ summary: 'Get product by id' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.productService.findOne(id);
    }

    @ApiOperation({ summary: 'Update product' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @Put(':id')
    async update(@Param('id') id: string, @Body() updateData: Partial<CreateProductDto>) {
        if (updateData.price && updateData.currency) {
            const rates = await this.exchangeRateService.convertPrice(
                updateData.price,
                updateData.currency,
                Currency.USD,
                updateData.useExternalRates
            );

            const prices = new Map<Currency, number>();
            prices.set(updateData.currency, updateData.price);
            prices.set(Currency.USD, rates.amount);

            updateData.prices = prices;
            updateData.defaultCurrency = updateData.currency;
        }

        return this.productService.update(id, updateData);
    }

    @ApiOperation({ summary: 'Soft delete product' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.productService.remove(id);
    }

    @ApiOperation({ summary: 'Hard delete product' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @Delete(':id/hard')
    async hardDelete(@Param('id') id: string) {
        return this.productService.hardDelete(id);
    }
}