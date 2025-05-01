// src/services/poll.service.ts
import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Poll } from '../schemas/poll.schema';
import { 
    CreatePollDto, 
    UpdatePollDto, 
    PollVoteDto, 
    ListPollsQueryDto,
    AddClientToPollDto,
    RemoveClientFromPollDto
} from '../dtos/poll.dto';
import { ClientService } from '../services/client.service';
import { ClientAppService } from '../services/client-app.service';

@Injectable()
export class PollService {
    constructor(
        @InjectModel(Poll.name) private readonly pollModel: Model<Poll>,
        @Inject(forwardRef(() => ClientService))
        private readonly clientService: ClientService,
        @Inject(forwardRef(() => ClientAppService))
        private readonly clientAppService: ClientAppService,
    ) {}

    async create(createPollDto: CreatePollDto): Promise<Poll> {
        // Handle autoEmbedLocations conversion from string to array if needed
        if (typeof createPollDto.autoEmbedLocations === 'string') {
            try {
                createPollDto.autoEmbedLocations = JSON.parse(createPollDto.autoEmbedLocations);
            } catch (e) {
                // If parsing fails, initialize as empty array
                createPollDto.autoEmbedLocations = [];
            }
        }
        
        // Ensure autoEmbedLocations is an array
        if (!Array.isArray(createPollDto.autoEmbedLocations)) {
            createPollDto.autoEmbedLocations = [];
        }
        
        // If autoEmbedAllPosts is enabled, we can set autoEmbed to true as well
        if (createPollDto.autoEmbedAllPosts) {
            createPollDto.autoEmbed = true;
        }
        
        // Prepare clientIds array
        const clientIds = [createPollDto.clientId];
        
        // Add additional client IDs if this is a multi-client poll
        if (createPollDto.isMultiClient && createPollDto.additionalClientIds?.length > 0) {
            // Validate that all additional client IDs exist
            for (const clientId of createPollDto.additionalClientIds) {
                const clientExists = await this.clientService.clientExists(clientId);
                if (!clientExists) {
                    throw new BadRequestException(`Client with ID ${clientId} does not exist`);
                }
                
                // Only add if not already in the list
                if (!clientIds.includes(clientId)) {
                    clientIds.push(clientId);
                }
            }
        }
        
        // Apply client brand colors if available
        try {
            // Get the primary client's app
            const clientApp = await this.clientAppService.findDefaultAppForClient(createPollDto.clientId);
            
            if (clientApp && clientApp.brandColors) {
                // Apply brand colors if not explicitly set in the DTO
                if (!createPollDto.highlightColor) {
                    createPollDto.highlightColor = clientApp.brandColors.primaryColor || '#2597a4';
                }
                if (!createPollDto.voteButtonColor) {
                    createPollDto.voteButtonColor = clientApp.brandColors.secondaryColor || '#0a0a0a';
                }
                if (!createPollDto.voteButtonHoverColor) {
                    createPollDto.voteButtonHoverColor = clientApp.brandColors.primaryHoverColor || '#1d7a84';
                }
                if (!createPollDto.iconColor) {
                    createPollDto.iconColor = clientApp.brandColors.secondaryColor || '#d0d5dd';
                }
                if (!createPollDto.iconHoverColor) {
                    createPollDto.iconHoverColor = clientApp.brandColors.primaryColor || '#2597a4';
                }
                if (!createPollDto.resultsLinkColor) {
                    createPollDto.resultsLinkColor = clientApp.brandColors.secondaryColor || '#0a0a0a';
                }
                if (!createPollDto.resultsLinkHoverColor) {
                    createPollDto.resultsLinkHoverColor = clientApp.brandColors.primaryHoverColor || '#1d7a84';
                }
                if (!createPollDto.radioCheckedBorderColor) {
                    createPollDto.radioCheckedBorderColor = clientApp.brandColors.primaryColor || '#2597a4';
                }
                if (!createPollDto.radioCheckedDotColor) {
                    createPollDto.radioCheckedDotColor = clientApp.brandColors.primaryColor || '#2597a4';
                }
            }
            
            // Process client style overrides for additional clients
            const clientStyleOverridesMap = new Map<string, any>();
            
            if (createPollDto.clientStyleOverrides) {
                for (const [clientId, overrides] of Object.entries(createPollDto.clientStyleOverrides)) {
                    // Skip if client ID is not in the clientIds array
                    if (!clientIds.includes(clientId)) continue;
                    
                    // Apply client app colors for any missing overrides
                    try {
                        const clientApp = await this.clientAppService.findDefaultAppForClient(clientId);
                        if (clientApp && clientApp.brandColors) {
                            if (!overrides.highlightColor) {
                                overrides.highlightColor = clientApp.brandColors.primaryColor;
                            }
                            if (!overrides.voteButtonColor) {
                                overrides.voteButtonColor = clientApp.brandColors.secondaryColor;
                            }
                            if (!overrides.voteButtonHoverColor) {
                                overrides.voteButtonHoverColor = clientApp.brandColors.primaryHoverColor;
                            }
                            // Apply other brand colors as needed
                        }
                    } catch (err) {
                        // Just continue if we can't find client app info
                    }
                    
                    clientStyleOverridesMap.set(clientId, overrides);
                }
            }
            
            // Create the poll with all style customization fields
            const pollData = {
                ...createPollDto,
                clientIds,
                clientStyleOverrides: clientStyleOverridesMap
            };
            
            const newPoll = new this.pollModel(pollData);
            return await newPoll.save();
        } catch (error) {
            // If there's an error with the client app lookup, still create the poll
            // with the provided values
            const pollData = {
                ...createPollDto,
                clientIds
            };
            
            const newPoll = new this.pollModel(pollData);
            return await newPoll.save();
        }
    }

