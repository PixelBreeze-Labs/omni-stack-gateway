// src/services/business-chatbot.service.ts
import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotMessage } from '../schemas/chatbot-message.schema';
import { v4 as uuidv4 } from 'uuid';
import { BusinessService } from './business.service';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';

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
    private readonly businessService: BusinessService
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
   * Generate response using simple NLP
   */
  private async generateResponse(
    message: string, 
    context: Record<string, any>,
    business: any,
    user: any
  ): Promise<{ text: string; suggestions?: { id: string; text: string }[] }> {
    const normalizedMessage = message.toLowerCase().trim();
    
    // Personalization variables
    const businessName = business?.name || 'Staffluent';
    const userName = user ? `${user.name || 'there'}` : 'there';
    
    // Extract key terms for better matching
    const keyTerms = this.extractKeyTerms(normalizedMessage);
    
    // Get conversational context
    const isFollowup = this.isFollowupQuestion(context);
    
    // Define response templates with context awareness
    const responseRules = [
      {
        keywords: ['hello', 'hi', 'hey', 'greetings', 'howdy'],
        response: {
          text: `Hello ${userName}! I'm the ${businessName} assistant. How can I help you today?`,
          suggestions: [
            { id: 'projects', text: 'Tell me about projects' },
            { id: 'tasks', text: 'Task management' },
            { id: 'timeTracking', text: 'Time tracking help' },
            { id: 'teams', text: 'Team management' }
          ]
        }
      },
      {
        keywords: ['project', 'projects'],
        response: {
          text: `${businessName} offers comprehensive project management. You can create projects, assign teams, track progress, and manage tasks.`,
          suggestions: [
            { id: 'create_project', text: 'Create a new project' },
            { id: 'view_projects', text: 'View my projects' },
            { id: 'project_reports', text: 'Project reports' }
          ]
        }
      },
      {
        keywords: ['task', 'tasks', 'todo', 'assignment', 'assign'],
        response: {
          text: `Tasks in ${businessName} can be created, assigned, prioritized, and tracked to completion.`,
          suggestions: [
            { id: 'create_task', text: 'Create a task' },
            { id: 'assign_task', text: 'Assign tasks' },
            { id: 'track_tasks', text: 'Track task completion' }
          ]
        }
      },
      {
        keywords: ['time', 'clock', 'hours', 'timesheet', 'tracking', 'attendance'],
        response: {
          text: `${businessName}'s time tracking system lets you clock in/out, manage breaks, and review timesheets.`,
          suggestions: [
            { id: 'time_clock', text: 'Clock in/out' },
            { id: 'breaks', text: 'Manage breaks' },
            { id: 'timesheets', text: 'View timesheets' }
          ]
        }
      },
      {
        keywords: ['team', 'staff', 'employee', 'member', 'personnel'],
        response: {
          text: `You can organize staff into departments and teams, assign leaders, and monitor performance.`,
          suggestions: [
            { id: 'view_team', text: 'View my team' },
            { id: 'add_member', text: 'Add team member' },
            { id: 'team_schedule', text: 'Team scheduling' }
          ]
        }
      },
      {
        keywords: ['report', 'analytics', 'metrics', 'performance', 'statistics', 'stats', 'dashboard'],
        response: {
          text: `${businessName} provides detailed analytics on productivity, project progress, task completion, and more.`,
          suggestions: [
            { id: 'performance_reports', text: 'Performance reports' },
            { id: 'time_reports', text: 'Time & attendance reports' },
            { id: 'export_data', text: 'Export data' }
          ]
        }
      },
      {
        keywords: ['field', 'service', 'field service', 'location', 'site', 'remote'],
        response: {
          text: `Field service features help you manage operations outside the office, including location tracking and service scheduling.`,
          suggestions: [
            { id: 'field_locations', text: 'Field locations' },
            { id: 'service_schedule', text: 'Service scheduling' },
            { id: 'field_reporting', text: 'Field reporting' }
          ]
        }
      },
      {
        keywords: ['client', 'customer', 'account', 'portal'],
        response: {
          text: `${businessName} helps you manage client relationships, track communications, and handle client requests.`,
          suggestions: [
            { id: 'add_client', text: 'Add a client' },
            { id: 'client_portal', text: 'Client portal features' },
            { id: 'client_invoices', text: 'Client invoicing' }
          ]
        }
      },
      {
        keywords: ['help', 'support', 'assistance', 'guide', 'tutorial', 'how to', 'how do i'],
        response: {
          text: `I can help with managing projects, tracking time, organizing teams, and more. What do you need help with?`,
          suggestions: [
            { id: 'projects_help', text: 'Projects help' },
            { id: 'tasks_help', text: 'Tasks help' },
            { id: 'time_help', text: 'Time tracking help' },
            { id: 'teams_help', text: 'Team management help' }
          ]
        }
      },
      {
        keywords: ['auto', 'assign', 'automatic', 'assignment', 'auto-assign'],
        response: {
          text: `${businessName} has auto-assignment capabilities that can automatically assign tasks to the most suitable team members based on skills, workload, and availability.`,
          suggestions: [
            { id: 'auto_assign_setup', text: 'Set up auto-assignment' },
            { id: 'auto_assign_trigger', text: 'Trigger auto-assignment' },
            { id: 'pending_approvals', text: 'Pending approvals' }
          ]
        }
      },
      {
        keywords: ['quality', 'inspection', 'compliance', 'safety', 'audit'],
        response: {
          text: `${businessName}'s quality control features help you conduct inspections, ensure compliance with standards, and maintain safety protocols.`,
          suggestions: [
            { id: 'create_inspection', text: 'Create inspection' },
            { id: 'compliance_report', text: 'Compliance report' },
            { id: 'safety_checklist', text: 'Safety checklists' }
          ]
        }
      },
      {
        keywords: ['equipment', 'asset', 'tool', 'inventory', 'maintenance'],
        response: {
          text: `${businessName} includes equipment management for tracking assets, scheduling maintenance, and monitoring usage.`,
          suggestions: [
            { id: 'track_equipment', text: 'Track equipment' },
            { id: 'maintenance_schedule', text: 'Maintenance schedule' },
            { id: 'equipment_assignment', text: 'Equipment assignment' }
          ]
        }
      }
    ];

    // Check for context-specific responses based on current view
    if (context?.currentView) {
      const viewResponses = this.getViewSpecificResponses(context.currentView, business?.operationType, userName);
      // Only return view response for greeting or help requests
      if (viewResponses && (normalizedMessage.includes('hello') || normalizedMessage.includes('hi') || 
          normalizedMessage.includes('help') || normalizedMessage.length < 5)) {
        return viewResponses;
      }
    }

    // Find best matching response based on keyword relevance
    let bestMatch = null;
    let highestScore = 0;
    
    for (const rule of responseRules) {
      const score = this.calculateRelevanceScore(keyTerms, rule.keywords);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = rule;
      }
    }
    
    // If we found a reasonable match, use it
    if (bestMatch && highestScore > 0.3) {
      // If this appears to be a follow-up question, adapt the response style
      if (isFollowup) {
        const response = { ...bestMatch.response };
        // Remove greeting prefixes for follow-up questions
        response.text = response.text.replace(`Hello ${userName}! `, '').replace(`Hi there! `, '');
        return response;
      }
      return bestMatch.response;
    }

    // See if this is asking about something specific like "how to create a project"
    const specificResponses = this.checkForSpecificQuestions(normalizedMessage);
    if (specificResponses) {
      return specificResponses;
    }

    // Default response if no good match
    return {
      text: `I'm not sure I understand your question about "${message}". Could you try rephrasing or select one of these options?`,
      suggestions: [
        { id: 'help', text: 'Show all help topics' },
        { id: 'projects', text: 'Projects' },
        { id: 'tasks', text: 'Tasks' },
        { id: 'time', text: 'Time tracking' }
      ]
    };
  }

  /**
   * Check if this is a follow-up question based on conversation history
   */
  private isFollowupQuestion(context: Record<string, any>): boolean {
    if (!context?.conversationHistory || context.conversationHistory.length < 2) {
      return false;
    }

    // Check if there's a recent exchange in the last few messages
    const recentMessages = context.conversationHistory.slice(-3);
    const hasRecentBotMessage = recentMessages.some(msg => msg.sender === 'bot');
    const hasRecentUserMessage = recentMessages.some(msg => msg.sender === 'user');

    return hasRecentBotMessage && hasRecentUserMessage;
  }

  /**
   * Check for specific how-to questions
   */
  private checkForSpecificQuestions(message: string): { text: string; suggestions?: { id: string; text: string }[] } | null {
    const howToCreate = /how\s+(?:do\s+i|to|can\s+i)\s+create\s+(?:a|an)?\s+(\w+)/i;
    const howToManage = /how\s+(?:do\s+i|to|can\s+i)\s+manage\s+(?:a|an)?\s+(\w+)/i;
    const howToTrack = /how\s+(?:do\s+i|to|can\s+i)\s+track\s+(?:a|an)?\s+(\w+)/i;
    
    let match;
    
    if ((match = howToCreate.exec(message)) !== null) {
      const item = match[1].toLowerCase();
      if (item === 'project' || item === 'projects') {
        return {
          text: "To create a new project, go to the Projects section and click the 'Create Project' button. You'll need to fill in project details such as name, description, start and end dates, and assign team members.",
          suggestions: [
            { id: 'project_template', text: 'Use project template' },
            { id: 'project_settings', text: 'Project settings' }
          ]
        };
      } else if (item === 'task' || item === 'tasks') {
        return {
          text: "To create a task, navigate to the Tasks section and click 'New Task'. You can set a name, description, due date, priority level, and assign it to team members.",
          suggestions: [
            { id: 'task_priority', text: 'Set task priority' },
            { id: 'task_assignment', text: 'Task assignment' }
          ]
        };
      } else if (item === 'team' || item === 'teams') {
        return {
          text: "To create a new team, go to the Team Management section and select 'Create Team'. You'll need to provide a team name, select a department, and add team members.",
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
          text: "To manage projects, use the Projects dashboard where you can track progress, update status, manage tasks, assign team members, and monitor timelines.",
          suggestions: [
            { id: 'project_progress', text: 'Update project progress' },
            { id: 'project_team', text: 'Manage project team' }
          ]
        };
      } else if (item === 'team' || item === 'teams') {
        return {
          text: "Team management is done through the Teams section. Here you can organize team members, assign roles, monitor performance, and handle scheduling.",
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
          text: "Time tracking can be done using the Time & Attendance module. You can clock in/out, log breaks, and record time spent on specific tasks or projects.",
          suggestions: [
            { id: 'time_reports', text: 'Time reports' },
            { id: 'timesheet', text: 'View timesheets' }
          ]
        };
      } else if (item === 'progress' || item === 'status') {
        return {
          text: "You can track progress in the Projects section by updating completion percentages, milestone achievements, and task statuses. Reports provide visual representations of progress.",
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
   * Extract key terms from message for better matching
   */
  private extractKeyTerms(message: string): string[] {
    // Remove common words and punctuation
    const stopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
                       'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 
                       'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such', 
                       'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 
                       'can', 'will', 'just', 'should', 'now', 'about', 'what', 'which'];
    
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/) // Split by whitespace
      .filter(word => word.length > 2 && !stopWords.includes(word)); // Remove stop words and short words
    
    return [...new Set(words)]; // Remove duplicates
  }

  /**
   * Calculate relevance score between message terms and rule keywords
   */
  private calculateRelevanceScore(terms: string[], keywords: string[]): number {
    if (!terms.length || !keywords.length) return 0;
    
    let matches = 0;
    const expandedKeywords = keywords.flatMap(keyword => 
      keyword.includes(' ') ? [keyword, ...keyword.split(' ')] : [keyword]
    );
    
    // Count matching terms
    for (const term of terms) {
      if (expandedKeywords.some(keyword => keyword.includes(term) || term.includes(keyword))) {
        matches++;
      }
    }
    
    // Exact phrase matching (higher score)
    for (const keyword of keywords) {
      if (keyword.includes(' ')) {
        const words = keyword.split(' ');
        let allWordsMatch = true;
        
        for (const word of words) {
          if (!terms.includes(word)) {
            allWordsMatch = false;
            break;
          }
        }
        
        if (allWordsMatch) {
          matches += words.length; // Bonus for multi-word phrases
        }
      }
    }
    
    // Calculate score based on term coverage and keyword relevance
    return matches / (terms.length + expandedKeywords.length / 2);
  }

  /**
   * Get responses specific to the current view
   */
  private getViewSpecificResponses(
    currentView: string, 
    businessType: string = 'hybrid',
    userName: string = 'there'
  ): { text: string; suggestions?: { id: string; text: string }[] } | null {
    // Response suggestions based on current view
    const viewResponses = {
      'dashboard': {
        text: `Hello ${userName}! You're currently on the Dashboard. Here you can see key metrics and an overview of your business activities.`,
        suggestions: [
          { id: 'dashboard_metrics', text: 'Explain dashboard metrics' },
          { id: 'performance_overview', text: 'Performance overview' }
        ]
      },
      'projects': {
        text: `You're in the Projects section. Here you can manage all your projects and their details.`,
        suggestions: [
          { id: 'create_project', text: 'Create a new project' },
          { id: 'project_status', text: 'Update project status' }
        ]
      },
      'tasks': {
        text: `You're in the Tasks section. Here you can create, assign, and track tasks across your team.`,
        suggestions: [
          { id: 'create_task', text: 'Create a new task' },
          { id: 'assign_task', text: 'Assign a task' }
        ]
      },
      'team': {
        text: `You're in the Team section. Here you can manage your team members and their assignments.`,
        suggestions: [
          { id: 'add_member', text: 'Add team member' },
          { id: 'team_schedule', text: 'Team scheduling' }
        ]
      },
      'time': {
        text: `You're in the Time Tracking section. Here you can manage attendance and timesheets.`,
        suggestions: [
          { id: 'time_entry', text: 'Enter time' },
          { id: 'view_timesheets', text: 'View timesheets' }
        ]
      },
      'field': {
        text: `You're in the Field Operations section. Here you can manage field services and remote teams.`,
        suggestions: [
          { id: 'field_map', text: 'View field map' },
          { id: 'field_staff', text: 'Field staff' }
        ]
      },
      'clients': {
        text: `You're in the Client Management section. Here you can manage client accounts and relationships.`,
        suggestions: [
          { id: 'add_client', text: 'Add new client' },
          { id: 'client_invoices', text: 'Client invoices' }
        ]
      },
      'autoAssignment': {
        text: `You're in the Auto Assignment section. Here you can configure how tasks are automatically assigned to team members.`,
        suggestions: [
          { id: 'configure_weights', text: 'Configure assignment weights' },
          { id: 'pending_approvals', text: 'View pending approvals' },
          { id: 'assignment_history', text: 'View assignment history' }
        ]
      },
      'equipment': {
        text: `You're in the Equipment Management section. Here you can track assets, schedule maintenance, and manage equipment assignments.`,
        suggestions: [
          { id: 'add_equipment', text: 'Add equipment' },
          { id: 'maintenance', text: 'Schedule maintenance' },
          { id: 'equipment_logs', text: 'Equipment logs' }
        ]
      },
      'quality': {
        text: `You're in the Quality Control section. Here you can manage inspections, compliance, and safety protocols.`,
        suggestions: [
          { id: 'create_inspection', text: 'Create inspection' },
          { id: 'compliance_report', text: 'Compliance report' },
          { id: 'safety_checklist', text: 'Safety checklists' }
        ]
      },
      'reports': {
        text: `You're in the Reports section. Here you can generate and view analytics on various aspects of your business.`,
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
}