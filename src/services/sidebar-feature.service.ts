// src/services/sidebar-feature.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { FeatureAccessService } from './feature-access.service';
import { STAFFLUENT_FEATURES } from '../constants/features.constants';

export interface NavLink {
    title: string;
    href: string;
    icon?: any;
    label?: string;
}

export interface SideLink extends NavLink {
    sub?: NavLink[];
    label?: string;
}

@Injectable()
export class SidebarFeatureService {
    private readonly logger = new Logger(SidebarFeatureService.name);

    constructor(private featureAccessService: FeatureAccessService) {}

    /**
     * Get sidebar links based on available features for a business
     */
    async getBusinessSidebarLinks(businessId: string): Promise<SideLink[]> {
        // Get available features for the business
        const availableFeatures = await this.featureAccessService.getBusinessFeatures(businessId);

        // This array contains items that should always be available regardless of subscription
        const alwaysAvailableLinks = [
            'Dashboard',
            'Settings',
            'Audit Logs'
        ];

        // Create a mapping of sidebar items to features
        const sidebarFeatureMap = this.getSidebarFeatureMap();

        // Generate sidebar links based on available features
        return this.filterSidebarLinks(this.getFullSidebarStructure(), availableFeatures, sidebarFeatureMap, alwaysAvailableLinks);
    }

