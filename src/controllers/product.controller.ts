import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { ExchangeRateService } from '../services/exchange-rate.service';
import { CreateProductDto, UpdateProductDto } from '../dtos/product.dto';
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

        const productData: any = {
            ...dto,
            prices,
            defaultCurrency: dto.currency
        };

        return this.productService.create(productData);
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
    async update(@Param('id') id: string, @Body() updateDto: UpdateProductDto) {
        let productData: any = { ...updateDto };

        if (updateDto.price && updateDto.currency) {
            const rates = await this.exchangeRateService.convertPrice(
                updateDto.price,
                updateDto.currency,
                Currency.USD,
                updateDto.useExternalRates
            );

            const prices = new Map<Currency, number>();
            prices.set(updateDto.currency, updateDto.price);
            prices.set(Currency.USD, rates.amount);

            productData.prices = prices;
            productData.defaultCurrency = updateDto.currency;
        }

        return this.productService.update(id, productData);
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