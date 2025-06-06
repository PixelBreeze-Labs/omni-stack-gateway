// src/services/poll.service.ts
import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Poll, PollOption } from '../schemas/poll.schema';
import { 
    CreatePollDto,
    CreateMultiClientPollDto, 
    UpdatePollDto, 
    PollVoteDto, 
    ListPollsQueryDto,
    AddClientToPollDto,
    RemoveClientFromPollDto
} from '../dtos/poll.dto';
import { ClientService } from './client.service';
import { ClientAppService } from './client-app.service';
import { Inject, forwardRef } from '@nestjs/common';

@Injectable()
export class PollService {
    constructor(
        @InjectModel(Poll.name) private readonly pollModel: Model<Poll>,
        @Inject(forwardRef(() => ClientService))
        private readonly clientService: ClientService,
        @Inject(forwardRef(() => ClientAppService))
        private readonly clientAppService: ClientAppService,
    ) {}

    /**
     * Create a regular poll for a single client
     */
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
        
        // Prepare clientIds array - default to just the primary client
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
                    createPollDto.voteButtonColor = clientApp.brandColors.primaryColor || '#0a0a0a';
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
        } catch (error) {
            // If there's an error with client app, continue with default colors
        }
            
        // Process client style overrides
        const clientStyleOverridesMap = new Map<string, any>();
        
        if (createPollDto.clientStyleOverrides) {
            for (const [clientId, overrides] of Object.entries(createPollDto.clientStyleOverrides)) {
                // Skip if client ID is not in the clientIds array
                if (!clientIds.includes(clientId)) continue;
                
                // Try to apply client app colors for any missing overrides
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
                        // Add other brand color mappings as needed
                    }
                } catch (err) {
                    // Just continue if we can't find client app info
                }
                
                clientStyleOverridesMap.set(clientId, overrides);
            }
        }
        
        // Create the poll with all configuration
        const pollData = {
            ...createPollDto,
            clientIds,
            clientStyleOverrides: clientStyleOverridesMap
        };
        
        const newPoll = new this.pollModel(pollData);
        return await newPoll.save();
    }
    
   /**
 * Specifically create a multi-client poll
 */