    async findAll(clientId: string, query: ListPollsQueryDto) {
        const { 
            search, 
            page = 1, 
            limit = 10, 
            sortBy = 'createdAt', 
            sortOrder = 'desc',
            includeMultiClient = true
        } = query;

        // Build filter to find polls that include this client
        let filter: any = { clientIds: clientId };
        
        // If not including multi-client polls, filter to just polls where this client is the primary
        if (!includeMultiClient) {
            filter = { clientId: clientId };
        }
        
        if (search) {
            filter.$or = [
                { title: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }

        const sort: any = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const skip = (page - 1) * limit;
        
        const [polls, total] = await Promise.all([
            this.pollModel
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .exec(),
            this.pollModel.countDocuments(filter)
        ]);

        return {
            data: polls,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total
            }
        };
    }

    async findOne(id: string, clientId: string): Promise<Poll> {
        // Look for polls where this client is in the clientIds array
        const poll = await this.pollModel.findOne({ 
            _id: id,
            clientIds: clientId 
        }).exec();

        if (!poll) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }

        return poll;
    }

    async findByWordpressId(wordpressId: number, clientId: string): Promise<Poll> {
        const poll = await this.pollModel.findOne({ 
            wordpressId,
            clientIds: clientId 
        }).exec();

        if (!poll) {
            throw new NotFoundException(`Poll with WordPress ID ${wordpressId} not found`);
        }

        return poll;
    }

    async update(id: string, clientId: string, updatePollDto: UpdatePollDto): Promise<Poll> {
        // First verify the poll exists and belongs to this client
        const existingPoll = await this.pollModel.findOne({ 
            _id: id,
            clientIds: clientId
        }).exec();

        if (!existingPoll) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }

        // Only the primary client can modify the core poll data
        const isPrimaryClient = existingPoll.clientId.toString() === clientId;
        
        // If not primary client, only allow updating clientStyleOverrides for this client
        if (!isPrimaryClient) {
            // Extract only this client's style overrides
            const clientOverrides = updatePollDto.clientStyleOverrides?.[clientId];
            if (clientOverrides) {
                // Update just this client's style overrides
                const updateResult = await this.pollModel.findByIdAndUpdate(
                    id,
                    { 
                        $set: { 
                            [`clientStyleOverrides.${clientId}`]: clientOverrides 
                        } 
                    },
                    { new: true }
                ).exec();
                
                return updateResult;
            }
            
            throw new UnauthorizedException('Only the primary client can modify the core poll data');
        }

        // Handle autoEmbedLocations conversion from string to array if needed
        if (typeof updatePollDto.autoEmbedLocations === 'string') {
            try {
                updatePollDto.autoEmbedLocations = JSON.parse(updatePollDto.autoEmbedLocations);
            } catch (e) {
                // If parsing fails, keep the existing value
                updatePollDto.autoEmbedLocations = existingPoll.autoEmbedLocations;
            }
        }
        
        // If autoEmbedAllPosts is being enabled, ensure autoEmbed is also enabled
        if (updatePollDto.autoEmbedAllPosts) {
            updatePollDto.autoEmbed = true;
        }
        
        // Handle clientIds updates if isMultiClient status changes
        if (updatePollDto.isMultiClient !== undefined) {
            // If going from multi-client to single-client
            if (existingPoll.isMultiClient && !updatePollDto.isMultiClient) {
                // Reset to just the primary client
                updatePollDto['clientIds'] = [existingPoll.clientId];
            }
        }
        
