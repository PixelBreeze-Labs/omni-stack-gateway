import {ConfigService} from "@nestjs/config";
import {ImageProcessingService} from "../image-processing.service";
import {Product} from "../../schemas/product.schema";
import {Model} from "mongoose";
import {InjectModel} from "@nestjs/mongoose";
import {Injectable} from "@nestjs/common";
import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

import {ElementHandle, Page} from "puppeteer";
import {Currency} from "../../enums/currency.enum";

interface ScrapedProduct {
    name: string;
    code: string;
    barcode?: string;
    prices: Map<Currency, number>;
    defaultCurrency: Currency;
    isActive: boolean;
    initialStock: number;
    imagePath: "string"
}


// Apply the stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());


@Injectable()
export class BrandScraperService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>,
        private imageProcessingService: ImageProcessingService,
        private configService: ConfigService
    ) {}

    protected readonly SELECTORS = {
        container: '.swa-product-tile-plp',
        name: '.swa-product-tile-plp__information__subtitle',
        description: '.swa-product-tile-plp__information__subtitle',
        price: '.swa-product-tile__information__price-current',
        image: 'img.swa-product-tile-plp__image'
    };

    async scrapeProducts(brandId: string, url: string) {
        // Launch Puppeteer with stealth mode enabled
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            console.log('Navigating to URL:', url);
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 60000
            });

            // Wait for products to load
            await page.waitForSelector(this.SELECTORS.container, { timeout: 60000 });

            const productElements = await this.identifyProductElements(page);
            console.log(`Found ${productElements.length} products`);

            const products = [];
            for (const element of productElements) {
                try {
                    const product = await this.extractProductData(element);
                    products.push(product);
                } catch (error) {
                    console.error('Error extracting product:', error);
                }
            }

            return this.saveProducts(brandId, products);
        } catch (error) {
            console.error('Scraping error:', error);
            throw error;
        } finally {
            await browser.close();
        }
    }

    protected async identifyProductElements(page: Page) {
        return page.$$(this.SELECTORS.container);
    }

    protected async extractProductData(element: ElementHandle): Promise<ScrapedProduct> {
        const name = await element.$eval(this.SELECTORS.name, el => el.textContent.trim());
        const description = await element.$eval(this.SELECTORS.description, el => el.textContent.trim());
        const priceText = await element.$eval(this.SELECTORS.price, el => el.textContent.trim());
        const imageUrl = await element.$eval('img.swa-product-tile-plp__image', (img: HTMLImageElement) => img.src);
        console.log('Found image URL:', imageUrl);

        // Process image if present
        let images = [];
        let imagePath = null;
        if (imageUrl) {
            try {
                const imageData = await this.imageProcessingService.processAndUpload(imageUrl);
                imagePath = imageData.path;
                images.push(imageData);
            } catch (error) {
                console.error('Error processing image:', error);
            }
        }

        const price = this.parsePrice(priceText);
        const prices = new Map<Currency, number>();
        prices.set(Currency.EUR, price);

        return {
            name,
            code: '-',
            barcode: '-',
            prices,
            defaultCurrency: Currency.EUR,
            isActive: true,
            initialStock: 0,
            imagePath,
        };
    }

    private async saveProducts(brandId: string, products: ScrapedProduct[]) {
        const results = {
            success: [],
            failed: []
        };

        for (const product of products) {
            try {
                const saved = await this.productModel.create({
                    ...product,
                    brandId,
                    clientId: this.configService.get('TEST_CLIENT_ID'),
                    source: 'scraper'
                });
                results.success.push(saved);
            } catch (error) {
                console.error('Error saving product:', error);
                results.failed.push({
                    product,
                    error: error.message
                });
            }
        }

        return results;
    }

    private parsePrice(price: string): number {
        return parseFloat(price.replace(/[^0-9.]/g, ''));
    }
}