// src/controllers/product.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { ExchangeRateService } from '../services/exchange-rate.service';
import { CreateProductDto } from '../dtos/product.dto';
import { Currency } from '../enums/currency.enum';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Products')
@Controller('products')
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
}