// src/services/client-communication-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ClientMessage, MessageChannel, MessageDirection, MessageStatus, MessagePriority } from '../schemas/client-message.schema';
import { CommunicationTemplate, TemplateType, TemplateScheduleType } from '../schemas/communication-template.schema';
import { TopicClassifier, TopicCategory } from '../schemas/topic-classifier.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentPermissionService } from './agent-permission.service';
import { CronJob } from 'cron';
import { EmailService } from '../services/email.service';

import { render } from 'mustache';
import * as natural from 'natural';

@Injectable()
export class ClientCommunicationAgentService {
  private readonly logger = new Logger(ClientCommunicationAgentService.name);
  private emailTransporter: any;
  private businessCronJobs: Map<string, CronJob[]> = new Map();
  private tokenizer = new natural.WordTokenizer();
  private stemmer = natural.PorterStemmer;

  constructor(
    @InjectModel(ClientMessage.name) private messageModel: Model<ClientMessage>,
    @InjectModel(CommunicationTemplate.name) private templateModel: Model<CommunicationTemplate>,
    @InjectModel(TopicClassifier.name) private classifierModel: Model<TopicClassifier>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly emailService: EmailService
  ) {
    // Initialize scheduled communications
    this.initializeScheduledCommunications();
  }


  /**
   * Initialize scheduled communications for all businesses
   */
  private async initializeScheduledCommunications() {
    try {
      // Get all businesses with client-communication enabled
      const enabledBusinessIds = await this.agentConfigModel.find({
        agentType: 'client-communication',
        isEnabled: true
      }).distinct('businessId');
      
      for (const businessId of enabledBusinessIds) {
        await this.setupBusinessCommunicationSchedules(businessId);
      }
      
      this.logger.log(`Initialized communication schedules for ${enabledBusinessIds.length} businesses`);
    } catch (error) {
      this.logger.error('Failed to initialize scheduled communications', error.stack);
    }
  }

  /**
   * Setup communication schedules for a specific business
   */
  private async setupBusinessCommunicationSchedules(businessId: string) {
    // Clear any existing jobs for this business
    this.clearBusinessJobs(businessId);
    
    // Get all active templates with scheduled type
    const templates = await this.templateModel.find({
      businessId,
      scheduleType: TemplateScheduleType.SCHEDULED,
      isActive: true,
      isDeleted: false
    });
    
    const jobs: CronJob[] = [];
    
    for (const template of templates) {
      if (!template.scheduleConfig) continue;
      
      const { frequency, days, time, timezone } = template.scheduleConfig;
      if (!frequency || !time) continue;
      
      // Parse time (format: HH:MM)
      const [hour, minute] = time.split(':').map(Number);
      
      let cronExpression: string;
      
      switch (frequency) {
        case 'daily':
          cronExpression = `${minute} ${hour} * * *`;
          break;
          
        case 'weekly':
          if (!days || !days.length) continue;
          cronExpression = `${minute} ${hour} * * ${days.join(',')}`;
          break;
          
        case 'monthly':
          const day = days && days.length ? days[0] : 1;
          cronExpression = `${minute} ${hour} ${day} * *`;
          break;
          
        default:
          continue;
      }
      
      const jobName = `comm-template-${template._id}`;
      
      const job = new CronJob(cronExpression, () => {
        this.processScheduledTemplate(template._id.toString());
      }, null, true, timezone || 'UTC');
      
      try {
        this.schedulerRegistry.addCronJob(jobName, job);
        job.start();
        jobs.push(job);
        
        this.logger.log(`Scheduled communication "${template.name}" for business ${businessId} with cron: ${cronExpression}`);
      } catch (error) {
        this.logger.error(`Failed to schedule communication "${template.name}"`, error.stack);
      }
    }
    
    // Store jobs for this business
    this.businessCronJobs.set(businessId, jobs);
    
    return jobs.length;
  }

  /**
   * Clear existing cron jobs for a business
   */
  private clearBusinessJobs(businessId: string) {
    const existingJobs = this.businessCronJobs.get(businessId) || [];
    
    for (const job of existingJobs) {
      job.stop();
    }
    
    this.businessCronJobs.delete(businessId);
  }

