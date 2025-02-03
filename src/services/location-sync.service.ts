// src/services/location-sync.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Country } from '../schemas/country.schema';
import { State } from '../schemas/state.schema';
import { City } from '../schemas/city.schema';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocationSyncService {
    private readonly logger = new Logger(LocationSyncService.name);
    private readonly geoNamesUsername: string;

    constructor(
        @InjectModel(Country.name) private countryModel: Model<Country>,
        @InjectModel(State.name) private stateModel: Model<State>,
        @InjectModel(City.name) private cityModel: Model<City>,
        private configService: ConfigService,
    ) {
        this.geoNamesUsername = this.configService.get<string>('GEONAMES_USERNAME');
    }

    // Sync methods remain the same...
    async syncAll() {
        try {
            await this.syncCountries();
            await this.syncStatesAndCities();
            this.logger.log('Location sync completed successfully');
        } catch (error) {
            this.logger.error('Location sync failed', error);
            throw error;
        }
    }

    private async syncCountries() {
        try {
            // Fetch countries from REST Countries API
            const response = await axios.get('https://restcountries.com/v3.1/all');
            const countries = response.data;

            for (const country of countries) {
                await this.countryModel.findOneAndUpdate(
                    { code: country.cca2 },
                    {
                        name: country.name.common,
                        code: country.cca2,
                    },
                    { upsert: true, new: true }
                );
            }

            this.logger.log(`Synced ${countries.length} countries`);
        } catch (error) {
            this.logger.error('Failed to sync countries', error);
            throw error;
        }
    }

    private async syncStatesAndCities() {
        if (!this.geoNamesUsername) {
            throw new Error('GeoNames username not configured');
        }

        const countries = await this.countryModel.find();

        for (const country of countries) {
            try {
                // Fetch states/regions for each country
                const statesResponse = await axios.get(
                    `http://api.geonames.org/childrenJSON?geonameId=${country.code}&username=${this.geoNamesUsername}`
                );

                for (const stateData of statesResponse.data.geonames) {
                    const state = await this.stateModel.findOneAndUpdate(
                        {
                            code: stateData.adminCode1,
                            countryId: country._id,
                        },
                        {
                            name: stateData.name,
                            code: stateData.adminCode1,
                            countryId: country._id,
                        },
                        { upsert: true, new: true }
                    );

                    // Fetch cities for each state
                    const citiesResponse = await axios.get(
                        `http://api.geonames.org/childrenJSON?geonameId=${stateData.geonameId}&username=${this.geoNamesUsername}`
                    );

                    for (const cityData of citiesResponse.data.geonames) {
                        await this.cityModel.findOneAndUpdate(
                            {
                                name: cityData.name,
                                stateId: state._id,
                            },
                            {
                                name: cityData.name,
                                stateId: state._id,
                            },
                            { upsert: true, new: true }
                        );
                    }
                }

                this.logger.log(`Synced states and cities for ${country.name}`);
            } catch (error) {
                this.logger.error(`Failed to sync states and cities for ${country.name}`, error);
                // Continue with next country even if one fails
                continue;
            }
        }
    }

    // New getter methods
    async getCountries(): Promise<Country[]> {
        return this.countryModel.find().sort({ name: 1 }).exec();
    }

    async getStates(countryId: string): Promise<State[]> {
        const states = await this.stateModel
            .find({ countryId })
            .sort({ name: 1 })
            .exec();

        if (!states.length) {
            throw new NotFoundException(`No states found for country ${countryId}`);
        }

        return states;
    }

    async getCities(stateId: string): Promise<City[]> {
        const cities = await this.cityModel
            .find({ stateId })
            .sort({ name: 1 })
            .exec();

        if (!cities.length) {
            throw new NotFoundException(`No cities found for state ${stateId}`);
        }

        return cities;
    }
}