async createMultiClientPoll(createMultiClientPollDto: CreateMultiClientPollDto): Promise<Poll> {
    // Force multi-client to true for this specific method
    createMultiClientPollDto.isMultiClient = true;
    
    // Make sure we have at least one additional client
    if (!createMultiClientPollDto.additionalClientIds || createMultiClientPollDto.additionalClientIds.length === 0) {
        throw new BadRequestException('Multi-client poll requires at least one additional client');
    }
    
    // Initialize client style overrides as an empty object if not provided
    if (!createMultiClientPollDto.clientStyleOverrides) {
        createMultiClientPollDto.clientStyleOverrides = {};
    }
    
    // Prepare the complete list of client IDs (primary + additional)
    const allClientIds = [
        createMultiClientPollDto.clientId,
        ...createMultiClientPollDto.additionalClientIds
    ];
    
    // Generate style overrides based on each client's brand colors
    for (const clientId of allClientIds) {
        try {
            const clientApp = await this.clientAppService.findDefaultAppForClient(clientId);
            if (clientApp && clientApp.brandColors) {
                // Get any existing overrides for this client
                const existingOverrides = createMultiClientPollDto.clientStyleOverrides[clientId] || {};
                
                // Create brand-based default overrides
                const brandBasedDefaults = {
                    // Light mode colors from brand colors
                    highlightColor: clientApp.brandColors.primaryColor || '#2597a4',
                    optionHighlightColor: clientApp.brandColors.primaryColor || '#2597a4',
                    voteButtonColor: clientApp.brandColors.primaryColor || '#0a0a0a',
                    voteButtonHoverColor: clientApp.brandColors.primaryHoverColor || '#1d7a84',
                    iconColor: clientApp.brandColors.secondaryColor || '#d0d5dd',
                    iconHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                    resultsLinkColor: clientApp.brandColors.secondaryColor || '#0a0a0a',
                    resultsLinkHoverColor: clientApp.brandColors.primaryHoverColor || '#1d7a84',
                    radioCheckedBorderColor: clientApp.brandColors.primaryColor || '#2597a4',
                    radioCheckedDotColor: clientApp.brandColors.primaryColor || '#2597a4',
                    optionsBackgroundColor: clientApp.brandColors.optionsBackgroundColor || '#fcfcfc',
                    optionsHoverColor: clientApp.brandColors.optionsHoverColor || '#f7f9fc',
                    progressBarBackgroundColor: clientApp.brandColors.progressBarBackgroundColor || '#f0f0f5',
                    percentageLabelColor: clientApp.brandColors.percentageLabelColor || '#ffffff',
                    
                    // Dark mode setting from client preferences
                    darkMode: clientApp.brandColors.darkModePreference === true,
                    
                    // Dark mode colors derived from brand colors
                    darkModeBackground: '#222222', 
                    darkModeTextColor: '#ffffff',
                    darkModeLinkColor: '#ffffff',
                    darkModeLinkHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                    darkModeIconColor: '#ffffff',
                    darkModeIconHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                    darkModeRadioCheckedBorder: clientApp.brandColors.primaryColor || '#2597a4',
                    darkModeRadioCheckedDot: clientApp.brandColors.primaryColor || '#2597a4',
                    darkModeOptionBackground: clientApp.brandColors.optionsBackgroundColor || '#333333',
                    darkModeOptionHover: clientApp.brandColors.optionsHoverColor || '#444444',
                    darkModeProgressBackground: clientApp.brandColors.progressBarBackgroundColor || '#333333',
                    darkModePercentageLabelColor: clientApp.brandColors.percentageLabelColor || '#ffffff',
                    darkModeRadioBorder: '#D0D5DD'
                };
                
                // Create completely new object combining defaults and explicit overrides
                const finalOverrides = {};
                
                // First copy all brand-based defaults
                Object.assign(finalOverrides, brandBasedDefaults);
                
                // Then apply explicit overrides
                for (const [key, value] of Object.entries(existingOverrides)) {
                    // Ensure we don't lose boolean false values
                    if (value !== undefined) {
                        finalOverrides[key] = value;
                    }
                }
                
                // Set the overrides for this client
                createMultiClientPollDto.clientStyleOverrides[clientId] = finalOverrides;
            }
        } catch (error) {
            // If there's an error, just use any explicit overrides that were provided
            // but don't remove existing overrides
            if (!createMultiClientPollDto.clientStyleOverrides[clientId]) {
                createMultiClientPollDto.clientStyleOverrides[clientId] = {};
            }
        }
    }
    
    // Use the standard create method with the updated DTO
    return await this.create({
        ...createMultiClientPollDto,
        // Ensure clientStyleOverrides is correctly passed
        clientStyleOverrides: { ...createMultiClientPollDto.clientStyleOverrides }
    });
}

    /**
     * Get all polls for a client
     */
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

    /**
     * Get polls created by this client (where this client is the primary)
     */
    async findOwnedPolls(clientId: string, query: ListPollsQueryDto) {
        const { 
            search, 
            page = 1, 
            limit = 10, 
            sortBy = 'createdAt', 
            sortOrder = 'desc'
        } = query;

        // Filter to only show polls where this client is the primary
        const filter: any = { clientId };
        
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

    /**
     * Get polls shared with this client (multi-client polls)
     */
    async findMultiClientPolls(clientId: string, query: ListPollsQueryDto) {
        const { 
            search, 
            page = 1, 
            limit = 10, 
            sortBy = 'createdAt', 
            sortOrder = 'desc'
        } = query;

        // Filter to only show multi-client polls this client has access to
        const filter: any = { 
            clientIds: clientId,
            isMultiClient: true
        };
        
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

    async findOne(id: string, clientId: string): Promise<any> {
        // Look for polls where this client is in the clientIds array
        const poll = await this.pollModel.findOne({ 
            _id: id,
            clientIds: clientId 
        }).exec();
        
        if (!poll) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }
        
        // Convert poll to plain JavaScript object
        const pollObj = JSON.parse(JSON.stringify(poll));
        
        // Apply client-specific overrides directly from clientStyleOverrides
        if (pollObj.clientStyleOverrides && 
            pollObj.clientStyleOverrides[clientId]) {
            
            // Get the overrides for this specific client
            const overrides = pollObj.clientStyleOverrides[clientId];
            
            // Apply all properties from overrides to the top level
            Object.entries(overrides).forEach(([key, value]) => {
                pollObj[key] = value;
            });
        }
        
        // Important: Apply the optionHighlightColor to each option
        if (pollObj.options && Array.isArray(pollObj.options)) {
            const highlightToUse = pollObj.optionHighlightColor || pollObj.highlightColor;
            
            pollObj.options = pollObj.options.map((option: PollOption) => {
                // Add highlightColor to each option unless it has a customHighlight
                option.customHighlight = highlightToUse;
                return option;
            });
        }
        
        return pollObj;
    }
    /**
     * Find a poll by WordPress ID
     */
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

   /**
 * Update a poll
 */
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
            // Get existing overrides or create empty object
            const existingClientOverrides = existingPoll.clientStyleOverrides.get(clientId) || {};
            
            // Specifically handle darkMode to ensure it can be toggled properly
            if (clientOverrides.darkMode !== undefined) {
                existingClientOverrides.darkMode = clientOverrides.darkMode;
            }
            
            // Merge existing with new overrides
            const mergedOverrides = {
                ...existingClientOverrides,
                ...clientOverrides
            };
            
            // Update just this client's style overrides
            existingPoll.clientStyleOverrides.set(clientId, mergedOverrides);
            return await existingPoll.save();
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
            
            // Clear any style overrides for other clients
            const primaryClientOverrides = existingPoll.clientStyleOverrides.get(existingPoll.clientId.toString());
            existingPoll.clientStyleOverrides.clear();
            
            // Keep only the primary client's overrides if they exist
            if (primaryClientOverrides) {
                existingPoll.clientStyleOverrides.set(existingPoll.clientId.toString(), primaryClientOverrides);
            }
        }
    }
    
    // Handle additionalClientIds updates
    if (updatePollDto.additionalClientIds?.length > 0) {
        // Start with the primary client
        const updatedClientIds = [existingPoll.clientId];
        const existingClientIds = existingPoll.clientIds.map(id => id.toString());
        const newClientIds = [];
        
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
                
                // Check if this is a new client being added
                if (!existingClientIds.includes(clientId)) {
                    newClientIds.push(clientId);
                }
            }
        }
        
        // Generate brand-based style overrides for any new clients
        for (const newClientId of newClientIds) {
            // Skip if client already has style overrides
            if (existingPoll.clientStyleOverrides.has(newClientId)) continue;
            
            try {
                const clientApp = await this.clientAppService.findDefaultAppForClient(newClientId);
                if (clientApp && clientApp.brandColors) {
                    // Create comprehensive style overrides based on brand colors
                    const brandOverrides = {
                        // Light mode colors
                        highlightColor: clientApp.brandColors.primaryColor || '#2597a4',
                        voteButtonColor: clientApp.brandColors.secondaryColor || '#0a0a0a',
                        voteButtonHoverColor: clientApp.brandColors.primaryHoverColor || '#1d7a84',
                        iconColor: clientApp.brandColors.secondaryColor || '#d0d5dd',
                        iconHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                        resultsLinkColor: clientApp.brandColors.secondaryColor || '#0a0a0a',
                        resultsLinkHoverColor: clientApp.brandColors.primaryHoverColor || '#1d7a84',
                        radioCheckedBorderColor: clientApp.brandColors.primaryColor || '#2597a4',
                        radioCheckedDotColor: clientApp.brandColors.primaryColor || '#2597a4',
                        
                        // Dark mode setting from client preferences
                        darkMode: clientApp.brandColors.darkModePreference !== undefined 
                            ? clientApp.brandColors.darkModePreference 
                            : false,
                        
                        // Dark mode derived colors
                        darkModeBackground: '#222222',
                        darkModeTextColor: '#ffffff',
                        darkModeLinkColor: '#ffffff',
                        darkModeLinkHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                        darkModeIconColor: '#ffffff',
                        darkModeIconHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                        darkModeRadioCheckedBorder: clientApp.brandColors.primaryColor || '#2597a4',
                        darkModeRadioCheckedDot: clientApp.brandColors.primaryColor || '#2597a4'
                    };
                    
                    // Set brand-based overrides for the new client
                    existingPoll.clientStyleOverrides.set(newClientId, brandOverrides);
                }
            } catch (err) {
                console.error(`Error fetching brand colors for client ${newClientId}:`, err);
                // Continue without adding overrides if we can't fetch client app info
            }
        }
        
        // Set the updated clientIds
        updatePollDto['clientIds'] = updatedClientIds;
        
        // Remove style overrides for clients that are no longer in the list
        const currentClients = new Set(updatedClientIds.map(id => id.toString()));
        for (const [clientId] of existingPoll.clientStyleOverrides.entries()) {
            if (!currentClients.has(clientId)) {
                existingPoll.clientStyleOverrides.delete(clientId);
            }
        }
        
        // Ensure isMultiClient is set if we have more than one client
        if (updatedClientIds.length > 1) {
            updatePollDto.isMultiClient = true;
        } else {
            updatePollDto.isMultiClient = false;
        }
    }
    
    // Handle client style overrides separately
    if (updatePollDto.clientStyleOverrides) {
        // Handle client style overrides separately to avoid issues with Map conversion
        for (const [clientId, overrides] of Object.entries(updatePollDto.clientStyleOverrides)) {
            // Skip if client ID is not in the clientIds array (after any updates)
            const updatedClientIds = updatePollDto['clientIds'] || existingPoll.clientIds.map(id => id.toString());
            if (!updatedClientIds.includes(clientId)) continue;
            
            // Get existing overrides for this client
            const existingClientOverrides = existingPoll.clientStyleOverrides.get(clientId) || {};
            
            // Specifically handle darkMode to ensure it can be toggled properly
            if (overrides.darkMode !== undefined) {
                existingClientOverrides.darkMode = overrides.darkMode;
            }
            
            // Merge existing with new overrides
            const mergedOverrides = {
                ...existingClientOverrides,
                ...overrides
            };
            
            // Update just this client's style overrides
            existingPoll.clientStyleOverrides.set(clientId, mergedOverrides);
        }
        
        // Remove from DTO so it doesn't interfere with the Object.assign below
        delete updatePollDto.clientStyleOverrides;
    }

    // Create a safe copy of the DTO with clientStyleOverrides removed
    const safeUpdateDto = { ...updatePollDto };
    delete safeUpdateDto.clientStyleOverrides;

    // Update the poll with remaining fields from DTO
    Object.assign(existingPoll, safeUpdateDto);
    return await existingPoll.save();
}

    /**
     * Delete a poll
     */
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

    /**
 * Vote on a poll with client-specific tracking
 */
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

    // Get the current option
    const option = poll.options[optionIndex];
    
    // Initialize clientVotes Map if it doesn't exist
    if (!option.clientVotes) {
        option.clientVotes = new Map();
    }
    
    // Get current client vote count (default to 0 if not set)
    const currentClientVotes = option.clientVotes.get(clientId) || 0;
    
    // Increment the client-specific vote count
    option.clientVotes.set(clientId, currentClientVotes + 1);
    
    // Update the total vote count
    option.votes += 1;
    
    // Save the updated poll
    return await poll.save();
}

    /**
 * Get poll statistics
 */
