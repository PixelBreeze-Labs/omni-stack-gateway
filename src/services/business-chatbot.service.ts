// src/services/business-chatbot.service.ts
import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotMessage } from '../schemas/chatbot-message.schema';
import { v4 as uuidv4 } from 'uuid';
import { BusinessService } from './business.service';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { KnowledgeBaseService } from './knowledge-base.service';

// Export interfaces for TypeScript
export interface ChatResponse {
  text: string;
  suggestions?: { id: string; text: string }[];
  sessionId?: string;
  success: boolean;
}

export interface HistoryResponse {
  messages: ChatbotMessage[];
  total: number;
  page: number;
  limit: number;
  success: boolean;
}

export interface ClearHistoryResponse {
  success: boolean;
  deletedCount: number;
}

export interface SessionsResponse {
  sessions: any[];
  total: number;
  page: number;
  limit: number;
  success: boolean;
}

@Injectable()
export class BusinessChatbotService {
  private readonly logger = new Logger(BusinessChatbotService.name);

  constructor(
    @InjectModel(ChatbotMessage.name) private chatbotMessageModel: Model<ChatbotMessage>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly businessService: BusinessService,  
    private readonly knowledgeBaseService: KnowledgeBaseService
  ) {}

   /**
   * Process a message and return a response
   */
   async processMessage(
    businessId: string,
    clientId: string,
    userId: string | null,
    message: string,
    sessionId: string = null,
    context: Record<string, any> = {}
  ): Promise<ChatResponse> {
    try {
      // Create or use session ID
      if (!sessionId) {
        sessionId = uuidv4();
      }

      // Get previous messages for context if sessionId exists
      let previousMessages = [];
      if (sessionId) {
        previousMessages = await this.chatbotMessageModel
          .find({ businessId, clientId, sessionId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
      }
      
      // Add to context
      context.conversationHistory = previousMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender
      })).reverse();

      // Store user message
      const userMessage = new this.chatbotMessageModel({
        businessId,
        clientId,
        userId,
        sender: 'user',
        content: message,
        sessionId,
        metadata: {
          context,
          timestamp: new Date()
        }
      });
      await userMessage.save();

      // Get business data for context-aware responses
      const business = await this.businessModel.findById(businessId).lean();
      
      // Get user data if available
      let user = null;
      if (userId) {
        user = await this.userModel.findById(userId).lean();
      }

      // Generate response based on message content and business context
      const response = await this.generateResponse(message, context, business, user);

      // Store bot response
      const botMessage = new this.chatbotMessageModel({
        businessId,
        clientId,
        userId,
        sender: 'bot',
        content: response.text,
        suggestions: response.suggestions || [],
        sessionId,
        metadata: {
          context,
          knowledgeUsed: response.knowledgeUsed || false,
          responseSource: response.responseSource || 'nlp',
          timestamp: new Date()
        }
      });
      await botMessage.save();

      return {
        ...response,
        sessionId,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      return {
        text: "I'm sorry, I encountered an error while processing your request. Please try again.",
        sessionId,
        success: false
      };
    }
  }


