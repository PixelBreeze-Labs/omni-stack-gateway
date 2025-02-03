// src/services/location-sync.service.ts
import {Injectable, Logger, NotFoundException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Country } from '../schemas/country.schema';
import { State } from '../schemas/state.schema';
import { City } from '../schemas/city.schema';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

// Add interfaces for API responses
interface RestCountry {
    name: {
        common: string;
        official: string;
    };
    cca2: string;
    cca3: string;
}

interface GeoNamesCountry {
    countryCode: string;
    geonameId: number;
    name: string;
}

interface GeoNamesResponse {
    geonames: Array<{
        geonameId: number;
        name: string;
        adminCode1?: string;
        fcl?: string;
    }>;
}

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

    private async syncCountries() {
        try {
            // First get countries from GeoNames to get their geonameIds
            const geonamesResponse = await axios.get<{ geonames: GeoNamesCountry[] }>(
                `http://api.geonames.org/countryInfoJSON?username=${this.geoNamesUsername}`
            );

            // Then get additional data from RestCountries
            const restCountriesResponse = await axios.get<RestCountry[]>('https://restcountries.com/v3.1/all');

            // Create a map of country codes to RestCountries data
            const countryMap = new Map(
                restCountriesResponse.data.map(country => [country.cca2, country])
            );

            for (const geoCountry of geonamesResponse.data.geonames) {
                const restCountryData = countryMap.get(geoCountry.countryCode);
                if (restCountryData) {
                    await this.countryModel.findOneAndUpdate(
                        { code: geoCountry.countryCode },
                        {
                            name: restCountryData.name.common,
                            code: geoCountry.countryCode,
                            geonameId: geoCountry.geonameId
                        },
                        { upsert: true, new: true }
                    );
                }
            }

            this.logger.log(`Synced ${geonamesResponse.data.geonames.length} countries`);
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
                // Get admin divisions (states)
                const statesResponse = await axios.get<GeoNamesResponse>(
                    `http://api.geonames.org/childrenJSON?geonameId=${country.geonameId}&username=${this.geoNamesUsername}`
                );

                if (!statesResponse.data.geonames) {
                    this.logger.warn(`No states found for ${country.name}`);
                    continue;
                }

                for (const stateData of statesResponse.data.geonames) {
                    const state = await this.stateModel.findOneAndUpdate(
                        {
                            countryId: country._id,
                            geonameId: stateData.geonameId
                        },
                        {
                            name: stateData.name,
                            countryId: country._id,
                            geonameId: stateData.geonameId,
                            code: stateData.adminCode1 || stateData.geonameId.toString()
                        },
                        { upsert: true, new: true }
                    );

                    // Get cities for this state
                    try {
                        const citiesResponse = await axios.get<GeoNamesResponse>(
                            `http://api.geonames.org/childrenJSON?geonameId=${stateData.geonameId}&username=${this.geoNamesUsername}`
                        );

                        if (citiesResponse.data.geonames) {
                            for (const cityData of citiesResponse.data.geonames) {
                                if (cityData.fcl === 'P') { // Only include populated places
                                    await this.cityModel.findOneAndUpdate(
                                        {
                                            stateId: state._id,
                                            geonameId: cityData.geonameId
                                        },
                                        {
                                            name: cityData.name,
                                            stateId: state._id,
                                            geonameId: cityData.geonameId
                                        },
                                        { upsert: true, new: true }
                                    );
                                }
                            }
                        }
                    } catch (cityError) {
                        this.logger.error(`Failed to sync cities for state ${state.name} in ${country.name}`, cityError);
                    }

                    // Add delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                this.logger.log(`Synced states and cities for ${country.name}`);
            } catch (error) {
                this.logger.error(`Failed to sync states and cities for ${country.name}`, error);
                continue;
            }
        }
    }

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

    async syncCountryStatesAndCities(countryId: string) {
        const country = await this.countryModel.findById(countryId);
        if (!country) {
            throw new NotFoundException(`Country not found: ${countryId}`);
        }

        try {
            // Get states for country
            const statesResponse = await axios.get<GeoNamesResponse>(
                `http://api.geonames.org/childrenJSON?geonameId=${country.geonameId}&username=${this.geoNamesUsername}`
            );

            if (!statesResponse.data.geonames) {
                throw new NotFoundException(`No states found for ${country.name}`);
            }

            for (const stateData of statesResponse.data.geonames) {
                const state = await this.stateModel.findOneAndUpdate(
                    {
                        countryId: country._id,
                        geonameId: stateData.geonameId
                    },
                    {
                        name: stateData.name,
                        countryId: country._id,
                        geonameId: stateData.geonameId,
                        code: stateData.adminCode1 || stateData.geonameId.toString()
                    },
                    { upsert: true, new: true }
                );

                // Get cities for state
                const citiesResponse = await axios.get<GeoNamesResponse>(
                    `http://api.geonames.org/childrenJSON?geonameId=${stateData.geonameId}&username=${this.geoNamesUsername}`
                );

                if (citiesResponse.data.geonames) {
                    for (const cityData of citiesResponse.data.geonames) {
                        if (cityData.fcl === 'P') {
                            await this.cityModel.findOneAndUpdate(
                                {
                                    stateId: state._id,
                                    geonameId: cityData.geonameId
                                },
                                {
                                    name: cityData.name,
                                    stateId: state._id,
                                    geonameId: cityData.geonameId
                                },
                                { upsert: true, new: true }
                            );
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            return { message: `Successfully synced locations for ${country.name}` };
        } catch (error) {
            this.logger.error(`Failed to sync locations for country ${country.name}`, error);
            throw error;
        }
    }
}