        // Handle additionalClientIds updates
        if (updatePollDto.additionalClientIds?.length > 0) {
            // Start with the primary client
            const updatedClientIds = [existingPoll.clientId];
            
            // Add additional client IDs
            for (const clientId of updatePollDto.additionalClientIds) {
                // Validate that client exists
                const clientExists = await this.clientService.clientExists(clientId);
                if (!clientExists) {
                    throw new BadRequestException(`Client with ID ${clientId} does not exist`);
                }
                
                // Only add if not the primary client and not already in the list
                if (clientId !== existingPoll.clientId.toString() && !updatedClientIds.includes(clientId)) {
                    updatedClientIds.push(clientId);
                }
            }
            
            // Set the updated clientIds
            updatePollDto['clientIds'] = updatedClientIds;
        }
        
        // Process client style overrides for updates
        if (updatePollDto.clientStyleOverrides) {
            const existingOverrides = existingPoll.clientStyleOverrides || new Map();
            
            for (const [clientId, overrides] of Object.entries(updatePollDto.clientStyleOverrides)) {
                // Skip if client ID is not in the clientIds array (after any updates)
                const updatedClientIds = updatePollDto['clientIds'] || existingPoll.clientIds;
                if (!updatedClientIds.includes(clientId)) continue;
                
                // Update the overrides for this client
                existingOverrides.set(clientId, overrides);
            }
            
            // Convert Map to a plain object before assigning
            const overridesObject = Object.fromEntries(existingOverrides);
            updatePollDto['clientStyleOverrides'] = overridesObject;
        }

