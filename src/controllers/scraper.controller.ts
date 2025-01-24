import {BrandScraperService} from "../services/scraping/brand-scraper.service";
import {Controller, Post, Body} from "@nestjs/common";

@Controller('scraper')
export class ScraperController {
    constructor(private brandScraperService: BrandScraperService) {}

    @Post('test')
    async testScrape(
        @Body('brandId') brandId: string,
        @Body('url') url: string
    ) {
        return this.brandScraperService.scrapeProducts(brandId, url);
    }
}