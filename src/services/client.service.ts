// src/services/client.service.ts
import {Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';
import { CreateClientDto, UpdateClientDto, ListClientDto } from '../dtos/client.dto';
import { ClientApiKeyService } from './client-api-key.service';

@Injectable()
export class ClientService {
    constructor(
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly clientApiKeyService: ClientApiKeyService,
    ) {}

    async findAll(query: ListClientDto): Promise<Client[]> {
        const { limit = 10, skip = 0, search, status } = query;
        const filter: any = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) {
            filter.status = status;
        }

        return this.clientModel
            .find(filter)
            .select('+apiKey')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
    }

    async findOne(id: string): Promise<Client> {
        const client = await this.clientModel.findById(id);
        if (!client) throw new NotFoundException('Client not found');
        return client;
    }

    async create(createClientDto: CreateClientDto): Promise<Client> {
        const apiKey = await this.clientApiKeyService.generateApiKey();
        const client = new this.clientModel({
            ...createClientDto,
            apiKey
        });
        return client.save();
    }

    async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
        const client = await this.clientModel
            .findByIdAndUpdate(id, updateClientDto, { new: true });
        if (!client) throw new NotFoundException('Client not found');
        return client;
    }

    async remove(id: string): Promise<void> {
        const result = await this.clientModel.findByIdAndDelete(id);
        if (!result) throw new NotFoundException('Client not found');
    }

    async findByApiKey(apiKey: string): Promise<Client> {
        const client = await this.clientModel.findOne({ apiKey });
        if (!client) throw new UnauthorizedException('Invalid API key');
        return client;
    }

    async migrateClients() {
        const result = await this.clientModel.updateMany(
            {},
            [
                {
                    $set: {
                        clientAppIds: { $ifNull: [["$clientAppId"], []] }
                    }
                },
                {
                    $unset: "clientAppId"
                }
            ]
        );

        this.logger.log(`Migration completed: ${result.modifiedCount} clients updated.`);

        return {
            message: 'Migration completed successfully',
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        };
    }
}