// src/services/property.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyStatus, PropertyType } from '../schemas/property.schema';
import { VenueBoostService } from './venueboost.service';
import { Client } from '../schemas/client.schema';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    status?: PropertyStatus;
    type?: PropertyType;
}

@Injectable()
export class PropertyService {
    private readonly logger = new Logger(PropertyService.name);

    constructor(
        @InjectModel(Property.name) private propertyModel: Model<Property>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

    /**
     * Find all properties with filtering and pagination
     *
     * @param clientId The MongoDB ID of the client
     * @param options Filter and pagination options
     * @returns Paginated properties list
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, status, type } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add status filter if provided
            if (status) {
                filter.status = status;
            }

            // Add type filter if provided
            if (type) {
                filter.type = type;
            }

            // Add search filter if provided
            if (search) {
                // Search in name and metadata address
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { 'metadata.address': { $regex: search, $options: 'i' } }
                ];
            }

            // Execute the query with pagination
            const [properties, total] = await Promise.all([
                this.propertyModel
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.propertyModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: properties,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            };
        } catch (error) {
            this.logger.error(`Error finding properties: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a property by ID
     *
     * @param clientId The MongoDB ID of the client
     * @param id The property ID
     * @returns The property if found
     */
    async findById(clientId: string, id: string) {
        const property = await this.propertyModel.findOne({
            _id: id,
            clientId
        }).lean();

        if (!property) {
            throw new NotFoundException('Property not found');
        }

        return { data: property };
    }

    /**
     * Sync properties from VenueBoost for a client
     *
     * @param clientId The MongoDB ID of the client
     * @returns Result of the sync operation
     */
    async syncPropertiesFromVenueBoost(clientId: string): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get rental units from VenueBoost
            const response = await this.venueBoostService.listRentalUnits(clientId);
            const rentalUnits = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0;

            // Process each rental unit
            for (const rentalUnit of rentalUnits) {
                // Check if property exists by external ID
                const existingProperty = await this.propertyModel.findOne({
                    'externalIds.venueboostId': rentalUnit.id.toString()
                });

                if (existingProperty) {
                    // Property exists - check if it needs to be updated
                    let needsUpdate = false;

                    if (existingProperty.name !== rentalUnit.name) {
                        existingProperty.name = rentalUnit.name;
                        needsUpdate = true;
                    }

                    // Handle metadata fields like address
                    if (!existingProperty.metadata) {
                        existingProperty.metadata = new Map<string, any>();
                    }

                    if (existingProperty.metadata.get('address') !== rentalUnit.address) {
                        existingProperty.metadata.set('address', rentalUnit.address);
                        needsUpdate = true;
                    }

                    if (existingProperty.metadata.get('unitCode') !== rentalUnit.unit_code) {
                        existingProperty.metadata.set('unitCode', rentalUnit.unit_code);
                        needsUpdate = true;
                    }

                    if (existingProperty.metadata.get('url') !== rentalUnit.url) {
                        existingProperty.metadata.set('url', rentalUnit.url);
                        needsUpdate = true;
                    }

                    // Map the accommodation_type from VenueBoost to PropertyType
                    const propertyType = this.mapVenueBoostTypeToPropertyType(rentalUnit.accommodation_type);
                    if (existingProperty.type !== propertyType) {
                        existingProperty.type = propertyType;
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        await existingProperty.save();
                        updated++;
                    } else {
                        unchanged++;
                    }
                } else {
                    // Property doesn't exist - create it
                    await this.propertyModel.create({
                        name: rentalUnit.name,
                        clientId: clientId,
                        status: PropertyStatus.ACTIVE,
                        type: this.mapVenueBoostTypeToPropertyType(rentalUnit.accommodation_type),
                        externalIds: {
                            venueboostId: rentalUnit.id.toString()
                        },
                        metadata: new Map([
                            ['address', rentalUnit.address],
                            ['unitCode', rentalUnit.unit_code],
                            ['url', rentalUnit.url],
                            ['createdAt', rentalUnit.created_at]
                        ]),
                        currency: 'EUR' // Default currency
                    });

                    created++;
                }
            }

            return {
                success: true,
                message: `Sync completed: ${created} created, ${updated} updated, ${unchanged} unchanged`,
                created,
                updated,
                unchanged
            };
        } catch (error) {
            this.logger.error(`Error syncing properties from VenueBoost: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Map VenueBoost accommodation type to PropertyType enum
     */
    private mapVenueBoostTypeToPropertyType(vbType: string): PropertyType {
        switch (vbType?.toLowerCase()) {
            case 'apartment':
                return PropertyType.APARTMENT;
            case 'house':
                return PropertyType.HOUSE;
            case 'villa':
                return PropertyType.VILLA;
            case 'cabin':
                return PropertyType.CABIN;
            case 'studio':
                return PropertyType.STUDIO;
            case 'hotel room':
                return PropertyType.HOTEL_ROOM;
            case 'condo':
                return PropertyType.CONDO;
            case 'bungalow':
                return PropertyType.BUNGALOW;
            case 'chalet':
                return PropertyType.CHALET;
            case 'cottage':
                return PropertyType.COTTAGE;
            case 'guest house':
                return PropertyType.GUEST_HOUSE;
            default:
                return PropertyType.OTHER;
        }
    }
}