    /**
     * Get the full sidebar structure (this should match the businessLinks array)
     */
    private getFullSidebarStructure(): SideLink[] {
        return [
            {
                title: 'Dashboard',
                href: '/',
                icon: null, // icons will be handled on the frontend
            },
            {
                title: 'Service Management',
                href: 'services',
                icon: null,
                sub: [
                    {
                        title: 'Services',
                        href: '/admin/services',
                        icon: null,
                    },
                    {
                        title: 'Categories',
                        href: '/admin/services/categories',
                        icon: null,
                    },
                    {
                        title: 'Service Requests',
                        href: '/admin/services/requests',
                        icon: null,
                    },
                    {
                        title: 'Quality Verification',
                        href: '/services/verification',
                        icon: null,
                    },
                    {
                        title: 'Weather Monitoring',
                        href: '/services/weather-monitoring',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Work Orders',
                href: 'work-orders',
                icon: null,
                sub: [
                    {
                        title: 'Orders',
                        href: '/work-orders',
                        icon: null,
                    },
                    {
                        title: 'Settings',
                        href: '/work-orders/settings',
                        icon: null,
                    },
                    {
                        title: 'Reports',
                        href: '/work-orders/reports',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Client Management',
                href: 'clients',
                icon: null,
                sub: [
                    {
                        title: 'Client List',
                        href: '/admin/clients',
                        icon: null,
                    },
                    {
                        title: 'Client Projects',
                        href: '/admin/clients/projects',
                        icon: null,
                    },
                    {
                        title: 'Client Feedback',
                        href: '/admin/clients/feedback',
                        icon: null,
                    },
                    {
                        title: 'Client Sign-offs',
                        href: '/admin/clients/client-sign-off',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Invoice Management',
                href: 'invoices',
                icon: null,
                sub: [
                    {
                        title: 'All Invoices',
                        href: '/admin/invoices',
                        icon: null,
                    },
                    {
                        title: 'Generate Invoice',
                        href: '/admin/invoices/create',
                        icon: null,
                    },
                    {
                        title: 'Payment History',
                        href: '/admin/invoices/payments',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Real-Time Activity',
                label: '',
                href: '/real-time-activity',
                icon: null,
            },
            {
                title: 'Staff Management',
                label: '',
                href: '/staff-management',
                icon: null,
                sub: [
                    {
                        title: 'Departments',
                        label: '',
                        href: '/departments',
                        icon: null,
                    },
                    {
                        title: 'Employees',
                        label: '',
                        href: '/employees',
                        icon: null,
                    },
                    {
                        title: 'Teams',
                        href: '/teams',
                        icon: null,
                    },
                    {
                        title: 'Shifts',
                        label: '',
                        href: '/shifts/list',
                        icon: null,
                    },
                    {
                        title: 'Attendance records',
                        label: '',
                        href: '/shifts/attendance-record',
                        icon: null,
                    },
                    {
                        title: 'Time Sheets',
                        label: '',
                        href: '/shifts/time-sheets',
                        icon: null,
                    },
                    {
                        title: 'Breaks',
                        label: '',
                        href: '/shifts/breaks',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Performance Metrics',
                label: '',
                href: '/performance-metrics',
                icon: null,
            },
            {
                title: 'Support',
                href: '/support',
                icon: null,
                sub: [
                    {
                        title: 'Tickets',
                        label: '',
                        href: '/admin/support/tickets',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Leave Management',
                href: '/leave-management',
                icon: null,
                sub: [
                    {
                        title: 'Leave Types',
                        label: '',
                        href: '/leave-management/leave-types',
                        icon: null,
                    },
                    {
                        title: 'Time-Off Requests',
                        label: '',
                        href: '/leave-management/time-off-requests',
                        icon: null,
                    },
                    {
                        title: 'Leave Dashboard',
                        label: '',
                        href: '/leave-management/dashboard',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Overtime',
                href: '/overtime',
                icon: null,
                sub: [
                    {
                        title: 'List',
                        label: '',
                        href: '/overtime/list',
                        icon: null,
                    },
                    {
                        title: 'Overtime dashboard',
                        label: '',
                        href: '/overtime/dashboard',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Reports',
                label: '',
                href: '/reports',
                icon: null,
                sub: [
                    {
                        title: 'Productivity Reports',
                        label: '',
                        href: '/reports/productivity',
                        icon: null,
                    },
                    {
                        title: 'Attendance Reports',
                        label: '',
                        href: '/reports/attendance',
                        icon: null,
                    },
                    {
                        title: 'Service Analytics',
                        label: '',
                        href: '/admin/reports/services',
                        icon: null,
                    },
                    {
                        title: 'Client Analytics',
                        label: '',
                        href: '/admin/reports/clients',
                        icon: null,
                    },
                    {
                        title: 'Revenue Reports',
                        label: '',
                        href: '/admin/reports/revenue',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Schedule',
                label: '',
                href: '/schedule',
                icon: null,
            },
            {
                title: 'Quality Control',
                href: '/quality-control',
                icon: null,
                sub: [
                    {
                        title: 'Compliance',
                        label: '',
                        href: '/compliance',
                        icon: null,
                    },
                    {
                        title: 'Inspection Checklists',
                        href: '/quality-control/checklists',
                        icon: null,
                    },
                    {
                        title: 'Quality Metrics',
                        href: '/quality-control/metrics',
                        icon: null,
                    },
                    {
                        title: 'Safety Audits',
                        href: '/quality-control/safety-audits',
                        icon: null,
                    },
                    {
                        title: 'Code Compliance',
                        href: '/quality-control/compliance',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Equipment Management',
                href: '/equipment',
                icon: null,
                sub: [
                    {
                        title: 'Asset Tracking',
                        href: '/equipment/tracking',
                        icon: null,
                    },
                    {
                        title: 'Maintenance Schedule',
                        href: '/equipment/maintenance',
                        icon: null,
                    },
                    {
                        title: 'Usage Monitoring',
                        href: '/equipment/monitoring',
                        icon: null,
                    },
                    {
                        title: 'Equipment Assignment',
                        href: '/equipment/assignment',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Field Operations',
                href: '/field-ops',
                icon: null,
                sub: [
                    {
                        title: 'Team Location',
                        href: '/field-ops/location',
                        icon: null,
                    },
                    {
                        title: 'Route Planning',
                        href: '/field-ops/routes',
                        icon: null,
                    },
                    {
                        title: 'Service Areas',
                        href: '/field-ops/service-areas',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Site Management',
                href: '/sites',
                icon: null,
                sub: [
                    {
                        title: 'Sites Overview',
                        href: '/sites/overview',
                        icon: null,
                    },
                    {
                        title: 'Site Configuration',
                        href: '/sites/configuration',
                        icon: null,
                    },
                    {
                        title: 'Resource Allocation',
                        href: '/sites/resources',
                        icon: null,
                    },
                    {
                        title: 'Site Monitoring',
                        href: '/sites/monitoring',
                        icon: null,
                    },
                    {
                        title: 'Site Documentation',
                        href: '/sites/documents',
                        icon: null,
                    },
                    {
                        title: 'Site Access Control',
                        href: '/sites/access',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Project Management',
                href: '/projects',
                icon: null,
                sub: [
                    {
                        title: 'Projects',
                        label: '',
                        href: '/projects/list',
                        icon: null,
                    },
                    {
                        title: 'Tasks',
                        label: '',
                        href: '/projects/tasks',
                        icon: null,
                    },
                    {
                        title: 'Time Entries',
                        label: '',
                        href: '/projects/time-entries',
                        icon: null,
                    },
                    {
                        title: 'Construction Milestones',
                        href: '/projects/milestones',
                        icon: null,
                    },
                    {
                        title: 'Site Workflows',
                        href: '/projects/workflows',
                        icon: null,
                    },
                    {
                        title: 'Material Tracking',
                        href: '/projects/materials',
                        icon: null,
                    },
                    {
                        title: 'Weather Monitoring',
                        href: '/projects/weather',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Supply Management',
                href: '/supply-management',
                icon: null,
                sub: [
                    {
                        title: 'Inventory',
                        href: '/supply-management/inventory',
                        icon: null,
                    },
                    {
                        title: 'Equipment Allocation',
                        href: '/supply-management/allocation',
                        icon: null,
                    },
                    {
                        title: 'Usage Monitoring',
                        href: '/supply-management/usage',
                        icon: null,
                    },
                    {
                        title: 'Cost Tracking',
                        href: '/supply-management/costs',
                        icon: null,
                    },
                    {
                        title: 'Suppliers',
                        href: '/supply-management/suppliers',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Safety Management',
                href: '/safety',
                icon: null,
                sub: [
                    {
                        title: 'Barrier Management',
                        href: '/safety/barriers',
                        icon: null,
                    },
                    {
                        title: 'OSHA Compliance',
                        href: '/safety/osha',
                        icon: null,
                    },
                    {
                        title: 'ADA Compliance',
                        href: '/safety/ada',
                        icon: null,
                    },
                    {
                        title: 'Site Safety Maps',
                        href: '/safety/maps',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Analytics & Reports',
                href: '/reports',
                icon: null,
                sub: [
                    {
                        title: 'Quality Metrics',
                        href: '/reports/quality',
                        icon: null,
                    },
                    {
                        title: 'Equipment Usage',
                        href: '/reports/equipment',
                        icon: null,
                    },
                    {
                        title: 'Safety Compliance',
                        href: '/reports/safety',
                        icon: null,
                    },
                    {
                        title: 'Site Performance',
                        href: '/reports/sites',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Configuration',
                label: '',
                href: '/configuration',
                icon: null,
                sub: [
                    {
                        title: 'Alerts',
                        label: '',
                        href: '/configuration/alerts',
                        icon: null,
                    },
                    {
                        title: 'Messages',
                        label: '',
                        href: '/configuration/messages',
                        icon: null,
                    },
                    {
                        title: 'Roles',
                        label: '',
                        href: '/configuration/roles',
                        icon: null,
                    },
                ],
            },
            {
                title: 'Audit Logs',
                label: '',
                href: '/audit-logs',
                icon: null,
            },
            {
                title: 'Settings',
                label: '',
                href: '/settings',
                icon: null,
            },
        ];
    }

    /**
     * Get mapping between sidebar items and features
     */
    private getSidebarFeatureMap(): Record<string, string[]> {
        return {
            // Dashboard is always available
            'Dashboard': [],

            // Service Management
            'Service Management': [STAFFLUENT_FEATURES.ADVANCED_PROJECT_MANAGEMENT],
            'Services': [STAFFLUENT_FEATURES.ADVANCED_PROJECT_MANAGEMENT],
            'Categories': [STAFFLUENT_FEATURES.ADVANCED_PROJECT_MANAGEMENT],
            'Service Requests': [STAFFLUENT_FEATURES.SERVICE_REQUEST_PROCESSING],
            'Quality Verification': [STAFFLUENT_FEATURES.ADVANCED_QUALITY_CONTROL],
            'Weather Monitoring': [STAFFLUENT_FEATURES.WEATHER_MONITORING],

            // Work Orders
            'Work Orders': [STAFFLUENT_FEATURES.BASIC_WORK_ORDER_MANAGEMENT],
            'Orders': [STAFFLUENT_FEATURES.BASIC_WORK_ORDER_MANAGEMENT],
            'Work Orders Settings': [STAFFLUENT_FEATURES.ADVANCED_WORK_ORDER_MANAGEMENT],
            'Work Orders Reports': [STAFFLUENT_FEATURES.ADVANCED_WORK_ORDER_MANAGEMENT],

            // Client Management
            'Client Management': [STAFFLUENT_FEATURES.CLIENT_LIST],
            'Client List': [STAFFLUENT_FEATURES.CLIENT_LIST],
            'Client Projects': [STAFFLUENT_FEATURES.CLIENT_PROJECTS],
            'Client Feedback': [STAFFLUENT_FEATURES.CLIENT_FEEDBACK],
            'Client Sign-offs': [STAFFLUENT_FEATURES.CLIENT_SIGN_OFFS],

            // Invoice Management
            'Invoice Management': [STAFFLUENT_FEATURES.BASIC_INVOICE_MANAGEMENT],
            'All Invoices': [STAFFLUENT_FEATURES.BASIC_INVOICE_MANAGEMENT],
            'Generate Invoice': [STAFFLUENT_FEATURES.BASIC_INVOICE_MANAGEMENT],
            'Payment History': [STAFFLUENT_FEATURES.PAYMENT_TRACKING],

            // Activity & Staff
            'Real-Time Activity': [STAFFLUENT_FEATURES.ADVANCED_COMMUNICATION],
            'Staff Management': [STAFFLUENT_FEATURES.BASIC_TEAM_MANAGEMENT],
            'Departments': [STAFFLUENT_FEATURES.DEPARTMENT_MANAGEMENT],
            'Employees': [STAFFLUENT_FEATURES.BASIC_TEAM_MANAGEMENT],
            'Teams': [STAFFLUENT_FEATURES.BASIC_TEAM_MANAGEMENT],
            'Shifts': [STAFFLUENT_FEATURES.BASIC_SCHEDULING],
            'Attendance records': [STAFFLUENT_FEATURES.BASIC_TIME_TRACKING],
            'Time Sheets': [STAFFLUENT_FEATURES.TIMESHEET_MANAGEMENT],
            'Breaks': [STAFFLUENT_FEATURES.BREAK_MANAGEMENT],

            // Performance & Support
            'Performance Metrics': [STAFFLUENT_FEATURES.PERFORMANCE_METRICS],
            'Support': [STAFFLUENT_FEATURES.STANDARD_SUPPORT],
            'Tickets': [STAFFLUENT_FEATURES.SUPPORT_TICKET_SYSTEM],

            // Leave & Overtime
            'Leave Management': [STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT],
            'Leave Types': [STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT],
            'Time-Off Requests': [STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT],
            'Leave Dashboard': [STAFFLUENT_FEATURES.ADVANCED_LEAVE_MANAGEMENT],
            'Overtime': [STAFFLUENT_FEATURES.OVERTIME_MANAGEMENT],
            'Overtime List': [STAFFLUENT_FEATURES.OVERTIME_MANAGEMENT],
            'Overtime dashboard': [STAFFLUENT_FEATURES.OVERTIME_MANAGEMENT],

            // Reports
            'Reports': [STAFFLUENT_FEATURES.BASIC_REPORTS],
            'Productivity Reports': [STAFFLUENT_FEATURES.ADVANCED_REPORTS],
            'Attendance Reports': [STAFFLUENT_FEATURES.ADVANCED_REPORTS],
            'Service Analytics': [STAFFLUENT_FEATURES.CUSTOM_ANALYTICS],
            'Client Analytics': [STAFFLUENT_FEATURES.CUSTOM_ANALYTICS],
            'Revenue Reports': [STAFFLUENT_FEATURES.CUSTOM_ANALYTICS],

            // Schedule
            'Schedule': [STAFFLUENT_FEATURES.BASIC_SCHEDULING],

            // Quality Control
            'Quality Control': [STAFFLUENT_FEATURES.BASIC_QUALITY_CONTROL],
            'Compliance': [STAFFLUENT_FEATURES.COMPLIANCE_MONITORING],
            'Inspection Checklists': [STAFFLUENT_FEATURES.INSPECTION_CHECKLISTS],
            'Quality Metrics': [STAFFLUENT_FEATURES.QUALITY_METRICS_DASHBOARD],
            'Safety Audits': [STAFFLUENT_FEATURES.SAFETY_AUDIT],
            'Code Compliance': [STAFFLUENT_FEATURES.CODE_COMPLIANCE],

            // Equipment Management
            'Equipment Management': [STAFFLUENT_FEATURES.BASIC_EQUIPMENT_MANAGEMENT],
            'Asset Tracking': [STAFFLUENT_FEATURES.EQUIPMENT_TRACKING],
            'Maintenance Schedule': [STAFFLUENT_FEATURES.MAINTENANCE_SCHEDULING],
            'Usage Monitoring': [STAFFLUENT_FEATURES.USAGE_MONITORING],
            'Equipment Assignment': [STAFFLUENT_FEATURES.EQUIPMENT_ASSIGNMENT],

            // Field Operations
            'Field Operations': [STAFFLUENT_FEATURES.BASIC_FIELD_OPERATIONS],
            'Team Location': [STAFFLUENT_FEATURES.ADVANCED_FIELD_OPERATIONS],
            'Route Planning': [STAFFLUENT_FEATURES.ROUTE_OPTIMIZATION],
            'Service Areas': [STAFFLUENT_FEATURES.SERVICE_AREA_MAPPING],

            // Site Management
            'Site Management': [STAFFLUENT_FEATURES.BASIC_SITE_MANAGEMENT],
            'Sites Overview': [STAFFLUENT_FEATURES.BASIC_SITE_MANAGEMENT],
            'Site Configuration': [STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT],
            'Resource Allocation': [STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT],
            'Site Monitoring': [STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT],
            'Site Documentation': [STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT],
            'Site Access Control': [STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT],

            // Project Management
            'Project Management': [STAFFLUENT_FEATURES.BASIC_PROJECT_MANAGEMENT],
            'Projects': [STAFFLUENT_FEATURES.BASIC_PROJECT_MANAGEMENT],
            'Tasks': [STAFFLUENT_FEATURES.BASIC_TASK_MANAGEMENT],
            'Time Entries': [STAFFLUENT_FEATURES.ADVANCED_TIME_TRACKING],
            'Construction Milestones': [STAFFLUENT_FEATURES.CONSTRUCTION_MILESTONE_TRACKING],
            'Site Workflows': [STAFFLUENT_FEATURES.SITE_WORKFLOW_MANAGEMENT],
            'Material Tracking': [STAFFLUENT_FEATURES.MATERIAL_TRACKING],
            'Weather Monitoring Projects': [STAFFLUENT_FEATURES.WEATHER_MONITORING],

            // Supply Management
            'Supply Management': [STAFFLUENT_FEATURES.BASIC_SUPPLY_MANAGEMENT],
            'Inventory': [STAFFLUENT_FEATURES.BASIC_SUPPLY_MANAGEMENT],
            'Equipment Allocation': [STAFFLUENT_FEATURES.ADVANCED_SUPPLY_MANAGEMENT],
            'Usage Monitoring Supply': [STAFFLUENT_FEATURES.ADVANCED_SUPPLY_MANAGEMENT],
            'Cost Tracking': [STAFFLUENT_FEATURES.ADVANCED_SUPPLY_MANAGEMENT],
            'Suppliers': [STAFFLUENT_FEATURES.ADVANCED_SUPPLY_MANAGEMENT],

            // Safety Management
            'Safety Management': [STAFFLUENT_FEATURES.SAFETY_MANAGEMENT],
            'Barrier Management': [STAFFLUENT_FEATURES.BARRIER_MANAGEMENT],
            'OSHA Compliance': [STAFFLUENT_FEATURES.OSHA_COMPLIANCE],
            'ADA Compliance': [STAFFLUENT_FEATURES.ADA_COMPLIANCE],
            'Site Safety Maps': [STAFFLUENT_FEATURES.SITE_SAFETY_MAPPING],

            // Analytics & Reports
            'Analytics & Reports': [STAFFLUENT_FEATURES.ADVANCED_REPORTS],
            'Quality Metrics Reports': [STAFFLUENT_FEATURES.QUALITY_METRICS_DASHBOARD],
            'Equipment Usage': [STAFFLUENT_FEATURES.USAGE_MONITORING],
            'Safety Compliance Reports': [STAFFLUENT_FEATURES.COMPLIANCE_MONITORING],
            'Site Performance': [STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT],

            // Configuration & Settings
            'Configuration': [STAFFLUENT_FEATURES.BASIC_AUDIT_LOGS],
            'Alerts': [STAFFLUENT_FEATURES.ADVANCED_AUDIT_LOGS],
            'Messages': [STAFFLUENT_FEATURES.ADVANCED_COMMUNICATION],
            'Roles': [STAFFLUENT_FEATURES.ROLE_MANAGEMENT],

            // Audit & Settings (always available)
            'Audit Logs': [],
            'Settings': [],
        };
    }

    /**
     * Filter sidebar links based on available features
     */
    private filterSidebarLinks(
        links: SideLink[],
        availableFeatures: string[],
        featureMap: Record<string, string[]>,
        alwaysAvailable: string[]
    ): SideLink[] {
        return links.filter(link => {
            // Check if link should always be available
            if (alwaysAvailable.includes(link.title)) {
                return true;
            }

            // Check if link has required features
            const requiredFeatures = featureMap[link.title] || [];
            const hasAccess = requiredFeatures.length === 0 ||
                requiredFeatures.some(feature => availableFeatures.includes(feature));

            if (!hasAccess) {
                return false;
            }

            // If link has sub-links, filter them too
            if (link.sub && link.sub.length > 0) {
                link.sub = link.sub.filter(subLink => {
                    const subFeatures = featureMap[subLink.title] || [];
                    return subFeatures.length === 0 ||
                        subFeatures.some(feature => availableFeatures.includes(feature));
                });

                // Only include link if it has at least one accessible sub-link
                return link.sub.length > 0;
            }

            return true;
        });
    }
}