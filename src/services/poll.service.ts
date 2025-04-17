// src/services/poll.service.ts
import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Poll } from '../schemas/poll.schema';
import { 
    CreatePollDto, 
    UpdatePollDto, 
    PollVoteDto, 
    ListPollsQueryDto 
} from '../dtos/poll.dto';

@Injectable()
export class PollService {
    constructor(
        @InjectModel(Poll.name) private readonly pollModel: Model<Poll>,
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
        
        // Create the poll with all style customization fields
        const newPoll = new this.pollModel(createPollDto);
        return await newPoll.save();
    }

    async findAll(clientId: string, query: ListPollsQueryDto) {
        const { 
            search, 
            page = 1, 
            limit = 10, 
            sortBy = 'createdAt', 
            sortOrder = 'desc'
        } = query;

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

    async findOne(id: string, clientId: string): Promise<Poll> {
        const poll = await this.pollModel.findOne({ 
            _id: id,
            clientId 
        }).exec();

        if (!poll) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }

        return poll;
    }

    async findByWordpressId(wordpressId: number, clientId: string): Promise<Poll> {
        const poll = await this.pollModel.findOne({ 
            wordpressId,
            clientId 
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
            clientId
        }).exec();

        if (!existingPoll) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
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

        // Update the poll with all style customization fields
        return await this.pollModel.findByIdAndUpdate(
            id,
            updatePollDto,
            { new: true }
        ).exec();
    }

    async delete(id: string, clientId: string): Promise<void> {
        const result = await this.pollModel.deleteOne({
            _id: id,
            clientId
        }).exec();

        if (result.deletedCount === 0) {
            throw new NotFoundException(`Poll with ID ${id} not found`);
        }
    }

    async vote(id: string, clientId: string, voteDto: PollVoteDto): Promise<Poll> {
        const poll = await this.pollModel.findOne({
            _id: id,
            clientId
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
        // Get total polls
        const totalPolls = await this.pollModel.countDocuments({ clientId }).exec();
        
        // Get total votes across all polls
        const polls = await this.pollModel.find({ clientId }).exec();
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
                    votes: pollVotes
                };
            }
        }
        
        // Get latest polls
        const latestPolls = await this.pollModel
            .find({ clientId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('title createdAt')
            .exec();
            
        return {
            totalPolls,
            totalVotes,
            mostPopularPoll,
            latestPolls
        };
    }
}