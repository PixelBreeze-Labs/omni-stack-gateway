// src/services/exchange-rate.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Currency } from '../enums/currency.enum';

@Injectable()
export class ExchangeRateService {
    private readonly logger = new Logger(ExchangeRateService.name);
    private rates: Record<Currency, Record<Currency, number>>;

    constructor(
        private configService: ConfigService,
        private httpService: HttpService,
    ) {
        this.updateRates();
        setInterval(() => this.updateRates(), 3600000);
    }

    private async updateRates() {
        try {
            const apiKey = this.configService.get('EXCHANGE_API_KEY');
            const response = await this.httpService.get(
                `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
            ).toPromise();

            this.rates = this.formatRates(response.data.rates);
        } catch (error) {
            this.logger.error('Failed to update exchange rates', error);
            this.rates = {
                USD: { EUR: 0.91, ALL: 97.40, USD: 1 },
                EUR: { USD: 1.10, ALL: 106.85, EUR: 1 },
                ALL: { USD: 0.0103, EUR: 0.0094, ALL: 1 }
            };
        }
    }

    async convertPrice(
        amount: number,
        from: Currency,
        to: Currency,
        useExternalApi = false
    ): Promise<{ amount: number; rate: number }> {
        if (from === to) return { amount, rate: 1 };

        if (!useExternalApi) {
            const rate = this.rates[from][to];
            return { amount: amount * rate, rate };
        }

        try {
            const response = await this.httpService.get(
                `https://v6.exchangerate-api.com/v6/${this.configService.get('EXCHANGE_API_KEY')}/pair/${from}/${to}/${amount}`
            ).toPromise();

            return {
                amount: response.data.conversion_result,
                rate: response.data.conversion_rate
            };
        } catch (error) {
            this.logger.warn('External API failed, using cached rates');
            const rate = this.rates[from][to];
            return { amount: amount * rate, rate };
        }
    }
}