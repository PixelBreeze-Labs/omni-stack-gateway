import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

    async findAll(query: ListClientDto): Promise<{
        data: Client[];
        total: number;
        message: string;
        metrics: {
            totalClients: number;
            activeClients: number;
            inactiveClients: number;
            recentClients: number;
        };
    }> {
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

        // Get the data with pagination
        const data = await this.clientModel
            .find(filter)
            .select('+apiKey')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Get total count for pagination
        const total = await this.clientModel.countDocuments(filter);

        // Get metrics
        const [totalClients, activeClients, inactiveClients, recentClients] = await Promise.all([
            this.clientModel.countDocuments(),
            this.clientModel.countDocuments({ isActive: true }),
            this.clientModel.countDocuments({ isActive: false }),
            this.clientModel.countDocuments({
                createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            })
        ]);

        // Return combined response
        return {
            data,
            total,
            message: 'Clients fetched successfully',
            metrics: {
                totalClients,
                activeClients,
                inactiveClients,
                recentClients
            }
        };
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

        return {
            message: 'Migration completed successfully',
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        };
    }
}