  /**
   * Process scheduled template
   */
  private async processScheduledTemplate(templateId: string) {
    try {
      const template = await this.templateModel.findById(templateId);
      
      if (!template || !template.isActive || template.isDeleted) {
        this.logger.warn(`Template ${templateId} is not active or not found`);
        return;
      }
      
      // Check if business has access to client-communication agent
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        template.businessId, 
        'client-communication'
      );
      
      if (!hasAccess) {
        this.logger.warn(`Business ${template.businessId} does not have access to client-communication agent`);
        return;
      }
      
      // Get clients to send the communication to
      // This would need to be customized based on your specific data model
      const clients = await this.userModel.find({
        businessId: template.businessId,
        role: 'client',
        isActive: true,
        isDeleted: false
      });
      
      this.logger.log(`Sending scheduled communication "${template.name}" to ${clients.length} clients`);
      
      // Process each client
      for (const client of clients) {
        await this.sendCommunicationToClient(template, client);
      }
    } catch (error) {
      this.logger.error(`Error processing scheduled template ${templateId}:`, error.stack);
    }
  }

  /**
   * Send communication to a client
   */
  private async sendCommunicationToClient(
    template: CommunicationTemplate,
    client: User,
    customData?: Record<string, any>
  ) {
    try {
      // Prepare the communication content
      const data = {
        client: {
          name: client.name,
          surname: client.surname,
          email: client.email,
        },
        ...(customData || {}) // Merge custom data if provided
      };
      
      const subject = render(template.subject, data);
      const content = render(template.content, data);
      
      // Create message record
      const message = new this.messageModel({
        businessId: template.businessId,
        clientId: client._id,
        channel: template.channels[0] || MessageChannel.EMAIL,
        direction: MessageDirection.OUTBOUND,
        subject,
        content,
        status: MessageStatus.PENDING,
        metadata: {
          templateId: template._id,
          templateName: template.name,
          templateType: template.type
        }
      });
      
      await message.save();
      
      // Send the message based on channel
      switch (message.channel) {
        case MessageChannel.EMAIL:
          await this.sendEmailMessage(message, client);
          break;
        
          
        // Implement other channels as needed
        
        default:
          throw new Error(`Unsupported channel: ${message.channel}`);
      }
      
      // Update message status
      message.status = MessageStatus.SENT;
      message.statusHistory = [
        {
          status: MessageStatus.SENT,
          timestamp: new Date(),
          note: `Sent via ${message.channel}`
        }
      ];
      
      await message.save();
    } catch (error) {
      this.logger.error(`Error sending communication to client ${client._id}:`, error.stack);
      
      // Create failed message record if not already created
      if (!client) return;
      
      const existingMessage = await this.messageModel.findOne({
        businessId: template.businessId,
        clientId: client._id,
        'metadata.templateId': template._id,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
      });
      
      if (!existingMessage) {
        const failedMessage = new this.messageModel({
          businessId: template.businessId,
          clientId: client._id,
          channel: template.channels[0] || MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          subject: template.subject,
          content: 'Failed to send communication',
          status: MessageStatus.FAILED,
          metadata: {
            templateId: template._id,
            templateName: template.name,
            templateType: template.type,
            error: error.message
          },
          statusHistory: [
            {
              status: MessageStatus.FAILED,
              timestamp: new Date(),
              note: error.message
            }
          ]
        });
        
        await failedMessage.save();
      }
    }
  }

  /**
   * Send email message
   */
  private async sendEmailMessage(message: ClientMessage, client: User) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: client.email,
      subject: message.subject,
      html: message.content
    };
    
    await this.emailTransporter.sendMail(mailOptions);
  }


  /**
   * Process new inbound message
   * This would be called by your inbound message handlers (email, SMS, etc.)
   */
  async processInboundMessage(
    messageData: Partial<ClientMessage>
  ): Promise<ClientMessage> {
    try {
      // Ensure required fields
      if (!messageData.businessId || !messageData.clientId || !messageData.content) {
        throw new Error('Missing required message data');
      }
      
      // Check if business has access to client-communication agent
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        messageData.businessId, 
        'client-communication'
      );
      
      if (!hasAccess) {
        throw new Error(`Business ${messageData.businessId} does not have access to client-communication agent`);
      }
      
      // Create message record
      const message = new this.messageModel({
        ...messageData,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        statusHistory: [
          {
            status: MessageStatus.RECEIVED,
            timestamp: new Date(),
            note: `Received via ${messageData.channel}`
          }
        ]
      });
      
      await message.save();
      
      // Process the message (classify, assign, auto-respond, etc.)
      await this.classifyAndAssignMessage(message);
      
      return message;
    } catch (error) {
      this.logger.error('Error processing inbound message:', error.stack);
      throw error;
    }
  }

  /**
   * Classify and assign a message
   */
  private async classifyAndAssignMessage(message: ClientMessage) {
    try {
      // Get classifiers for this business
      const classifiers = await this.classifierModel.find({
        businessId: message.businessId,
        isActive: true
      }).populate('defaultAssignee alternativeAssignees');
      
      if (!classifiers.length) {
        this.logger.warn(`No active classifiers found for business ${message.businessId}`);
        return;
      }
      
      // Tokenize and stem the message content
      const tokens = this.tokenizeAndStemText(message.content.toLowerCase());
      
      // Calculate scores for each category
      const scores = new Map<string, { score: number; classifier: TopicClassifier }>();
      
      for (const classifier of classifiers) {
        let score = 0;
        
        // Check for keywords (stemmed)
        const stemmedKeywords = classifier.keywords.map(keyword => 
          this.stemmer.stem(keyword.toLowerCase())
        );
        
        for (const stemmedKeyword of stemmedKeywords) {
          if (tokens.includes(stemmedKeyword)) {
            score += classifier.weight;
          }
        }
        
        // Check for phrases (exact match)
        if (classifier.phrases && classifier.phrases.length) {
          for (const phrase of classifier.phrases) {
            if (message.content.toLowerCase().includes(phrase.toLowerCase())) {
              score += classifier.weight * 2; // Phrases are weighted higher
            }
          }
        }
        
        if (score > 0) {
          scores.set(classifier.category, { score, classifier });
        }
      }
      
      // Find the highest scoring category
      let highestScore = 0;
      let bestCategory: { score: number; classifier: TopicClassifier } = null;
      
      for (const [category, data] of scores.entries()) {
        if (data.score > highestScore) {
          highestScore = data.score;
          bestCategory = data;
        }
      }
      
      if (bestCategory) {
        // Set message category and assign to default assignee
        const classifier = bestCategory.classifier;
        const assignee = await this.userModel.findById(classifier.defaultAssignee);
        
        // Update message
        message.status = MessageStatus.ASSIGNED;
        message.assignedTo = assignee ? assignee._id.toString() : null;
        message.metadata = {
          ...message.metadata,
          category: classifier.category,
          classificationScore: bestCategory.score
        };
        
        message.statusHistory.push({
          status: MessageStatus.ASSIGNED,
          userId: 'system',
          timestamp: new Date(),
          note: `Automatically assigned to ${assignee ? `${assignee.name} ${assignee.surname}` : 'unassigned'} (Category: ${classifier.category})`
        });
        
        // Set priority based on category
        if (classifier.category === TopicCategory.URGENT) {
          message.priority = MessagePriority.URGENT;
        } else if (classifier.category === TopicCategory.COMPLAINT) {
          message.priority = MessagePriority.HIGH;
        }
        
        await message.save();
        
        // Send notification to assignee if available
        if (assignee) {
          await this.notifyAssigneeOfNewMessage(message, assignee);
        }
        
        // Send auto-response to client if configured
        await this.sendAutoResponse(message, classifier.category);
      } else {
        // No category matched, assign to default handler
        const config = await this.agentConfigModel.findOne({
          businessId: message.businessId,
          agentType: 'client-communication'
        });
        
        const defaultAssigneeId = config?.defaultAssigneeId;
        let assignee = null;
        
        if (defaultAssigneeId) {
          assignee = await this.userModel.findById(defaultAssigneeId);
        }
        
        // Update message
        message.status = MessageStatus.ASSIGNED;
        message.assignedTo = assignee?._id;
        message.metadata = {
          ...message.metadata,
          category: TopicCategory.GENERAL,
          classificationScore: 0
        };
        
        message.statusHistory.push({
          status: MessageStatus.ASSIGNED,
          timestamp: new Date(),
          note: `Automatically assigned to ${assignee ? `${assignee.name} ${assignee.surname}` : 'unassigned'} (Unclassified)`
        });
        
        await message.save();
        
        // Send notification to assignee if available
        if (assignee) {
          await this.notifyAssigneeOfNewMessage(message, assignee);
        }
        
        // Send generic auto-response
        await this.sendAutoResponse(message, TopicCategory.GENERAL);
      }
    } catch (error) {
      this.logger.error(`Error classifying message ${message._id}:`, error.stack);
    }
  }

  /**
   * Tokenize and stem text for classification
   */
  private tokenizeAndStemText(text: string): string[] {
    const tokens = this.tokenizer.tokenize(text) || [];
    return tokens.map(token => this.stemmer.stem(token));
  }

  /**
   * Notify assignee of new message
   */
  private async notifyAssigneeOfNewMessage(message: ClientMessage, assignee: User) {
    // This would send a notification to the assignee
    // Implementation depends on your notification system
    this.logger.log(`Notification would be sent to ${assignee.email} about new message ${message._id}`);
    
    // Example email notification
    const client = await this.userModel.findById(message.clientId);
    
    if (!client) {
      this.logger.warn(`Client ${message.clientId} not found for message ${message._id}`);
      return;
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: assignee.email,
      subject: `New message assigned: ${message.subject}`,
      html: `
        <h1>New Message Assigned</h1>
        <p><strong>From:</strong> ${client.name} ${client.surname}</p>
        <p><strong>Subject:</strong> ${message.subject}</p>
        <p><strong>Received:</strong> ${message.createdAt.toLocaleString()}</p>
        <p><strong>Priority:</strong> ${message.priority}</p>
        <p><strong>Category:</strong> ${message.metadata?.category || 'Unclassified'}</p>
        <hr>
        <p>${message.content}</p>
        <hr>
        <p>Please respond to this message at your earliest convenience.</p>
      `
    };
    
    try {
      await this.emailTransporter.sendMail(mailOptions);
    } catch (error) {
      this.logger.error(`Error sending notification to assignee ${assignee._id}:`, error.stack);
    }
  }

  /**
   * Send auto-response to client
   */
  private async sendAutoResponse(message: ClientMessage, category: TopicCategory) {
    try {
      // Check if auto-responses are enabled for this business
      const config = await this.agentConfigModel.findOne({
        businessId: message.businessId,
        agentType: 'client-communication'
      });
      
      if (!config || !config.autoResponseEnabled) {
        return;
      }
      
      // Find appropriate auto-response template
      const template = await this.templateModel.findOne({
        businessId: message.businessId,
        type: TemplateType.AUTO_TRIGGER,
        isActive: true,
        isDeleted: false,
        'triggerConditions.category': category
      });
      
      if (!template) {
        // Fall back to default template
        const defaultTemplate = await this.templateModel.findOne({
          businessId: message.businessId,
          type: TemplateType.AUTO_TRIGGER,
          isActive: true,
          isDeleted: false,
          'triggerConditions.isDefault': true
        });
        
        if (!defaultTemplate) {
          return;
        }
        
        await this.sendAutoResponseWithTemplate(message, defaultTemplate);
      } else {
        await this.sendAutoResponseWithTemplate(message, template);
      }
    } catch (error) {
      this.logger.error(`Error sending auto-response for message ${message._id}:`, error.stack);
    }
  }

  // src/services/client-communication-agent.service.ts (continued)
  /**
   * Send auto-response using a template
   */
  private async sendAutoResponseWithTemplate(
    inboundMessage: ClientMessage,
    template: CommunicationTemplate
  ) {
    try {
      const client = await this.userModel.findById(inboundMessage.clientId);
      
      if (!client) {
        this.logger.warn(`Client ${inboundMessage.clientId} not found for message ${inboundMessage._id}`);
        return;
      }
      
      // Prepare data for template rendering
      const data = {
        client: {
          name: client.name,
          surname: client.surname,
          email: client.email,
          // Add other client data as needed
        },
        message: {
          subject: inboundMessage.subject,
          category: inboundMessage.metadata?.category,
          // Add other message data as needed
        },
        // Add other data as needed
      };
      
      // Render template
      const subject = render(template.subject, data);
      const content = render(template.content, data);
      
      // Create auto-response message
      const responseMessage = new this.messageModel({
        businessId: inboundMessage.businessId,
        clientId: inboundMessage.clientId,
        channel: inboundMessage.channel,
        direction: MessageDirection.OUTBOUND,
        subject,
        content,
        status: MessageStatus.PENDING,
        parentMessageId: inboundMessage._id,
        metadata: {
          templateId: template._id,
          templateName: template.name,
          templateType: template.type,
          isAutoResponse: true
        }
      });
      
      await responseMessage.save();
      
      // Send the response based on channel
      switch (responseMessage.channel) {
        case MessageChannel.EMAIL:
          await this.sendEmailMessage(responseMessage, client);
          break;
          
        // Implement other channels as needed
        
        default:
          throw new Error(`Unsupported channel: ${responseMessage.channel}`);
      }
      
      // Update response message status
      responseMessage.status = MessageStatus.SENT;
      responseMessage.statusHistory = [
        {
          status: MessageStatus.SENT,
          timestamp: new Date(),
          note: `Auto-response sent via ${responseMessage.channel}`
        }
      ];
      
      await responseMessage.save();
      
      // Update original message to reflect auto-response was sent
      inboundMessage.metadata = {
        ...inboundMessage.metadata,
        autoResponseSent: true,
        autoResponseId: responseMessage._id
      };
      
      await inboundMessage.save();
    } catch (error) {
      this.logger.error(`Error sending auto-response with template:`, error.stack);
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    userId: string,
    note?: string
  ): Promise<ClientMessage> {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    // Update message status
    message.status = status;
    
    // Add status history entry
    message.statusHistory = message.statusHistory || [];
    message.statusHistory.push({
      status,
      timestamp: new Date(),
      userId,
      note: note || `Status updated to ${status}`
    });
    
    // Handle special status updates
    if (status === MessageStatus.RESOLVED) {
      message.resolvedBy = userId;
      message.resolvedAt = new Date();
    } else if (status === MessageStatus.ASSIGNED) {
      message.assignedTo = userId;
    }
    
    await message.save();
    return message;
  }

  /**
   * Reassign message to another user
   */
  async reassignMessage(
    messageId: string,
    newAssigneeId: string,
    userId: string,
    note?: string
  ): Promise<ClientMessage> {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    const newAssignee = await this.userModel.findById(newAssigneeId);
    
    if (!newAssignee) {
      throw new Error(`User ${newAssigneeId} not found`);
    }
    
    // Update message assignee
    message.assignedTo = newAssigneeId;
    
    // If not already assigned, update status
    if (message.status !== MessageStatus.ASSIGNED) {
      message.status = MessageStatus.ASSIGNED;
    }
    
    // Add status history entry
    message.statusHistory = message.statusHistory || [];
    message.statusHistory.push({
      status: message.status,
      timestamp: new Date(),
      userId,
      note: note || `Reassigned to ${newAssignee.name} ${newAssignee.surname}`
    });
    
    await message.save();
    
    // Notify new assignee
    await this.notifyAssigneeOfNewMessage(message, newAssignee);
    
    return message;
  }

  /**
   * Send reply to a message
   */
  async sendReplyToMessage(
    parentMessageId: string,
    content: string,
    userId: string
  ): Promise<ClientMessage> {
    const parentMessage = await this.messageModel.findById(parentMessageId);
    
    if (!parentMessage) {
      throw new Error(`Message ${parentMessageId} not found`);
    }
    
    const client = await this.userModel.findById(parentMessage.clientId);
    
    if (!client) {
      throw new Error(`Client ${parentMessage.clientId} not found`);
    }
    
    // Create reply message
    const replyMessage = new this.messageModel({
      businessId: parentMessage.businessId,
      clientId: parentMessage.clientId,
      channel: parentMessage.channel,
      direction: MessageDirection.OUTBOUND,
      subject: `Re: ${parentMessage.subject}`,
      content,
      status: MessageStatus.PENDING,
      parentMessageId: parentMessage._id,
      metadata: {
        inReplyTo: parentMessage._id,
        respondedBy: userId
      }
    });
    
    await replyMessage.save();
    
    // Send the reply based on channel
    try {
      switch (replyMessage.channel) {
        case MessageChannel.EMAIL:
          await this.sendEmailMessage(replyMessage, client);
          break;
          
        // Implement other channels as needed
        
        default:
          throw new Error(`Unsupported channel: ${replyMessage.channel}`);
      }
      
      // Update reply message status
      replyMessage.status = MessageStatus.SENT;
      replyMessage.statusHistory = [
        {
          status: MessageStatus.SENT,
          timestamp: new Date(),
          userId,
          note: `Reply sent via ${replyMessage.channel}`
        }
      ];
      
      await replyMessage.save();
      
      // Update original message to reflect reply was sent
      if (parentMessage.status !== MessageStatus.RESOLVED) {
        parentMessage.status = MessageStatus.IN_PROGRESS;
        
        parentMessage.statusHistory = parentMessage.statusHistory || [];
        parentMessage.statusHistory.push({
          status: MessageStatus.IN_PROGRESS,
          timestamp: new Date(),
          userId,
          note: 'Reply sent to client'
        });
        
        await parentMessage.save();
      }
      
      return replyMessage;
    } catch (error) {
      // Update reply message status to failed
      replyMessage.status = MessageStatus.FAILED;
      replyMessage.statusHistory = [
        {
          status: MessageStatus.FAILED,
          timestamp: new Date(),
          userId,
          note: `Failed to send reply: ${error.message}`
        }
      ];
      
      await replyMessage.save();
      
      throw error;
    }
  }

  /**
   * Get messages for a business with optional filters
   */
  async getBusinessMessages(
    businessId: string,
    filters: {
      status?: MessageStatus | MessageStatus[],
      direction?: MessageDirection,
      clientId?: string,
      assignedTo?: string,
      priority?: MessagePriority,
      channel?: MessageChannel,
      startDate?: Date,
      endDate?: Date
    } = {}
  ): Promise<ClientMessage[]> {
    const query: any = {
      businessId,
      isDeleted: false
    };
    
    // Add optional filters
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query.status = { $in: filters.status };
      } else {
        query.status = filters.status;
      }
    }
    
    if (filters.direction) query.direction = filters.direction;
    if (filters.clientId) query.clientId = filters.clientId;
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;
    if (filters.priority) query.priority = filters.priority;
    if (filters.channel) query.channel = filters.channel;
    
    // Date range filters
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }
    
    return this.messageModel.find(query)
      .populate('clientId', 'name surname email')
      .populate('assignedTo', 'name surname email')
      .sort({ createdAt: -1 });
  }

  /**
   * Get message thread (parent and children)
   */
  async getMessageThread(messageId: string): Promise<ClientMessage[]> {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    // Get the root message (if current message is a reply)
    const rootMessageId = message.parentMessageId || message._id;
    
    // Get all messages in the thread
    return this.messageModel.find({
      $or: [
        { _id: rootMessageId },
        { parentMessageId: rootMessageId }
      ]
    })
    .populate('clientId', 'name surname email')
    .populate('assignedTo', 'name surname email')
    .populate('resolvedBy', 'name surname email')
    .sort({ createdAt: 1 });
  }

  /**
   * Create a topic classifier
   */
  async createTopicClassifier(
    classifierData: Partial<TopicClassifier>
  ): Promise<TopicClassifier> {
    const classifier = new this.classifierModel(classifierData);
    return classifier.save();
  }

  /**
   * Update a topic classifier
   */
  async updateTopicClassifier(
    classifierId: string,
    classifierData: Partial<TopicClassifier>
  ): Promise<TopicClassifier> {
    return this.classifierModel.findByIdAndUpdate(
      classifierId,
      classifierData,
      { new: true }
    );
  }

  /**
   * Get topic classifiers for a business
   */
  async getBusinessClassifiers(
    businessId: string,
    includeInactive: boolean = false
  ): Promise<TopicClassifier[]> {
    const query: any = {
      businessId
    };
    
    if (!includeInactive) {
      query.isActive = true;
    }
    
    return this.classifierModel.find(query)
      .populate('defaultAssignee', 'name surname email')
      .sort({ category: 1 });
  }

  /**
   * Create a communication template
   */
  async createCommunicationTemplate(
    templateData: Partial<CommunicationTemplate>
  ): Promise<CommunicationTemplate> {
    const template = new this.templateModel(templateData);
    const savedTemplate = await template.save();
    
    // If this is a scheduled template, update the schedule
    if (savedTemplate.scheduleType === TemplateScheduleType.SCHEDULED && savedTemplate.isActive) {
      await this.setupBusinessCommunicationSchedules(savedTemplate.businessId);
    }
    
    return savedTemplate;
  }

  /**
   * Update a communication template
   */
  async updateCommunicationTemplate(
    templateId: string,
    templateData: Partial<CommunicationTemplate>
  ): Promise<CommunicationTemplate> {
    const updatedTemplate = await this.templateModel.findByIdAndUpdate(
      templateId,
      templateData,
      { new: true }
    );
    
    // If this is a scheduled template, update the schedule
    if (updatedTemplate.scheduleType === TemplateScheduleType.SCHEDULED || 
        templateData.scheduleType === TemplateScheduleType.SCHEDULED) {
      await this.setupBusinessCommunicationSchedules(updatedTemplate.businessId);
    }
    
    return updatedTemplate;
  }

  /**
   * Get communication templates for a business
   */
  async getBusinessTemplates(
    businessId: string,
    includeInactive: boolean = false
  ): Promise<CommunicationTemplate[]> {
    const query: any = {
      businessId,
      isDeleted: false
    };
    
    if (!includeInactive) {
      query.isActive = true;
    }
    
    return this.templateModel.find(query).sort({ name: 1 });
  }

  /**
   * Delete a template (soft delete)
   */
  async deleteTemplate(templateId: string): Promise<CommunicationTemplate> {
    const template = await this.templateModel.findById(templateId);
    
    if (!template) {
      throw new Error('Template not found');
    }
    
    // Soft delete
    template.isDeleted = true;
    template.isActive = false;
    await template.save();
    
    // If this was a scheduled template, update the schedules
    if (template.scheduleType === TemplateScheduleType.SCHEDULED) {
      await this.setupBusinessCommunicationSchedules(template.businessId);
    }
    
    return template;
  }

  /**
   * Send communication using a template
   */
  async sendCommunicationUsingTemplate(
    templateId: string,
    clientIds: string[],
    customData?: Record<string, any>
  ): Promise<{ sent: number; failed: number; messages: string[] }> {
    const template = await this.templateModel.findById(templateId);
    
    if (!template || template.isDeleted) {
      throw new Error('Template not found');
    }
    
    if (!template.isActive) {
      throw new Error('Template is not active');
    }
    
    // Check if business has access to client-communication agent
    const hasAccess = await this.agentPermissionService.hasAgentAccess(
      template.businessId, 
      'client-communication'
    );
    
    if (!hasAccess) {
      throw new Error(`Business ${template.businessId} does not have access to client-communication agent`);
    }
    
    let sent = 0;
    let failed = 0;
    const messages: string[] = [];
    
    // Process each client
    for (const clientId of clientIds) {
      try {
        const client = await this.userModel.findOne({
          _id: clientId,
          businessId: template.businessId,
          isActive: true,
          isDeleted: false
        });
        
        if (!client) {
          throw new Error(`Client ${clientId} not found or not active`);
        }
        
        // Prepare data for template rendering
        const data = {
          client: {
            name: client.name,
            surname: client.surname,
            email: client.email,
            // Add other client data as needed
          },
          ...customData
        };
        
        // Render template
        const subject = render(template.subject, data);
        const content = render(template.content, data);
        
        // Create message record
        const message = new this.messageModel({
          businessId: template.businessId,
          clientId: client._id,
          channel: template.channels[0] || MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          subject,
          content,
          status: MessageStatus.PENDING,
          metadata: {
            templateId: template._id,
            templateName: template.name,
            templateType: template.type,
            manualSend: true
          }
        });
        
        await message.save();
        
        // Send the message
        switch (message.channel) {
          case MessageChannel.EMAIL:
            await this.sendEmailMessage(message, client);
            break;
            
          // Implement other channels as needed
          
          default:
            throw new Error(`Unsupported channel: ${message.channel}`);
        }
        
        // Update message status
        message.status = MessageStatus.SENT;
        message.statusHistory = [
          {
            status: MessageStatus.SENT,
            timestamp: new Date(),
            note: `Sent via ${message.channel}`
          }
        ];
        
        await message.save();
        
        sent++;
        messages.push(message._id.toString());
      } catch (error) {
        this.logger.error(`Error sending to client ${clientId}:`, error.message);
        failed++;
      }
    }
    
    return { sent, failed, messages };
  }

  /**
   * Process scheduled updates for client communications
   * This would be used to send periodic updates on project status, etc.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async processScheduledUpdates() {
    try {
      // Get all businesses with client-communication enabled
      const enabledBusinessIds = await this.agentConfigModel.find({
        agentType: 'client-communication',
        isEnabled: true,
        'scheduledUpdatesEnabled': true
      }).distinct('businessId');
      
      for (const businessId of enabledBusinessIds) {
        await this.processBusinessScheduledUpdates(businessId);
      }
    } catch (error) {
      this.logger.error('Error processing scheduled updates:', error.stack);
    }
  }

  /**
   * Process scheduled updates for a specific business
   */
  private async processBusinessScheduledUpdates(businessId: string) {
    // Implementation would depend on your business data model
    // This is a placeholder for the concept
    this.logger.log(`Processing scheduled updates for business ${businessId}`);
    
    // Example: Find clients who need project status updates
    const clientsNeedingUpdates = await this.userModel.find({
      businessId,
      role: 'client',
      isActive: true,
      isDeleted: false,
      // Additional filters to find clients needing updates
    });
    
    // Find appropriate template
    const template = await this.templateModel.findOne({
      businessId,
      type: TemplateType.UPDATE,
      isActive: true,
      isDeleted: false
    });
    
    if (!template || clientsNeedingUpdates.length === 0) {
      return;
    }
    
    // Send updates to each client
    for (const client of clientsNeedingUpdates) {
      try {
        // Get project data for this client
        // This would be customized based on your data model
        const projectData = await this.getClientProjectData(client._id.toString());
        
        if (!projectData) continue;
        
        // Send update
        await this.sendCommunicationToClient(template, client, projectData);
      } catch (error) {
        this.logger.error(`Error sending update to client ${client._id}:`, error.message);
      }
    }
  }

  /**
   * Get project data for a client
   * This would be customized based on your data model
   */
  private async getClientProjectData(clientId: string): Promise<any> {
    // This is a placeholder implementation
    // You would implement this based on your project data structure
    return {
      // Example project data
      projectName: 'Example Project',
      status: 'In Progress',
      completion: '75%',
      nextMilestone: 'Final Review',
      nextMilestoneDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    };
  }

  /**
   * Update business communication configuration
   */
  async updateBusinessConfiguration(
    businessId: string,
    config: Partial<AgentConfiguration>
  ): Promise<AgentConfiguration> {
    const existingConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'client-communication'
    });
    
    if (existingConfig) {
      // Update existing configuration
      Object.assign(existingConfig, config);
      return existingConfig.save();
    } else {
      // Create new configuration
      const newConfig = new this.agentConfigModel({
        businessId,
        agentType: 'client-communication',
        isEnabled: true,
        ...config
      });
      
      return newConfig.save();
    }
  }

  /**
   * Get business communication configuration
   */
  async getBusinessConfiguration(
    businessId: string
  ): Promise<AgentConfiguration> {
    return this.agentConfigModel.findOne({
      businessId,
      agentType: 'client-communication'
    });
  }
}