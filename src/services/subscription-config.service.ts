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
        // Create a deep copy of the existing config or use default if none exists
        const baseConfig = existingConfig ? JSON.parse(JSON.stringify(existingConfig)) : this.getDefaultConfig();

        // Create a new config object with the base properties
        const mergedConfig = { ...baseConfig };

        // Update top-level fields if they exist in the update DTO
        if (updateConfigDto.productPrefix !== undefined) {
            mergedConfig.productPrefix = updateConfigDto.productPrefix;
        }

        if (updateConfigDto.defaultCurrency !== undefined) {
            mergedConfig.defaultCurrency = updateConfigDto.defaultCurrency;
        }

        // Handle nested objects
        if (updateConfigDto.webhook) {
            mergedConfig.webhook = mergedConfig.webhook || {};

            // Only update fields that are specified in the DTO
            if (updateConfigDto.webhook.endpoint !== undefined) {
                mergedConfig.webhook.endpoint = updateConfigDto.webhook.endpoint;
            }

            if (updateConfigDto.webhook.enabled !== undefined) {
                mergedConfig.webhook.enabled = updateConfigDto.webhook.enabled;
            }

            if (updateConfigDto.webhook.events !== undefined) {
                mergedConfig.webhook.events = updateConfigDto.webhook.events;
            }

            // Only update secret if it's provided and not empty
            if (updateConfigDto.webhook.secret) {
                mergedConfig.webhook.secret = updateConfigDto.webhook.secret;
            }
        }

        if (updateConfigDto.stripeAccount) {
            mergedConfig.stripeAccount = mergedConfig.stripeAccount || {};

            if (updateConfigDto.stripeAccount.accountId !== undefined) {
                mergedConfig.stripeAccount.accountId = updateConfigDto.stripeAccount.accountId;
            }

            if (updateConfigDto.stripeAccount.publicKey !== undefined) {
                mergedConfig.stripeAccount.publicKey = updateConfigDto.stripeAccount.publicKey;
            }

            // Only update secretKey if it's provided and not empty
            if (updateConfigDto.stripeAccount.secretKey && updateConfigDto.stripeAccount.secretKey == '00-DONT-USE-11') {
                mergedConfig.stripeAccount.secretKey = baseConfig.stripeAccount.secretKey;
            } else {
                mergedConfig.stripeAccount.secretKey = updateConfigDto.stripeAccount.secretKey;
            }
        }

        if (updateConfigDto.trial) {
            mergedConfig.trial = mergedConfig.trial || {};

            if (updateConfigDto.trial.enabled !== undefined) {
                mergedConfig.trial.enabled = updateConfigDto.trial.enabled;
            }

            if (updateConfigDto.trial.durationDays !== undefined) {
                mergedConfig.trial.durationDays = updateConfigDto.trial.durationDays;
            }
        }

        if (updateConfigDto.invoiceSettings) {
            mergedConfig.invoiceSettings = mergedConfig.invoiceSettings || {};

            if (updateConfigDto.invoiceSettings.generateInvoice !== undefined) {
                mergedConfig.invoiceSettings.generateInvoice = updateConfigDto.invoiceSettings.generateInvoice;
            }

            if (updateConfigDto.invoiceSettings.daysUntilDue !== undefined) {
                mergedConfig.invoiceSettings.daysUntilDue = updateConfigDto.invoiceSettings.daysUntilDue;
            }

            if (updateConfigDto.invoiceSettings.footer !== undefined) {
                mergedConfig.invoiceSettings.footer = updateConfigDto.invoiceSettings.footer;
            }
        }

        return mergedConfig;
    }
}