async getStats(clientId: string) {
    // Get total polls where this client is included
    const totalPolls = await this.pollModel.countDocuments({ clientIds: clientId }).exec();
    
    // Get total votes across all polls for this client
    const polls = await this.pollModel.find({ clientIds: clientId }).exec();
    let totalVotes = 0;
    let totalClientVotes = 0;
    
    for (const poll of polls) {
        for (const option of poll.options) {
            // Count total votes across all clients
            totalVotes += option.votes;
            
            // Count client-specific votes if they exist
            if (option.clientVotes && option.clientVotes.has(clientId)) {
                totalClientVotes += option.clientVotes.get(clientId);
            }
        }
    }
    
    // Get most popular poll (poll with most votes)
    let mostPopularPoll = null;
    let maxVotes = 0;
    let maxClientVotes = 0;
    let mostPopularClientPoll = null;
    
    for (const poll of polls) {
        let pollVotes = 0;
        let pollClientVotes = 0;
        
        for (const option of poll.options) {
            // Count total votes
            pollVotes += option.votes;
            
            // Count client-specific votes
            if (option.clientVotes && option.clientVotes.has(clientId)) {
                pollClientVotes += option.clientVotes.get(clientId);
            }
        }
        
        // Update most popular poll overall
        if (pollVotes > maxVotes) {
            maxVotes = pollVotes;
            mostPopularPoll = {
                id: poll._id,
                title: poll.title,
                votes: pollVotes,
                clientVotes: pollClientVotes,
                isMultiClient: poll.isMultiClient,
                isPrimaryClient: poll.clientId.toString() === clientId
            };
        }
        
        // Update most popular poll for this client specifically
        if (pollClientVotes > maxClientVotes) {
            maxClientVotes = pollClientVotes;
            mostPopularClientPoll = {
                id: poll._id,
                title: poll.title,
                votes: pollVotes,
                clientVotes: pollClientVotes,
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
        totalClientVotes,
        mostPopularPoll,
        mostPopularClientPoll,
        latestPolls,
        multiClientStats: {
            multiClientCount,
            primaryClientCount,
            sharedWithOthersCount: primaryClientCount > 0 ? 
                await this.pollModel.countDocuments({ 
                    clientId: clientId,
                    isMultiClient: true
                }) : 0
        },
        voteDistribution: {
            totalVotes,
            clientVotes: totalClientVotes,
            otherClientsVotes: totalVotes - totalClientVotes
        }
    };
}

    /**
 * Add a client to an existing poll
 */
async addClient(id: string, requestingClientId: string, addClientDto: AddClientToPollDto): Promise<Poll> {
    // Get the poll and check if the requesting client is the primary client
    const poll = await this.pollModel.findOne({ 
        _id: id,
        clientId: requestingClientId 
    }).exec();
    
    if (!poll) {
        // Check if the poll exists but this client is not the primary
        const sharedPoll = await this.pollModel.findOne({
            _id: id,
            clientIds: requestingClientId
        }).exec();
        
        if (sharedPoll) {
            throw new UnauthorizedException('Only the primary client can add clients to the poll');
        } else {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }
    }
    
    const { clientId, styleOverrides } = addClientDto;
    
    // Validate that the client exists
    const clientExists = await this.clientService.clientExists(clientId);
    if (!clientExists) {
        throw new BadRequestException(`Client with ID ${clientId} does not exist`);
    }
    
    // Check if client is already added
    if (poll.clientIds.includes(clientId)) {
        // If already added, just update style overrides if provided
        if (styleOverrides) {
            // Get existing overrides
            const existingOverrides = poll.clientStyleOverrides.get(clientId) || {};
            
            // Specifically handle darkMode flag to ensure it can be toggled correctly
            if (styleOverrides.darkMode !== undefined) {
                existingOverrides.darkMode = styleOverrides.darkMode;
            }
            
            // Merge with new overrides
            const mergedOverrides = {
                ...existingOverrides,
                ...styleOverrides
            };
            
            poll.clientStyleOverrides.set(clientId, mergedOverrides);
            await poll.save();
        }
        return poll;
    }
    
    // Add client to clientIds array
    poll.clientIds.push(clientId);
    
    // Set isMultiClient to true
    poll.isMultiClient = true;
    
    // Generate default style overrides from the client's brand colors
    let clientStyleOverrides = {};
    
    try {
        const clientApp = await this.clientAppService.findDefaultAppForClient(clientId);
        if (clientApp && clientApp.brandColors) {
            // Create comprehensive style overrides based on brand colors
            clientStyleOverrides = {
                // Light mode colors
                highlightColor: clientApp.brandColors.primaryColor || '#2597a4',
                optionHighlightColor: clientApp.brandColors.primaryColor || '#d0d5dd',
                voteButtonColor: clientApp.brandColors.secondaryColor || '#0a0a0a',
                voteButtonHoverColor: clientApp.brandColors.primaryHoverColor || '#1d7a84',
                iconColor: clientApp.brandColors.secondaryColor || '#d0d5dd',
                iconHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                resultsLinkColor: clientApp.brandColors.secondaryColor || '#0a0a0a',
                resultsLinkHoverColor: clientApp.brandColors.primaryHoverColor || '#1d7a84',
                radioCheckedBorderColor: clientApp.brandColors.primaryColor || '#2597a4',
                radioCheckedDotColor: clientApp.brandColors.primaryColor || '#2597a4',
                
                // Dark mode setting from client preferences
                darkMode: clientApp.brandColors.darkModePreference !== undefined 
                    ? clientApp.brandColors.darkModePreference 
                    : false,
                
                // Dark mode derived colors
                darkModeBackground: '#222222',
                darkModeTextColor: '#ffffff',
                darkModeLinkColor: '#ffffff',
                darkModeLinkHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                darkModeIconColor: '#ffffff',
                darkModeIconHoverColor: clientApp.brandColors.primaryColor || '#2597a4',
                darkModeRadioCheckedBorder: clientApp.brandColors.primaryColor || '#2597a4',
                darkModeRadioCheckedDot: clientApp.brandColors.primaryColor || '#2597a4'
            };
        }
    } catch (err) {
        console.error(`Error fetching brand colors for client ${clientId}:`, err);
        // Continue with empty overrides if we can't fetch client app info
    }
    
    // If style overrides were provided, merge them with the defaults
    if (styleOverrides) {
        // Handle darkMode explicitly to ensure it can be toggled properly
        if (styleOverrides.darkMode !== undefined) {
            clientStyleOverrides['darkMode'] = styleOverrides.darkMode;
        }
        
        clientStyleOverrides = {
            ...clientStyleOverrides,
            ...styleOverrides
        };
    }
    
    // Set the final style overrides
    poll.clientStyleOverrides.set(clientId, clientStyleOverrides);
    
    // Save the updated poll
    return await poll.save();
}

    /**
     * Remove a client from an existing poll
     */
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

    /**
     * Get a poll with client-specific styling applied
     * This is the key method for multi-client polls - it returns a poll with
     * the specific client's style overrides applied
     */
    async getClientSpecificPoll(id: string, clientId: string): Promise<Poll> {
        // First get the base poll
        const poll = await this.findOne(id, clientId);
        
        // If this client has style overrides, apply them
        const clientOverrides = poll.clientStyleOverrides?.get(clientId);
        if (clientOverrides) {
            // Create a plain JavaScript object for modification
            const pollObj = poll.toObject();
            
            // Apply each override to the result object
            for (const [key, value] of Object.entries(clientOverrides)) {
                if (value !== undefined && value !== null) {
                    pollObj[key] = value;
                }
            }
            
            // Return the modified poll with client-specific styles
            return pollObj;
        }
        
        // If no overrides, return the original poll
        return poll;
    }
}