        // Update the poll with all style customization fields
        return await this.pollModel.findByIdAndUpdate(
            id,
            updatePollDto,
            { new: true }
        ).exec();
    }

    async delete(id: string, clientId: string): Promise<void> {
        // Only the primary client can delete the poll
        const poll = await this.pollModel.findOne({ 
            _id: id, 
            clientId 
        }).exec();
        
        if (!poll) {
            // Check if the poll exists but this client is not the primary client
            const sharedPoll = await this.pollModel.findOne({
                _id: id,
                clientIds: clientId
            }).exec();
            
            if (sharedPoll) {
                throw new UnauthorizedException('Only the primary client can delete the poll');
            } else {
                throw new NotFoundException(`Poll with ID ${id} not found`);
            }
        }
        
        await this.pollModel.deleteOne({ _id: id }).exec();
    }

    async vote(id: string, clientId: string, voteDto: PollVoteDto): Promise<Poll> {
        const poll = await this.pollModel.findOne({
            _id: id,
            clientIds: clientId
        }).exec();

        if (!poll) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }

        const { optionIndex } = voteDto;

        // Check if the option index is valid
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
            throw new BadRequestException(`Invalid option index: ${optionIndex}`);
        }

        // Increment the vote count for the option
        poll.options[optionIndex].votes += 1;
        
        // Save the updated poll
        return await poll.save();
    }

    async getStats(clientId: string) {
        // Get total polls where this client is included
        const totalPolls = await this.pollModel.countDocuments({ clientIds: clientId }).exec();
        
        // Get total votes across all polls for this client
        const polls = await this.pollModel.find({ clientIds: clientId }).exec();
        let totalVotes = 0;
        
        for (const poll of polls) {
            for (const option of poll.options) {
                totalVotes += option.votes;
            }
        }
        
        // Get most popular poll (poll with most votes)
        let mostPopularPoll = null;
        let maxVotes = 0;
        
        for (const poll of polls) {
            let pollVotes = 0;
            for (const option of poll.options) {
                pollVotes += option.votes;
            }
            
            if (pollVotes > maxVotes) {
                maxVotes = pollVotes;
                mostPopularPoll = {
                    id: poll._id,
                    title: poll.title,
                    votes: pollVotes,
                    isMultiClient: poll.isMultiClient,
                    isPrimaryClient: poll.clientId.toString() === clientId
                };
            }
        }
        
        // Get latest polls
        const latestPolls = await this.pollModel
            .find({ clientIds: clientId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('title createdAt isMultiClient')
            .exec();
            
        // Get multi-client stats
        const multiClientCount = await this.pollModel.countDocuments({ 
            clientIds: clientId,
            isMultiClient: true 
        }).exec();
        
        // Primary client polls count (polls created by this client)
        const primaryClientCount = await this.pollModel.countDocuments({ 
            clientId: clientId 
        }).exec();
            
        return {
            totalPolls,
            totalVotes,
            mostPopularPoll,
            latestPolls,
            multiClientStats: {
                multiClientCount,
                primaryClientCount,
                sharedWithOthersCount: primaryClientCount > 0 ? 
                    await this.pollModel.countDocuments({ 
                        clientId: clientId,
                        isMultiClient: true
                    }) : 0
            }
        };
    }

    // Method to add a client to an existing poll
    async addClient(id: string, requestingClientId: string, addClientDto: AddClientToPollDto): Promise<Poll> {
        // Get the poll and check if the requesting client is the primary client
        const poll = await this.pollModel.findOne({ 
            _id: id,
            clientId: requestingClientId 
        }).exec();
        
        const { clientId, styleOverrides } = addClientDto;
        
        if (!poll) {
            // Check if the poll exists but this client is not the primary
            const sharedPoll = await this.pollModel.findOne({
                _id: id,
                clientIds: clientId
            }).exec();
            
            if (sharedPoll) {
                throw new UnauthorizedException('Only the primary client can add clients to the poll');
            } else {
                throw new NotFoundException(`Poll with ID ${id} not found`);
            }
        }
        
        
        
        // Validate that the client exists
        const clientExists = await this.clientService.clientExists(clientId);
        if (!clientExists) {
            throw new BadRequestException(`Client with ID ${clientId} does not exist`);
        }
        
        // Check if client is already added
        if (poll.clientIds.includes(clientId)) {
            // If already added, just update style overrides if provided
            if (styleOverrides) {
                poll.clientStyleOverrides.set(clientId, styleOverrides);
                await poll.save();
            }
            return poll;
        }
        
        // Add client to clientIds array
        poll.clientIds.push(clientId);
        
        // Set isMultiClient to true
        poll.isMultiClient = true;
        
        // Add style overrides if provided
        if (styleOverrides) {
            // Apply client app brand colors for any missing overrides
            try {
                const clientApp = await this.clientAppService.findDefaultAppForClient(clientId);
                if (clientApp && clientApp.brandColors) {
                    if (!styleOverrides.highlightColor) {
                        styleOverrides.highlightColor = clientApp.brandColors.primaryColor;
                    }
                    // Apply other brand colors as needed
                }
            } catch (err) {
                // Just continue if we can't find client app info
            }
            
            poll.clientStyleOverrides.set(clientId, styleOverrides);
        }
        
        // Save the updated poll
        return await poll.save();
    }

    // Method to remove a client from an existing poll
    async removeClient(id: string, requestingClientId: string, removeClientDto: RemoveClientFromPollDto): Promise<Poll> {
        // Get the poll and check if the requesting client is the primary client
        const poll = await this.pollModel.findOne({ 
            _id: id,
            clientId: requestingClientId 
        }).exec();
        
        if (!poll) {
            // Allow clients to remove themselves from polls they don't own
            if (requestingClientId === removeClientDto.clientId) {
                // Find poll where this client is included
                const sharedPoll = await this.pollModel.findOne({
                    _id: id,
                    clientIds: requestingClientId
                }).exec();
                
                if (sharedPoll) {
                    // Remove this client from the poll
                    sharedPoll.clientIds = sharedPoll.clientIds.filter(
                        cId => cId.toString() !== requestingClientId
                    );
                    
                    // Remove any style overrides for this client
                    sharedPoll.clientStyleOverrides.delete(requestingClientId);
                    
                    // Update isMultiClient flag if needed
                    if (sharedPoll.clientIds.length <= 1) {
                        sharedPoll.isMultiClient = false;
                    }
                    
                    // Save changes
                    await sharedPoll.save();
                    return sharedPoll;
                }
            }
            
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }
        
        const { clientId } = removeClientDto;
        
        // Cannot remove the primary client
        if (clientId === poll.clientId.toString()) {
            throw new BadRequestException('Cannot remove the primary client from the poll');
        }
        
        // Check if client is in the poll
        if (!poll.clientIds.includes(clientId)) {
            throw new BadRequestException(`Client with ID ${clientId} is not associated with this poll`);
        }
        
        // Remove client from clientIds array
        poll.clientIds = poll.clientIds.filter(cId => cId.toString() !== clientId);
        
        // Remove any style overrides for this client
        poll.clientStyleOverrides.delete(clientId);
        
        // Update isMultiClient flag if needed
        if (poll.clientIds.length <= 1) {
            poll.isMultiClient = false;
        }
        
        // Save the updated poll
        return await poll.save();
    }

    // Method to get client-specific rendering information
    async getClientSpecificPoll(id: string, clientId: string): Promise<Poll> {
        const poll = await this.findOne(id, clientId);
        
        // Make a copy of the poll to modify
        const result = JSON.parse(JSON.stringify(poll));
        
        // Apply client-specific style overrides if they exist
        const clientOverrides = poll.clientStyleOverrides?.get(clientId);
        if (clientOverrides) {
            // Apply each override to the result object
            for (const [key, value] of Object.entries(clientOverrides)) {
                result[key] = value;
            }
        }
        
        return result;
    }
}