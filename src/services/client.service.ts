import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';
import { CreateClientDto, UpdateClientDto, ListClientDto } from '../dtos/client.dto';
import { ClientApiKeyService } from './client-api-key.service';
import { ClientStatus } from '../enums/clients.enum';

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
        // Default values
        const limit = query.limit || 10;

        // Handle pagination - support both skip and page parameters
        let skip = 0;
        if (query.page) {
            // If page is provided, calculate skip
            skip = (query.page - 1) * limit;
        } else if (query.skip) {
            // Otherwise use skip directly if provided
            skip = query.skip;
        }

        const filter: any = {};

        // Handle search
        if (query.search) {
            filter.$or = [
                { name: { $regex: query.search, $options: 'i' } },
                { code: { $regex: query.search, $options: 'i' } }
            ];
        }

        // Handle status filter - map status enum to isActive boolean
        if (query.status === ClientStatus.ACTIVE) {
            filter.isActive = true;
        } else if (query.status === ClientStatus.INACTIVE) {
            filter.isActive = false;
        }

        // Handle date filters
        if (query.fromDate) {
            filter.createdAt = filter.createdAt || {};
            filter.createdAt.$gte = new Date(query.fromDate);
        }

        if (query.toDate) {
            filter.createdAt = filter.createdAt || {};
            filter.createdAt.$lte = new Date(query.toDate);
        }

        // Log the query for debugging
        console.log(`Query params: ${JSON.stringify(query)}`);
        console.log(`MongoDB filter: ${JSON.stringify(filter)}, skip: ${skip}, limit: ${limit}`);

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
            apiKey,
            isActive: true // Default to active
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

    // Find clients that have this client app in their clientAppIds array
    async findClientsByAppId(appId: string): Promise<Client[]> {
        if (!appId) {
            return [];
        }

        // Find all clients that reference this client app
        const clients = await this.clientModel.find({
            clientAppIds: appId
        }).exec();

        return clients;
    }

    // Get basic client info for all client apps
    async getClientInfoForApps(appIds: string[]): Promise<Record<string, any>> {
        if (!appIds || appIds.length === 0) {
            return {};
        }

        // Find all clients that reference any of these client apps
        const clients = await this.clientModel.find({
            clientAppIds: { $in: appIds }
        }).exec();

        // Create a map of appId -> client info
        const appClientMap: Record<string, any> = {};
        
        // For each client, associate it with the app IDs it contains
        clients.forEach(client => {
            const clientInfo = {
                _id: client._id,
                name: client.name,
                code: client.code
            };
            
            // Map this client info to each app ID it references
            client.clientAppIds.forEach(appId => {
                if (appIds.includes(appId.toString())) {
                    appClientMap[appId.toString()] = clientInfo;
                }
            });
        });

        return appClientMap;
    }
}