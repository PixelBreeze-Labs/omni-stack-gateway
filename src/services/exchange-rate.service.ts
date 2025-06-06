import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Currency } from '../enums/currency.enum';
import { firstValueFrom } from 'rxjs';

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
            const response = await firstValueFrom(
                this.httpService.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`)
            );

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
            const apiKey = this.configService.get('EXCHANGE_API_KEY');
            const response = await firstValueFrom(
                this.httpService.get(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}/${amount}`)
            );

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

    private formatRates(apiRates: Record<string, number>): Record<Currency, Record<Currency, number>> {
        // Fallback rates if API data is incomplete
        const fallbackRates = {
            USD: { EUR: 0.91, ALL: 97.40, USD: 1 },
            EUR: { USD: 1.10, ALL: 106.85, EUR: 1 },
            ALL: { USD: 0.0103, EUR: 0.0094, ALL: 1 }
        };

        if (!apiRates || !apiRates.EUR || !apiRates.USD || !apiRates.ALL) {
            this.logger.warn('Incomplete API rates, using fallback rates');
            return fallbackRates;
        }

        const currencies = Object.values(Currency);
        const formattedRates: Record<Currency, Record<Currency, number>> = {} as any;

        try {
            currencies.forEach(fromCurrency => {
                formattedRates[fromCurrency] = {} as Record<Currency, number>;

                currencies.forEach(toCurrency => {
                    if (fromCurrency === toCurrency) {
                        formattedRates[fromCurrency][toCurrency] = 1;
                    } else {
                        const baseRate = apiRates[toCurrency];
                        const rate = baseRate / apiRates[fromCurrency];
                        formattedRates[fromCurrency][toCurrency] = Number(rate.toFixed(4));
                    }
                });
            });

            return formattedRates;
        } catch (error) {
            this.logger.error('Error formatting rates, using fallback rates', error);
            return fallbackRates;
        }
    }
}