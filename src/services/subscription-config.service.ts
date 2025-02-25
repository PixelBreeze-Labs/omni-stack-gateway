// src/services/subscription-config.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from "../schemas/client.schema";
import { UpdateSubscriptionConfigDto } from "../dtos/subscription-config.dto";
import { Currency } from '../enums/currency.enum';

@Injectable()
export class SubscriptionConfigService {
    constructor(
        @InjectModel(Client.name) private clientModel: Model<Client>
    ) {}

    async getConfig(clientId: string) {
        const client = await this.clientModel.findById(clientId)
            // Exclude sensitive data
            .select('-subscriptionConfig.webhook.secret -subscriptionConfig.stripeAccount.secretKey');

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        return client.subscriptionConfig || this.getDefaultConfig();
    }

    async updateConfig(clientId: string, updateConfigDto: UpdateSubscriptionConfigDto) {
        const client = await this.clientModel.findById(clientId);
        if (!client) {
            throw new NotFoundException('Client not found');
        }

        // Merge existing config with updates, keeping sensitive data if not provided
        const updatedConfig = this.mergeConfigs(client.subscriptionConfig, updateConfigDto);

        // Update the client with the new subscription config
        const updatedClient = await this.clientModel.findByIdAndUpdate(
            clientId,
            { $set: { subscriptionConfig: updatedConfig } },
            { new: true }
        ).select('-subscriptionConfig.webhook.secret -subscriptionConfig.stripeAccount.secretKey');

        return updatedClient.subscriptionConfig;
    }

    private getDefaultConfig() {
        return {
            productPrefix: 'DEFAULT_',
            defaultCurrency: Currency.USD,
            webhook: {
                enabled: false,
                events: []
            },
            stripeAccount: {},
            trial: {
                enabled: true,
                durationDays: 14
            },
            invoiceSettings: {
                generateInvoice: true,
                daysUntilDue: 30
            }
        };
    }

    private mergeConfigs(existingConfig, updateConfigDto) {
        // Start with existing config or default
        const baseConfig = existingConfig || this.getDefaultConfig();

        // Create a new merged config
        const mergedConfig = {
            ...baseConfig,
            ...updateConfigDto
        };

        // Handle nested objects carefully to avoid overwriting sensitive fields
        if (updateConfigDto.webhook) {
            mergedConfig.webhook = {
                ...baseConfig.webhook,
                ...updateConfigDto.webhook,
                // Keep the secret if not explicitly provided
                secret: updateConfigDto.webhook.secret || baseConfig.webhook?.secret
            };
        }

        if (updateConfigDto.stripeAccount) {
            mergedConfig.stripeAccount = {
                ...baseConfig.stripeAccount,
                ...updateConfigDto.stripeAccount,
                // Keep the secretKey if not explicitly provided
                secretKey: updateConfigDto.stripeAccount.secretKey || baseConfig.stripeAccount?.secretKey
            };
        }

        if (updateConfigDto.trial) {
            mergedConfig.trial = {
                ...baseConfig.trial,
                ...updateConfigDto.trial
            };
        }

        if (updateConfigDto.invoiceSettings) {
            mergedConfig.invoiceSettings = {
                ...baseConfig.invoiceSettings,
                ...updateConfigDto.invoiceSettings
            };
        }

        return mergedConfig;
    }
}