  /**
   * Get conversation history for a business user
   */
  async getConversationHistory(
    businessId: string,
    clientId: string,
    userId: string = null,
    sessionId: string = null,
    limit: number = 20,
    page: number = 1
  ): Promise<HistoryResponse> {
    try {
      const query: any = { businessId, clientId };
      
      if (sessionId) {
        query.sessionId = sessionId;
      }
      
      if (userId) {
        query.userId = userId;
      }
      
      const total = await this.chatbotMessageModel.countDocuments(query);
      const skip = (page - 1) * limit;
      
      const messages = await this.chatbotMessageModel
        .find(query)
        .sort({ createdAt: 1 }) // Chronological order
        .skip(skip)
        .limit(limit)
        .exec();
      
      return {
        messages,
        total,
        page,
        limit,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting conversation history: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Clear chat history for a session
   */
  async clearChatHistory(
    businessId: string,
    clientId: string,
    sessionId: string
  ): Promise<ClearHistoryResponse> {
    try {
      const result = await this.chatbotMessageModel.deleteMany({ 
        businessId, 
        clientId, 
        sessionId 
      });
      
      return { 
        success: true, 
        deletedCount: result.deletedCount 
      };
    } catch (error) {
      this.logger.error(`Error clearing chat history: ${error.message}`, error.stack);
      return { success: false, deletedCount: 0 };
    }
  }

  /**
   * Get active sessions for a business
   */
  async getActiveSessions(
    businessId: string,
    clientId: string,
    limit: number = 20,
    page: number = 1
  ): Promise<SessionsResponse> {
    try {
      const skip = (page - 1) * limit;
      
      // Aggregate to get unique sessions with their last message time
      const sessions = await this.chatbotMessageModel.aggregate([
        { $match: { businessId: businessId, clientId: clientId } },
        { $sort: { createdAt: -1 } },
        { $group: {
            _id: "$sessionId",
            lastMessage: { $first: "$content" },
            lastMessageTime: { $first: "$createdAt" },
            userId: { $first: "$userId" },
            messageCount: { $sum: 1 }
          }
        },
        { $sort: { lastMessageTime: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);
      
      // Get total count of unique sessions
      const totalAgg = await this.chatbotMessageModel.aggregate([
        { $match: { businessId: businessId, clientId: clientId } },
        { $group: { _id: "$sessionId" } },
        { $count: "total" }
      ]);
      
      const total = totalAgg.length > 0 ? totalAgg[0].total : 0;
      
      // Populate user info for each session
      const sessionData = await Promise.all(
        sessions.map(async (session) => {
          let userInfo = null;
          if (session.userId) {
            try {
              const user = await this.userModel.findById(session.userId).lean();
              if (user) {
                userInfo = {
                  id: user._id,
                  name: user.name || 'Unknown',
                  email: user.email || 'Unknown'
                };
              }
            } catch (err) {
              this.logger.error(`Error fetching user info: ${err.message}`);
            }
          }
          
          return {
            sessionId: session._id,
            lastMessage: session.lastMessage,
            lastMessageTime: session.lastMessageTime,
            messageCount: session.messageCount,
            user: userInfo
          };
        })
      );
      
      return {
        sessions: sessionData,
        total,
        page,
        limit,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting active sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate business API key
   */
  async validateBusinessApiKey(businessId: string, apiKey: string): Promise<Business> {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }
    
    return business;
  }

  /**
 * Modified generateResponse function in BusinessChatbotService
 * to pass clientId to the knowledge base service
 */
private async generateResponse(
  message: string, 
  context: Record<string, any>,
  business: any,
  user: any
): Promise<{ 
  text: string; 
  suggestions?: { id: string; text: string }[];
  knowledgeUsed?: boolean;
  responseSource?: string;
  metadata?: {
    sourceId?: string;
    knowledgeUsed?: boolean;
    responseSource?: string;
    shouldShowFeedback?: boolean;
    conversationalResponse?: boolean;
    [key: string]: any;
  };
}> {
  const normalizedMessage = message.toLowerCase().trim();
  const platformName = 'Staffluent';
  
  // Personalization variables
  const businessName = business?.name || 'your business';
  const userName = user ? `${user.name || 'there'}` : 'there';
  
  // Extract key terms for better matching
  const keyTerms = this.extractKeyTerms(normalizedMessage);
  
  // Check if this is a follow-up question
  const isFollowup = this.isFollowupQuestion(context);
  
  // Determine if this is a casual conversational query
  const isConversational = this.isConversationalQuery(normalizedMessage);
  
  // Determine if we should show feedback for this message
  const FEEDBACK_FREQUENCY = 5; // Show feedback every 5 messages
  
  // Get message count from context
  const messageCount = context?.sessionData?.messageCount || 0;
  
  // Determine if we should show feedback for this response
  let shouldShowFeedback = (messageCount % FEEDBACK_FREQUENCY === 0);
  
  // IMPORTANT: Get the clientId from the business object
  const clientId = business?.clientId;
  
  // Handle casual conversation first
  if (isConversational) {
    const conversationResponse = this.getConversationalResponse(
      normalizedMessage,
      userName,
      businessName,
      platformName
    );
    
    if (conversationResponse) {
      return {
        text: conversationResponse.text,
        suggestions: conversationResponse.suggestions,
        responseSource: 'conversation',
        knowledgeUsed: false,
        metadata: {
          conversationalResponse: true,
          responseSource: 'conversation',
          knowledgeUsed: false,
          shouldShowFeedback: false
        }
      };
    }
  }
  
  // 1. Try to find a matching query-response pair from our learning database
  const matchingPairs = await this.knowledgeBaseService.searchQueryResponses(
    normalizedMessage,
    { 
      category: context.currentView || 'general',
      limit: 1,
      clientId
    }
  );
  
  if (matchingPairs.length > 0) {
    const pair = matchingPairs[0];
    // Always show feedback for knowledge-based responses
    shouldShowFeedback = true;
    
    // Replace placeholders in the response
    let response = pair.response
      .replace(/{businessName}/g, businessName)
      .replace(/{userName}/g, userName)
      .replace(/{platformName}/g, platformName);
    
    return {
      text: response,
      responseSource: 'learned',
      knowledgeUsed: true,
      metadata: {
        sourceId: pair._id.toString(),
        knowledgeUsed: true,
        responseSource: 'learned',
        shouldShowFeedback
      }
    };
  }
  
  // 2. Try to find relevant knowledge documents
  const relevantDocs = await this.knowledgeBaseService.searchDocuments(
    normalizedMessage,
    {
      clientId, // Pass clientId to filter results
      businessType: business?.operationType || 'default',
      features: business?.includedFeatures || [],
      currentView: context.currentView,
      limit: 2
    }
  );
  
  if (relevantDocs.length > 0) {
    // Always show feedback for knowledge-based responses
    shouldShowFeedback = true;
    
    // Use the most relevant document
    const doc = relevantDocs[0];
    
    // Process content to create a conversational response
    let response = this.formatKnowledgeResponse(
      doc.content, 
      businessName,
      userName,
      platformName
    );
    
    return {
      text: response,
      suggestions: this.getSuggestionsFromDocument(doc),
      responseSource: 'knowledge',
      knowledgeUsed: true,
      metadata: {
        sourceId: doc._id.toString(),
        knowledgeUsed: true,
        responseSource: 'knowledge',
        shouldShowFeedback,
        documentTitle: doc.title || null,
        documentCategories: doc.categories || []
      }
    };
  }
  
  // 3. Fall back to predefined NLP responses
  const nlpResponse = await this.getNlpResponse(
    normalizedMessage,
    keyTerms, 
    isFollowup,
    context, 
    business, 
    businessName,
    userName,
    platformName
  );
  
  // For conversational or high-confidence responses, show feedback more often
  if (nlpResponse.confidence > 0.7 || normalizedMessage.length < 20) {
    shouldShowFeedback = true;
  }
  
  // 4. If no good NLP response, log this as an unrecognized query
  if (nlpResponse.confidence < 0.3) {
    const unrecognizedQuery = await this.knowledgeBaseService.logUnrecognizedQuery(
      message,
      {
        clientId, // Pass clientId to associate with the client
        businessId: business?._id?.toString(), // Also pass businessId as a fallback
        businessType: business?.operationType || 'default',
        userId: user?._id?.toString(),
        sessionId: context.sessionId,
        context
      }
    );
    
    // Always show feedback for unrecognized queries to help improve
    shouldShowFeedback = true;
    
    return {
      ...nlpResponse,
      responseSource: 'nlp',
      knowledgeUsed: false,
      metadata: {
        sourceId: unrecognizedQuery._id.toString(),
        responseSource: 'nlp',
        knowledgeUsed: false,
        confidence: nlpResponse.confidence,
        unrecognized: true,
        shouldShowFeedback
      }
    };
  }
  
  return {
    ...nlpResponse,
    responseSource: 'nlp',
    knowledgeUsed: false,
    metadata: {
      responseSource: 'nlp',
      knowledgeUsed: false,
      confidence: nlpResponse.confidence,
      shouldShowFeedback
    }
  };
}


  /**
 * Get response using the NLP system
 * Enhanced with better response categories and prioritization
 */
private async getNlpResponse(
  normalizedMessage: string,
  keyTerms: string[],
  isFollowup: boolean,
  context: Record<string, any>,
  business: any,
  businessName: string,
  userName: string,
  platformName: string
): Promise<{ 
  text: string; 
  suggestions?: { id: string; text: string }[];
  confidence: number;
}> {
  // Enhanced response templates with better categorization and variations
  const responseCategories = {
    // Greeting responses
    greeting: [
      {
        keywords: ['hello', 'hi', 'hey', 'greetings', 'howdy'],
        response: {
          text: `Hello ${userName}! I'm the ${platformName} assistant for ${businessName}. How can I help you today?`,
          suggestions: [
            { id: 'projects', text: 'Tell me about projects' },
            { id: 'tasks', text: 'Task management' },
            { id: 'timeTracking', text: 'Time tracking help' },
            { id: 'teams', text: 'Team management' }
          ]
        }
      }
    ],
    
    // Project management responses
    projects: [
      {
        keywords: ['project', 'projects', 'project management'],
        response: {
          text: `${platformName} provides ${businessName} with comprehensive project management tools. You can create projects, assign teams, track progress, and manage tasks.`,
          suggestions: [
            { id: 'create_project', text: 'Create a new project' },
            { id: 'view_projects', text: 'View my projects' },
            { id: 'project_reports', text: 'Project reports' }
          ]
        }
      },
      {
        keywords: ['create project', 'new project', 'add project', 'start project'],
        response: {
          text: `Creating a new project in ${platformName} is easy. Just go to the Projects section, click "Create Project", and fill in the details like name, description, start/end dates, and team members.`,
          suggestions: [
            { id: 'project_template', text: 'Use a project template' },
            { id: 'project_settings', text: 'Project settings' },
            { id: 'project_team', text: 'Assign team members' }
          ]
        }
      }
    ],
    
    // Task management responses
    tasks: [
      {
        keywords: ['task', 'tasks', 'todo', 'assignment', 'assign'],
        response: {
          text: `With ${platformName}, tasks for ${businessName} can be created, assigned, prioritized, and tracked to completion.`,
          suggestions: [
            { id: 'create_task', text: 'Create a task' },
            { id: 'assign_task', text: 'Assign tasks' },
            { id: 'track_tasks', text: 'Track task completion' }
          ]
        }
      },
      {
        keywords: ['create task', 'new task', 'add task', 'assign task'],
        response: {
          text: `To create a new task in ${platformName}, navigate to the Tasks section or a specific project, click "New Task", and enter details like name, description, due date, priority, and assignee.`,
          suggestions: [
            { id: 'task_priority', text: 'Set task priority' },
            { id: 'recurring_tasks', text: 'Create recurring tasks' },
            { id: 'task_dependencies', text: 'Set task dependencies' }
          ]
        }
      }
    ],
    
    // Time tracking responses
    timeTracking: [
      {
        keywords: ['time', 'clock', 'hours', 'timesheet', 'tracking', 'attendance'],
        response: {
          text: `${platformName}'s time tracking system lets ${businessName} employees clock in/out, manage breaks, and review timesheets.`,
          suggestions: [
            { id: 'time_clock', text: 'Clock in/out' },
            { id: 'breaks', text: 'Manage breaks' },
            { id: 'timesheets', text: 'View timesheets' }
          ]
        }
      },
      {
        keywords: ['clock in', 'clock out', 'time entry', 'log hours', 'record time'],
        response: {
          text: `With ${platformName}, you can easily clock in and out using the web app or mobile app. Your time entries are automatically logged and can be associated with specific projects or tasks.`,
          suggestions: [
            { id: 'timesheet_approval', text: 'Timesheet approval' },
            { id: 'time_reports', text: 'Time reports' },
            { id: 'overtime_tracking', text: 'Overtime tracking' }
          ]
        }
      }
    ],
    
    // Team management responses
    teams: [
      {
        keywords: ['team', 'staff', 'employee', 'member', 'personnel'],
        response: {
          text: `Using ${platformName}, ${businessName} can organize staff into departments and teams, assign leaders, and monitor performance.`,
          suggestions: [
            { id: 'view_team', text: 'View my team' },
            { id: 'add_member', text: 'Add team member' },
            { id: 'team_schedule', text: 'Team scheduling' }
          ]
        }
      },
      {
        keywords: ['add employee', 'new member', 'hire', 'add to team', 'invite team'],
        response: {
          text: `To add a new team member in ${platformName}, go to the Team Management section, click "Add Member", and enter their information. You can assign them to specific departments, teams, and roles.`,
          suggestions: [
            { id: 'team_roles', text: 'Define team roles' },
            { id: 'team_permissions', text: 'Set permissions' },
            { id: 'team_onboarding', text: 'Team onboarding' }
          ]
        }
      }
    ],
    
    // Reporting and analytics responses
    reporting: [
      {
        keywords: ['report', 'analytics', 'metrics', 'performance', 'statistics', 'stats', 'dashboard'],
        response: {
          text: `${platformName} provides ${businessName} with detailed analytics on productivity, project progress, task completion, and more.`,
          suggestions: [
            { id: 'performance_reports', text: 'Performance reports' },
            { id: 'time_reports', text: 'Time & attendance reports' },
            { id: 'export_data', text: 'Export data' }
          ]
        }
      },
      {
        keywords: ['export report', 'download data', 'generate report', 'create report'],
        response: {
          text: `${platformName} allows you to generate and export various reports for ${businessName}. You can customize reports, filter data, and export in formats like PDF, Excel, or CSV.`,
          suggestions: [
            { id: 'scheduled_reports', text: 'Schedule automated reports' },
            { id: 'custom_reports', text: 'Create custom reports' },
            { id: 'share_reports', text: 'Share reports with team' }
          ]
        }
      }
    ],
    
    // Field service responses
    fieldService: [
      {
        keywords: ['field', 'service', 'field service', 'location', 'site', 'remote'],
        response: {
          text: `${platformName}'s field service features help ${businessName} manage operations outside the office, including location tracking and service scheduling.`,
          suggestions: [
            { id: 'field_locations', text: 'Field locations' },
            { id: 'service_schedule', text: 'Service scheduling' },
            { id: 'field_reporting', text: 'Field reporting' }
          ]
        }
      },
      {
        keywords: ['gps tracking', 'location tracking', 'field worker location', 'track field staff'],
        response: {
          text: `${platformName} offers GPS tracking features for ${businessName}'s field teams. This allows real-time location monitoring, route optimization, and accurate time tracking for on-site work.`,
          suggestions: [
            { id: 'route_planning', text: 'Route planning' },
            { id: 'location_history', text: 'Location history' },
            { id: 'geofencing', text: 'Set up geofencing' }
          ]
        }
      }
    ],
    
    // Client management responses
    clients: [
      {
        keywords: ['client', 'customer', 'account', 'portal'],
        response: {
          text: `${platformName} helps ${businessName} manage client relationships, track communications, and handle client requests.`,
          suggestions: [
            { id: 'add_client', text: 'Add a client' },
            { id: 'client_portal', text: 'Client portal features' },
            { id: 'client_invoices', text: 'Client invoicing' }
          ]
        }
      },
      {
        keywords: ['add client', 'new client', 'client access', 'client login', 'client portal'],
        response: {
          text: `To add a new client in ${platformName}, go to the Client Management section, click "Add Client", and enter their details. You can provide them with portal access to view projects, submit requests, and access invoices.`,
          suggestions: [
            { id: 'client_permissions', text: 'Client permissions' },
            { id: 'client_communication', text: 'Client communication' },
            { id: 'client_documents', text: 'Share documents with clients' }
          ]
        }
      }
    ],
    
    // Help and support responses
    help: [
      {
        keywords: ['help', 'support', 'assistance', 'guide', 'tutorial', 'how to', 'how do i'],
        response: {
          text: `I can help with how ${businessName} can use ${platformName} for managing projects, tracking time, organizing teams, and more. What do you need help with?`,
          suggestions: [
            { id: 'projects_help', text: 'Projects help' },
            { id: 'tasks_help', text: 'Tasks help' },
            { id: 'time_help', text: 'Time tracking help' },
            { id: 'teams_help', text: 'Team management help' }
          ]
        }
      },
      {
        keywords: ['documentation', 'manual', 'instructions', 'learn how', 'training'],
        response: {
          text: `${platformName} provides comprehensive documentation and training resources for ${businessName}. You can access tutorials, how-to guides, video instructions, and best practices in our Help Center.`,
          suggestions: [
            { id: 'quick_start', text: 'Quick start guide' },
            { id: 'video_tutorials', text: 'Video tutorials' },
            { id: 'help_center', text: 'Browse Help Center' }
          ]
        }
      }
    ],
    
    // Auto-assignment responses
    autoAssignment: [
      {
        keywords: ['auto', 'assign', 'automatic', 'assignment', 'auto-assign'],
        response: {
          text: `${platformName} provides ${businessName} with auto-assignment capabilities that can automatically assign tasks to the most suitable team members based on skills, workload, and availability.`,
          suggestions: [
            { id: 'auto_assign_setup', text: 'Set up auto-assignment' },
            { id: 'auto_assign_trigger', text: 'Trigger auto-assignment' },
            { id: 'pending_approvals', text: 'Pending approvals' }
          ]
        }
      },
      {
        keywords: ['auto-assign setup', 'configure auto-assignment', 'assignment rules', 'assignment criteria'],
        response: {
          text: `To set up auto-assignment in ${platformName}, go to the Auto-Assignment section in your settings. Here you can define rules, set criteria weights, and configure how tasks are distributed among team members based on skills, workload, and availability.`,
          suggestions: [
            { id: 'skill_matrix', text: 'Set up skill matrix' },
            { id: 'workload_balancing', text: 'Workload balancing' },
            { id: 'assignment_override', text: 'Manual override options' }
          ]
        }
      }
    ],
    
    // Quality control responses
    quality: [
      {
        keywords: ['quality', 'inspection', 'compliance', 'safety', 'audit'],
        response: {
          text: `${platformName}'s quality control features help ${businessName} conduct inspections, ensure compliance with standards, and maintain safety protocols.`,
          suggestions: [
            { id: 'create_inspection', text: 'Create inspection' },
            { id: 'compliance_report', text: 'Compliance report' },
            { id: 'safety_checklist', text: 'Safety checklists' }
          ]
        }
      },
      {
        keywords: ['inspection template', 'compliance checklist', 'safety form', 'quality check'],
        response: {
          text: `${platformName} allows ${businessName} to create custom inspection templates and checklists. These can be used for quality control, safety audits, and compliance verification, with the ability to include photos, measurements, and digital signatures.`,
          suggestions: [
            { id: 'template_library', text: 'Inspection template library' },
            { id: 'mobile_inspections', text: 'Mobile inspection tools' },
            { id: 'inspection_reports', text: 'Generate inspection reports' }
          ]
        }
      }
    ],
    
    // Equipment management responses
    equipment: [
      {
        keywords: ['equipment', 'asset', 'tool', 'inventory', 'maintenance'],
        response: {
          text: `${platformName} includes equipment management tools for ${businessName} to track assets, schedule maintenance, and monitor usage.`,
          suggestions: [
            { id: 'track_equipment', text: 'Track equipment' },
            { id: 'maintenance_schedule', text: 'Maintenance schedule' },
            { id: 'equipment_assignment', text: 'Equipment assignment' }
          ]
        }
      },
      {
        keywords: ['add equipment', 'new asset', 'equipment inventory', 'asset tracking'],
        response: {
          text: `To add equipment in ${platformName}, go to the Equipment Management section, click "Add Equipment", and enter details such as name, type, serial number, purchase date, and current status. You can then track maintenance, assign to team members, and monitor usage.`,
          suggestions: [
            { id: 'equipment_categories', text: 'Equipment categories' },
            { id: 'equipment_status', text: 'Equipment status tracking' },
            { id: 'equipment_history', text: 'View equipment history' }
          ]
        }
      }
    ],
    
    // Conversational responses
    conversation: [
      {
        keywords: ['how are you', 'how\'s it going', 'how are things', 'how do you do', 'what\'s up', 'how you doing'],
        response: {
          text: `I'm doing well, thanks for asking! I'm here to help with any questions you have about ${platformName} for ${businessName}. How can I assist you today?`,
          suggestions: [
            { id: 'help', text: 'What can you help with?' },
            { id: 'features', text: 'Show me key features' },
            { id: 'get_started', text: 'How do I get started?' }
          ]
        }
      },
      {
        keywords: ['who are you', 'what are you', 'what is this', 'what can you do', 'what do you do'],
        response: {
          text: `I'm your ${platformName} assistant for ${businessName}. I can help with questions about projects, tasks, time tracking, team management, and more. What would you like to know about?`,
          suggestions: [
            { id: 'features', text: 'What features do you offer?' },
            { id: 'start', text: 'Help me get started' },
            { id: 'support', text: 'I need support' }
          ]
        }
      }
    ],
    
    // Thank you responses
    gratitude: [
      {
        keywords: ['thank you', 'thanks', 'appreciate it', 'awesome', 'great', 'thank', 'thx'],
        response: {
          text: `You're welcome! I'm happy to help. Is there anything else you'd like to know about ${platformName}?`,
          suggestions: [
            { id: 'more_help', text: 'I need more help' },
            { id: 'features', text: 'Show me features' },
            { id: 'no_thanks', text: 'That\'s all for now' }
          ]
        }
      }
    ],
    
    // About Staffluent responses
    about: [
      {
        keywords: ['what is staffluent', 'what does staffluent do', 'what\'s staffluent', 'explain staffluent', 'about staffluent'],
        response: {
          text: `Staffluent is a comprehensive workforce management platform that helps ${businessName} manage projects, tasks, teams, time tracking, field service operations, client relationships, and more. It's designed to streamline operations and improve productivity across your entire organization.`,
          suggestions: [
            { id: 'core_features', text: 'Core features' },
            { id: 'benefits', text: 'Key benefits' },
            { id: 'tour', text: 'Take a tour' }
          ]
        }
      }
    ],
    
    // Features responses
    features: [
      {
        keywords: ['features', 'capabilities', 'what can it do', 'functionality', 'tools', 'modules'],
        response: {
          text: `Staffluent offers a wide range of features for ${businessName}, including: project management, task tracking, time & attendance, team management, field service operations, client management, reporting & analytics, quality control, and equipment management. Which feature would you like to learn more about?`,
          suggestions: [
            { id: 'projects', text: 'Project management' },
            { id: 'time', text: 'Time tracking' },
            { id: 'teams', text: 'Team management' },
            { id: 'field', text: 'Field service' }
          ]
        }
      }
    ],
    
    // Benefits and value responses
    benefits: [
      {
        keywords: ['benefits', 'advantages', 'why use', 'value', 'roi', 'return on investment'],
        response: {
          text: `Staffluent helps ${businessName} boost productivity, reduce administrative overhead, improve resource allocation, enhance client satisfaction, and gain better visibility into operations. Our customers typically see significant time savings and operational improvements within weeks of implementation.`,
          suggestions: [
            { id: 'case_studies', text: 'Success stories' },
            { id: 'pricing', text: 'Pricing info' },
            { id: 'demo', text: 'Request a demo' }
          ]
        }
      }
    ],
    
    // Getting started responses
    gettingStarted: [
      {
        keywords: ['get started', 'setup', 'begin', 'start', 'onboarding', 'first steps'],
        response: {
          text: `Getting started with Staffluent is easy for ${businessName}. You can begin by setting up your team members, creating your first project, and configuring your dashboard. Our step-by-step guides will walk you through the process, or our support team can help with onboarding.`,
          suggestions: [
            { id: 'setup_team', text: 'Set up my team' },
            { id: 'first_project', text: 'Create first project' },
            { id: 'dashboard', text: 'Configure dashboard' }
          ]
        }
      }
    ]
  };
  
  // Flatten all response rules from categories for processing
  const allResponseRules = Object.values(responseCategories).flat();
  
  // Check if we're in a specific view context
  if (context?.currentView) {
    const viewResponses = this.getViewSpecificResponses(
      context.currentView, 
      business?.operationType, 
      userName,
      businessName
    );
    
    // Only return view response for greeting or help requests
    if (viewResponses && (normalizedMessage.includes('hello') || normalizedMessage.includes('hi') || 
        normalizedMessage.includes('help') || normalizedMessage.length < 5)) {
      return {
        ...viewResponses,
        confidence: 0.9
      };
    }
  }
  
  // Find best matching responses based on keyword relevance
  const scoredResponses = allResponseRules.map(rule => ({
    rule,
    score: this.calculateRelevanceScore(keyTerms, rule.keywords)
  }))
  .filter(item => item.score > 0.2) // Filter out low-scoring matches
  .sort((a, b) => b.score - a.score); // Sort by score descending
  
  // Get top matches (up to 3)
  const topMatches = scoredResponses.slice(0, 3);
  
  // If we found a reasonable match, use it
  if (topMatches.length > 0 && topMatches[0].score > 0.3) {
    const bestMatch = topMatches[0].rule;
    
    // If this appears to be a follow-up question, adapt the response style
    if (isFollowup) {
      const response = { ...bestMatch.response };
      // Remove greeting prefixes for follow-up questions
      response.text = response.text.replace(`Hello ${userName}! `, '').replace(`Hi there! `, '');
      
      // If we have multiple good matches, include information from second best match to make response more complete
      if (topMatches.length > 1 && topMatches[1].score > 0.5) {
        // Combine suggestions from both top matches
        const secondBestSuggestions = topMatches[1].rule.response.suggestions || [];
        response.suggestions = [...(response.suggestions || []), ...secondBestSuggestions].slice(0, 4);
      }
      
      return {
        ...response,
        confidence: topMatches[0].score
      };
    }
    
    // Regular (non-followup) response
    return {
      ...bestMatch.response,
      confidence: topMatches[0].score
    };
  }
  
  // See if this is asking about something specific like "how to create a project"
  const specificResponses = this.checkForSpecificQuestions(
    normalizedMessage, 
    businessName
  );
  
  if (specificResponses) {
    return {
      ...specificResponses,
      confidence: 0.8
    };
  }
  
  // Default response if no good match
  return {
    text: `I'm not sure I understand your question about "${normalizedMessage}". Could you try rephrasing or select one of these options?`,
    suggestions: [
      { id: 'help', text: 'Show all help topics' },
      { id: 'projects', text: 'Projects' },
      { id: 'tasks', text: 'Tasks' },
      { id: 'time', text: 'Time tracking' }
    ],
    confidence: 0.1 // Low confidence
  };
}

  
  /**
 * NEW METHOD: Determine if this is a casual conversational query
 */
private isConversationalQuery(message: string): boolean {
  const conversationalPatterns = [
    /^how are you/i,
    /^how('s| is) it going/i,
    /^how('s| is your) day/i,
    /^what('s| is) up/i,
    /^how have you been/i,
    /^how do you do/i,
    /^how('s| is) life/i,
    /^good (morning|afternoon|evening)/i,
    /^(hi|hey|hello)/i,
    /^nice to (meet|see) you/i,
    /^(how are things|are you good)/i,
    /^(yo|greetings|howdy)/i
  ];
  
  return conversationalPatterns.some(pattern => pattern.test(message));
}

/**
 * NEW METHOD: Get response for casual conversation
 */
private getConversationalResponse(
  message: string,
  userName: string,
  businessName: string,
  platformName: string
): { text: string; suggestions: { id: string; text: string }[] } | null {
  
  // Greeting patterns
  if (/^(hi|hey|hello|greetings|howdy)/i.test(message)) {
    return {
      text: `Hello ${userName}! I'm the ${platformName} assistant for ${businessName}. How can I help you today?`,
      suggestions: [
        { id: 'features', text: 'What can you help with?' },
        { id: 'get_started', text: 'Getting started with Staffluent' },
        { id: 'learn_more', text: 'Tell me about Staffluent' }
      ]
    };
  }
  
  // How are you patterns
  if (/how are you|how's it going|how have you been|how's your day|how do you do/i.test(message)) {
    return {
      text: `I'm doing well, thanks for asking, ${userName}! I'm here to help you with anything related to ${platformName}. What would you like assistance with today?`,
      suggestions: [
        { id: 'features', text: 'Show me key features' },
        { id: 'help', text: 'I need help with something' },
        { id: 'learn', text: 'Learn about Staffluent' }
      ]
    };
  }
  
  // What's up patterns
  if (/what('s| is) up|what's happening/i.test(message)) {
    return {
      text: `Not much, just here to help you with ${platformName}! I can assist with projects, time tracking, team management, and more. What are you working on today?`,
      suggestions: [
        { id: 'projects', text: 'Project management' },
        { id: 'time', text: 'Time tracking' },
        { id: 'teams', text: 'Team management' }
      ]
    };
  }
  
  // Good morning/afternoon/evening
  if (/good (morning|afternoon|evening)/i.test(message)) {
    const timeOfDay = message.match(/good (morning|afternoon|evening)/i)[1];
    return {
      text: `Good ${timeOfDay}, ${userName}! I hope you're having a great day. I'm ready to help you with ${platformName} for ${businessName}. What can I assist you with?`,
      suggestions: [
        { id: 'dashboardHelp', text: 'Dashboard overview' },
        { id: 'quickStart', text: 'Quick start guide' },
        { id: 'projectsHelp', text: 'Help with projects' }
      ]
    };
  }
  
  // If no specific conversational pattern matched
  return null;
}


/**
 * Enhanced method: Check if this is a follow-up question based on conversation history
 * Improved to detect more types of follow-up patterns
 */
private isFollowupQuestion(context: Record<string, any>): boolean {
  if (!context?.conversationHistory || context.conversationHistory.length < 2) {
    return false;
  }

  // Get the most recent messages (last 3)
  const recentMessages = context.conversationHistory.slice(-3);
  const hasRecentBotMessage = recentMessages.some(msg => msg.sender === 'bot');
  const hasRecentUserMessage = recentMessages.some(msg => msg.sender === 'user');
  
  // Check for basic exchange pattern
  const hasRecentExchange = hasRecentBotMessage && hasRecentUserMessage;
  
  // Enhanced check for the most recent user message
  const latestUserMessage = [...recentMessages].reverse().find(msg => msg.sender === 'user');
  
  if (latestUserMessage) {
    const message = latestUserMessage.content.toLowerCase().trim();
    
    // 1. Check for very short queries (likely follow-ups)
    if (message.split(' ').length <= 3) {
      return true;
    }
    
    // 2. Check for queries that start with follow-up indicators
    const followupPrefixes = [
      'why', 'how', 'what about', 'and', 'but', 'then', 'so',
      'can you', 'could you', 'would', 'is it', 'are they', 
      'does it', 'do they', 'explain', 'elaborate'
    ];
    
    for (const prefix of followupPrefixes) {
      if (message.startsWith(prefix)) {
        return true;
      }
    }
    
    // 3. Check for queries containing follow-up phrases
    const followupPhrases = [
      ' instead', ' as well', ' also', ' too', ' more',
      ' again', ' besides', ' additionally', ' further',
      ' else', ' other than', ' apart from'
    ];
    
    for (const phrase of followupPhrases) {
      if (message.includes(phrase)) {
        return true;
      }
    }
    
    // 4. Check for pronouns without clear subjects
    // This indicates the message is referring to something previously mentioned
    const standalonePronouns = [
      'it', 'they', 'them', 'those', 'these', 'that', 'this',
      'he', 'she', 'his', 'her', 'its', 'their', 'which'
    ];
    
    // Check if message starts with standalone pronouns or contains them without clear subjects
    for (const pronoun of standalonePronouns) {
      const pronounPattern = new RegExp(`(^${pronoun}\\b|\\s${pronoun}\\s)`, 'i');
      if (pronounPattern.test(message)) {
        // Look for subject nouns that would make this not a follow-up
        const hasSubject = message.includes('project') || 
                           message.includes('task') || 
                           message.includes('team') || 
                           message.includes('feature') ||
                           message.includes('staffluent');
        
        if (!hasSubject) {
          return true;
        }
      }
    }
  }

  return hasRecentExchange;
}


/**
* Format knowledge document content into a conversational response
* Enhanced for readability and engagement
*/
private formatKnowledgeResponse(
 content: string,
 businessName: string,
 userName: string,
 platformName: string
): string {
 // Replace placeholders
 let response = content
   .replace(/{businessName}/g, businessName)
   .replace(/{userName}/g, userName)
   .replace(/{platformName}/g, platformName);
 
 // If content is too long, summarize it
 if (response.length > 500) {
   const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
   
   if (sentences.length > 5) {
     // Use first 2-3 sentences for a brief summary
     response = sentences.slice(0, 3).join('. ') + '.';
     
     // Add a concluding sentence
     response += " I hope this helps! Let me know if you'd like more details.";
   }
 }
 
 // Add a personal touch for better engagement
 if (!response.includes(userName) && !response.includes('you')) {
   response = `${userName}, ${response.charAt(0).toLowerCase() + response.slice(1)}`;
 }
 
 // Improve readability for technical content
 if (response.includes('API') || response.includes('config') || response.includes('settings')) {
   response += " Would you like me to explain any specific part in more detail?";
 }
 
 // Add contextual suggestions based on content
 if (response.includes('project') && !response.includes('create a project')) {
   response += " You can easily create a new project or view existing ones from your dashboard.";
 } else if (response.includes('task') && !response.includes('assign tasks')) {
   response += " Tasks can be assigned to team members with just a few clicks.";
 } else if (response.includes('report') && !response.includes('generate reports')) {
   response += " Reports can be generated and exported in various formats.";
 }
 
 return response;
}

/**
 * Extract suggestions from a knowledge document
 * Enhanced to provide more relevant and contextual suggestions
 */
private getSuggestionsFromDocument(doc: any): { id: string; text: string }[] {
  // Generate suggestions based on document content and keywords
  const suggestions = [];
  
  // Analyze document content to identify action-oriented suggestions
  const content = doc.content || '';
  
  // Look for specific actions in the content
  if (content.includes('create') || content.includes('add') || content.includes('set up')) {
    suggestions.push({
      id: 'action_create',
      text: content.includes('project') ? 'Create a project' : 
            content.includes('task') ? 'Create a task' :
            content.includes('team') ? 'Add team member' : 'Create new'
    });
  }
  
  if (content.includes('view') || content.includes('see') || content.includes('check')) {
    suggestions.push({
      id: 'action_view',
      text: content.includes('project') ? 'View projects' : 
            content.includes('task') ? 'View tasks' :
            content.includes('team') ? 'View team' : 
            content.includes('report') ? 'View reports' : 'View dashboard'
    });
  }
  
  if (content.includes('export') || content.includes('download') || content.includes('share')) {
    suggestions.push({
      id: 'action_export',
      text: content.includes('report') ? 'Export report' : 
            content.includes('data') ? 'Export data' : 'Share'
    });
  }
  
  // Add a "Tell me more" suggestion if we don't have any action suggestions yet
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'more_info',
      text: 'Tell me more about this'
    });
  }
  
  // Add category-based suggestions
  if (doc.categories && doc.categories.length > 0) {
    const categoryMap = {
      'project_management': 'About project management',
      'task_management': 'About task management',
      'time_tracking': 'About time tracking',
      'team_management': 'About team management',
      'client_management': 'About client management',
      'reporting': 'About reporting features',
      'field_service': 'About field service',
      'equipment': 'About equipment management',
      'quality_control': 'About quality control'
    };
    
    for (const category of doc.categories) {
      if (categoryMap[category] && suggestions.length < 3) {
        suggestions.push({
          id: `category_${category}`,
          text: categoryMap[category]
        });
      }
    }
  }
  
  // Add help/tutorial suggestion
  if (suggestions.length < 4) {
    suggestions.push({
      id: 'help_tutorial',
      text: content.includes('project') ? 'Project tutorials' : 
            content.includes('task') ? 'Task tutorials' :
            content.includes('team') ? 'Team tutorials' : 
            content.includes('time') ? 'Time tracking help' : 'View tutorials'
    });
  }
  
  // Add keyword-based suggestions if needed
  if (suggestions.length < 3 && doc.keywords && doc.keywords.length > 0) {
    // Limit to 3 total suggestions
    const limit = 3 - suggestions.length;
    
    for (let i = 0; i < Math.min(limit, doc.keywords.length); i++) {
      const keyword = doc.keywords[i];
      
      if (keyword.length > 3) {
        suggestions.push({
          id: `keyword_${keyword}`,
          text: `More about ${keyword}`
        });
      }
    }
  }
  
  return suggestions.slice(0, 4); // Limit to max 4 suggestions
}

  /**
 * Check for specific how-to questions
 */
private checkForSpecificQuestions(message: string, businessName: string = 'your business'): { text: string; suggestions?: { id: string; text: string }[] } | null {
  const howToCreate = /how\s+(?:do\s+i|to|can\s+i)\s+create\s+(?:a|an)?\s+(\w+)/i;
  const howToManage = /how\s+(?:do\s+i|to|can\s+i)\s+manage\s+(?:a|an)?\s+(\w+)/i;
  const howToTrack = /how\s+(?:do\s+i|to|can\s+i)\s+track\s+(?:a|an)?\s+(\w+)/i;
  
  let match;
  
  if ((match = howToCreate.exec(message)) !== null) {
    const item = match[1].toLowerCase();
    if (item === 'project' || item === 'projects') {
      return {
        text: `To create a new project for ${businessName}, go to the Projects section in Staffluent and click the 'Create Project' button. You'll need to fill in project details such as name, description, start and end dates, and assign team members.`,
        suggestions: [
          { id: 'project_template', text: 'Use project template' },
          { id: 'project_settings', text: 'Project settings' }
        ]
      };
    } else if (item === 'task' || item === 'tasks') {
      return {
        text: `To create a task for ${businessName}, navigate to the Tasks section in Staffluent and click 'New Task'. You can set a name, description, due date, priority level, and assign it to team members.`,
        suggestions: [
          { id: 'task_priority', text: 'Set task priority' },
          { id: 'task_assignment', text: 'Task assignment' }
        ]
      };
    } else if (item === 'team' || item === 'teams') {
      return {
        text: `To create a new team for ${businessName}, go to the Team Management section in Staffluent and select 'Create Team'. You'll need to provide a team name, select a department, and add team members.`,
        suggestions: [
          { id: 'team_structure', text: 'Team structure' },
          { id: 'team_roles', text: 'Define team roles' }
        ]
      };
    }
  } else if ((match = howToManage.exec(message)) !== null) {
    const item = match[1].toLowerCase();
    if (item === 'project' || item === 'projects') {
      return {
        text: `To manage ${businessName} projects in Staffluent, use the Projects dashboard where you can track progress, update status, manage tasks, assign team members, and monitor timelines.`,
        suggestions: [
          { id: 'project_progress', text: 'Update project progress' },
          { id: 'project_team', text: 'Manage project team' }
        ]
      };
    } else if (item === 'team' || item === 'teams') {
      return {
        text: `Team management for ${businessName} is done through the Teams section in Staffluent. Here you can organize team members, assign roles, monitor performance, and handle scheduling.`,
        suggestions: [
          { id: 'team_schedule', text: 'Team scheduling' },
          { id: 'team_performance', text: 'Performance tracking' }
        ]
      };
    }
  } else if ((match = howToTrack.exec(message)) !== null) {
    const item = match[1].toLowerCase();
    if (item === 'time' || item === 'hours') {
      return {
        text: `Time tracking for ${businessName} can be done using the Staffluent Time & Attendance module. You can clock in/out, log breaks, and record time spent on specific tasks or projects.`,
        suggestions: [
          { id: 'time_reports', text: 'Time reports' },
          { id: 'timesheet', text: 'View timesheets' }
        ]
      };
    } else if (item === 'progress' || item === 'status') {
      return {
        text: `You can track ${businessName} progress in the Staffluent Projects section by updating completion percentages, milestone achievements, and task statuses. Reports provide visual representations of progress.`,
        suggestions: [
          { id: 'progress_report', text: 'Progress reports' },
          { id: 'milestone_tracking', text: 'Milestone tracking' }
        ]
      };
    }
  }
  
  return null;
}

  /**
 * Enhanced method: Extract key terms from message for better matching
 * Improved with NLP-style analysis
 */
private extractKeyTerms(message: string): string[] {
  // Business domain specific terms to prioritize
  const businessTerms = new Set([
    'project', 'task', 'team', 'time', 'track', 'management', 'client',
    'report', 'schedule', 'staff', 'equipment', 'field', 'service',
    'quality', 'inspection', 'analytics', 'dashboard', 'feature',
    'assign', 'create', 'update', 'delete', 'view', 'employee',
    'invoice', 'attendance', 'timesheet', 'break', 'overtime',
    'compliance', 'billing', 'maintenance', 'workflow'
  ]);

  // Enhanced stopwords list
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where',  
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such', 
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 
    'can', 'will', 'just', 'should', 'now', 'about', 'which',
    'i', 'me', 'my', 'mine', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves', 'it', 'its', 'itself',
    'for', 'of', 'with', 'by', 'at', 'from', 'to', 'in', 'on', 'up', 'down',
    'this', 'that', 'these', 'those', 'there', 'here', 'get', 'got', 'have',
    'has', 'had', 'did', 'does', 'do', 'am', 'having', 'being', 'doing',
    'could', 'would', 'should', 'may', 'might', 'must', 'shall'
  ]);
  
  // Preserve important conversational keywords
  const preserveWords = new Set([
    'how', 'what', 'who', 'why', 'when', 'where', 'which', 'help', 'thanks', 
    'thank', 'hi', 'hello', 'hey', 'create', 'add', 'new', 'set', 'update', 
    'track', 'view', 'show', 'find', 'manage'
  ]);
  
  // Improved tokenization with potential phrase extraction
  const tokenized = message.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/); // Split by whitespace
  
  // Identify potential important phrases (2-3 word combinations)
  const phrases = [];
  for (let i = 0; i < tokenized.length - 1; i++) {
    // Two-word phrases
    const twoWordPhrase = tokenized[i] + ' ' + tokenized[i+1];
    if (businessTerms.has(tokenized[i]) || businessTerms.has(tokenized[i+1])) {
      phrases.push(twoWordPhrase);
    }
    
    // Three-word phrases
    if (i < tokenized.length - 2) {
      const threeWordPhrase = twoWordPhrase + ' ' + tokenized[i+2];
      if (businessTerms.has(tokenized[i]) || 
          businessTerms.has(tokenized[i+1]) ||
          businessTerms.has(tokenized[i+2])) {
        phrases.push(threeWordPhrase);
      }
    }
  }
  
  // Filter individual tokens using improved criteria
  const filteredTokens = tokenized.filter(word => {
    // Keep if it's:
    // 1. A preserved word, OR
    // 2. A business domain term, OR
    // 3. Longer than 3 characters AND not a stopword
    return preserveWords.has(word) || 
           businessTerms.has(word) || 
           (word.length > 3 && !stopWords.has(word));
  });
  
  // Combine individual tokens and relevant phrases
  const allTerms = [...filteredTokens, ...phrases];
  
  // Check for common action phrases
  const actionPhrases = [
    'how to', 'show me', 'help with', 'need to',
    'want to', 'looking for', 'trying to',
    'create new', 'set up', 'tell me about'
  ];
  
  const normalizedMessage = message.toLowerCase();
  for (const phrase of actionPhrases) {
    if (normalizedMessage.includes(phrase)) {
      allTerms.push(phrase);
    }
  }
  
  // Return unique terms, with duplicates removed
  return [...new Set(allTerms)];
}

 /**
 * Enhanced method: Calculate relevance score between message terms and rule keywords
 * Improved with better scoring system and phrase matching
 */
private calculateRelevanceScore(terms: string[], keywords: string[]): number {
  if (!terms.length || !keywords.length) return 0;
  
  // Create a single string for phrase matching
  const fullMessage = terms.join(' ');
  
  // Track matches by type for better scoring
  let exactWordMatches = 0;
  let partialWordMatches = 0;
  let phraseMatches = 0;
  
  // 1. Check for exact phrase matches first (highest priority)
  for (const keyword of keywords) {
    // Full phrase exact match
    if (fullMessage === keyword) {
      return 1.0; // Perfect match
    }
    
    // Contains full phrase
    if (keyword.includes(' ') && fullMessage.includes(keyword)) {
      phraseMatches += 1.5; // Weighted higher than individual word matches
    }
  }
  
  // 2. Handle very short queries specially
  if (terms.length === 1) {
    for (const keyword of keywords) {
      if (terms[0] === keyword) {
        return 0.9; // Almost perfect match for single term
      }
    }
  }
  
  // 3. Process individual term matches with proper weighting
  // Create a set of keywords for faster lookups
  const keywordSet = new Set(keywords);
  const keywordParts = new Set();
  
  // Break multi-word keywords into individual words for more matching opportunities
  keywords.forEach(keyword => {
    if (keyword.includes(' ')) {
      keyword.split(' ').forEach(part => {
        if (part.length > 2) keywordParts.add(part);
      });
    }
  });
  
  // Score terms against keywords
  for (const term of terms) {
    // Skip very short terms as they're often not meaningful
    if (term.length < 3) continue;
    
    // Exact match gets highest score
    if (keywordSet.has(term)) {
      exactWordMatches += 1.0;
      continue;
    }
    
    // Check if term is part of a multi-word keyword
    if (keywordParts.has(term)) {
      exactWordMatches += 0.8;
      continue;
    }
    
    // Check for partial matches (stemming-like behavior)
    let foundPartial = false;
    for (const keyword of keywords) {
      // Prefix match (beginning of word)
      if (keyword.startsWith(term) || term.startsWith(keyword)) {
        partialWordMatches += 0.7;
        foundPartial = true;
        break;
      }
      
      // Contains match (substring)
      if (keyword.includes(term) || term.includes(keyword)) {
        partialWordMatches += 0.4;
        foundPartial = true;
        break;
      }
    }
    
    if (!foundPartial) {
      // Check for fuzzy matches (e.g. plurals, verb forms)
      for (const keyword of keywords) {
        if (this.isFuzzyMatch(term, keyword)) {
          partialWordMatches += 0.3;
          break;
        }
      }
    }
  }
  
  // Calculate base score with weighted contributions
  const totalMatches = exactWordMatches + (partialWordMatches * 0.6) + phraseMatches;
  
  // Base score considers both query terms and keywords, with phrase matches weighted higher
  const baseScore = (
    totalMatches / 
    (terms.length + (keywords.length * 0.5) - phraseMatches * 0.2)
  );
  
  // Adjust score based on query characteristics
  const adjustments = 
    // Boost for very short queries
    (terms.length <= 3 ? 0.15 : 0) + 
    // Boost for phrase matches
    (phraseMatches > 0 ? 0.2 : 0) + 
    // Boost for high ratio of exact matches
    (exactWordMatches > terms.length * 0.5 ? 0.1 : 0);
  
  // Ensure final score is between 0 and 1
  return Math.min(1.0, Math.max(0, baseScore + adjustments));
}

/**
 * NEW METHOD: Check if two terms are fuzzy matches (handles plurals, common verb forms, etc.)
 */
private isFuzzyMatch(term1: string, term2: string): boolean {
  // Handle simple plurals
  if (term1 + 's' === term2 || term1 === term2 + 's') {
    return true;
  }
  
  // Handle -ing forms
  if (term1 + 'ing' === term2 || term1 === term2 + 'ing') {
    return true;
  }
  
  // Handle -ed forms
  if (term1 + 'ed' === term2 || term1 === term2 + 'ed') {
    return true;
  }
  
  // Handle y/ies transformations
  if (term1.endsWith('y') && term2 === term1.slice(0, -1) + 'ies') {
    return true;
  }
  if (term2.endsWith('y') && term1 === term2.slice(0, -1) + 'ies') {
    return true;
  }
  
  return false;
}

  /**
   /**
 * Get responses specific to the current view
 */
private getViewSpecificResponses(
  currentView: string, 
  businessType: string = 'hybrid',
  userName: string = 'there',
  businessName: string = 'your business'
): { text: string; suggestions?: { id: string; text: string }[] } | null {
  // Response suggestions based on current view, clarifying Staffluent platform vs client business
  const viewResponses = {
    'dashboard': {
      text: `Hello ${userName}! You're currently on the Staffluent Dashboard for ${businessName}. Here you can see key metrics and an overview of your business activities.`,
      suggestions: [
        { id: 'dashboard_metrics', text: 'Explain dashboard metrics' },
        { id: 'performance_overview', text: 'Performance overview' }
      ]
    },
    'projects': {
      text: `You're in the Projects section of Staffluent. Here you can manage all ${businessName} projects and their details.`,
      suggestions: [
        { id: 'create_project', text: 'Create a new project' },
        { id: 'project_status', text: 'Update project status' }
      ]
    },
    'tasks': {
      text: `You're in the Tasks section of Staffluent. Here you can create, assign, and track tasks across your ${businessName} team.`,
      suggestions: [
        { id: 'create_task', text: 'Create a new task' },
        { id: 'assign_task', text: 'Assign a task' }
      ]
    },
    'team': {
      text: `You're in the Team section of Staffluent. Here you can manage ${businessName} team members and their assignments.`,
      suggestions: [
        { id: 'add_member', text: 'Add team member' },
        { id: 'team_schedule', text: 'Team scheduling' }
      ]
    },
    'time': {
      text: `You're in the Time Tracking section of Staffluent. Here you can manage ${businessName} attendance and timesheets.`,
      suggestions: [
        { id: 'time_entry', text: 'Enter time' },
        { id: 'view_timesheets', text: 'View timesheets' }
      ]
    },
    'field': {
      text: `You're in the Field Operations section of Staffluent. Here you can manage ${businessName} field services and remote teams.`,
      suggestions: [
        { id: 'field_map', text: 'View field map' },
        { id: 'field_staff', text: 'Field staff' }
      ]
    },
    'clients': {
      text: `You're in the Client Management section of Staffluent. Here you can manage ${businessName} client accounts and relationships.`,
      suggestions: [
        { id: 'add_client', text: 'Add new client' },
        { id: 'client_invoices', text: 'Client invoices' }
      ]
    },
    'autoAssignment': {
      text: `You're in the Auto Assignment section of Staffluent. Here you can configure how tasks are automatically assigned to ${businessName} team members.`,
      suggestions: [
        { id: 'configure_weights', text: 'Configure assignment weights' },
        { id: 'pending_approvals', text: 'View pending approvals' },
        { id: 'assignment_history', text: 'View assignment history' }
      ]
    },
    'equipment': {
      text: `You're in the Equipment Management section of Staffluent. Here you can track ${businessName} assets, schedule maintenance, and manage equipment assignments.`,
      suggestions: [
        { id: 'add_equipment', text: 'Add equipment' },
        { id: 'maintenance', text: 'Schedule maintenance' },
        { id: 'equipment_logs', text: 'Equipment logs' }
      ]
    },
    'quality': {
      text: `You're in the Quality Control section of Staffluent. Here you can manage ${businessName} inspections, compliance, and safety protocols.`,
      suggestions: [
        { id: 'create_inspection', text: 'Create inspection' },
        { id: 'compliance_report', text: 'Compliance report' },
        { id: 'safety_checklist', text: 'Safety checklists' }
      ]
    },
    'reports': {
      text: `You're in the Reports section of Staffluent. Here you can generate and view analytics on various aspects of ${businessName}.`,
      suggestions: [
        { id: 'performance_report', text: 'Performance reports' },
        { id: 'time_report', text: 'Time reports' },
        { id: 'export_data', text: 'Export data' }
      ]
    }
  };

  // Add or filter suggestions based on business type
  if (businessType === 'field_service' && viewResponses[currentView]) {
    // Add field service specific suggestions
    if (currentView === 'dashboard') {
      viewResponses[currentView].suggestions.push({ id: 'field_metrics', text: 'Field service metrics' });
    }
  }

  return viewResponses[currentView] || null;
}

/**
 * Record feedback for a chatbot message
 */
async recordMessageFeedback(
  businessId: string,
  clientId: string,
  messageId: string,
  wasHelpful: boolean,
  feedbackText: string | null = null
): Promise<void> {
  try {
    // Find the message to update
    const message = await this.chatbotMessageModel.findOne({
      _id: messageId,
      businessId,
      clientId,
      sender: 'bot' // Only allow feedback for bot messages
    });
    
    if (!message) {
      this.logger.warn(`Message with ID ${messageId} not found when recording feedback`);
      return; // Don't throw - just log and return
    }
    
    // Add feedback to the message metadata
    const metadata = message.metadata || {};
    metadata.feedback = {
      wasHelpful,
      feedbackText,
      timestamp: new Date()
    };
    
    // Update the message
    await this.chatbotMessageModel.updateOne(
      { _id: messageId },
      { 
        $set: { 
          metadata 
        }
      }
    );
    
    // If this message used knowledge content, update the response success rate
    if (metadata.sourceId && (metadata.responseSource === 'knowledge' || metadata.responseSource === 'learned')) {
      try {
        await this.knowledgeBaseService.updateResponseSuccess(metadata.sourceId, wasHelpful);
      } catch (error) {
        // If the knowledge source is not found, just log it but don't fail the request
        if (error instanceof NotFoundException) {
          this.logger.warn(`Source with ID ${metadata.sourceId} not found when recording feedback`);
        } else {
          throw error;
        }
      }
    }
    
    // Log feedback for analytics
    this.logger.log(`Feedback received for message ${messageId}: ${wasHelpful ? 'Helpful' : 'Not helpful'}`);
  } catch (error) {
    this.logger.error(`Error recording message feedback: ${error.message}`, error.stack);
    throw error;
  }
}
}