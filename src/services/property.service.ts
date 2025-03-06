// src/services/property.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyStatus, PropertyType } from '../schemas/property.schema';
import { VenueBoostService } from './venueboost.service';
import { Client } from '../schemas/client.schema';

@Injectable()
export class PropertyService {
    private readonly logger = new Logger(PropertyService.name);

    constructor(
        @InjectModel(Property.name) private propertyModel: Model<Property>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

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
                    'externalIds.venueboostId': rentalUnit.id
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
                            venueboostId: rentalUnit.id
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