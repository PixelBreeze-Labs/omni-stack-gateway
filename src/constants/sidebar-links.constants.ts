// src/constants/sidebar-links.constants.ts
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

export const clientLinks: SideLink[] = [
    {
        title: 'Dashboard',
        href: '/client-portal/dashboard',
        icon: null, // Icons will be added by the frontend
    },
    {
        title: 'My Services',
        href: '/client-portal',
        icon: null,
        sub: [
            {
                title: 'Services List',
                href: '/client-portal/services',
                icon: null,
            },
            {
                title: 'Service History',
                href: '/client-portal/services/history',
                icon: null,
            },
            {
                title: 'Service Requests',
                href: '/client-portal/service-requests',
                icon: null,
            },
            {
                title: 'Weather Alerts',
                href: '/client-portal/services/weather-alerts',
                icon: null,
            }
        ],
    },
    {
        title: 'Quality & Inspections',
        href: '/client-portal',
        icon: null,
        sub: [
            {
                title: 'Inspection Sign-offs',
                href: '/client-portal/quality/inspections',
                icon: null,
            },
            {
                title: 'Quality Reports',
                href: '/client-portal/quality/reports',
                icon: null,
            },
            {
                title: 'Site Progress',
                href: '/client-portal/quality/site-progress',
                icon: null,
            },
        ],
    },
    {
        title: 'Documents',
        href: '/client-portal',
        icon: null,
        sub: [
            {
                title: 'Service Records',
                href: '/client-portal/service-records',
                icon: null,
            },
            {
                title: 'Compliance',
                href: '/client-portal/compliance',
                icon: null,
            }
        ],
    },
    {
        title: 'Invoices',
        href: '/client-portal',
        icon: null,
        sub: [
            {
                title: 'List',
                href: '/client-portal/invoices',
                icon: null,
            },
        ],
    },
    {
        title: 'Support',
        href: '/client-portal',
        icon: null,
        sub: [
            {
                title: 'Tickets',
                href: '/client-portal/support',
                icon: null,
            },
        ],
    },
];

export const teamLeaderLinks: SideLink[] = [
    {
        title: 'Dashboard',
        href: '/team-leader/dashboard',
        icon: null,
    },
    {
        title: 'Projects',
        href: '/team-leader/projects',
        icon: null,
        sub: [
            {
                title: 'Manage',
                href: '/team-leader/projects',
                icon: null,
            }
        ]
    },
    {
        title: 'Tasks',
        href: '/team-leader/tasks',
        icon: null,
        sub: [
            {
                title: 'Manage',
                href: '/team-leader/tasks',
                icon: null,
            }
        ]
    },
    {
        title: 'Time Tracking',
        href: '/team-leader/time-tracking',
        icon: null,
        sub: [
            {
                title: 'Manage',
                href: '/team-leader/time-tracking',
                icon: null,
            }
        ]
    },
    {
        title: 'Team',
        href: '/team-leader',
        icon: null,
        sub: [
            {
                title: 'Employees',
                href: '/team-leader/employees',
                icon: null,
            }
        ]
    },
    {
        title: 'Team Schedule',
        href: '/team-leader/team-schedule',
        icon: null,
    },
    {
        title: 'Quality Inspections',
        href: '/team-leader/quality-inspections',
        icon: null,
    },
    {
        title: 'Reports',
        href: '/team-leader/reports',
        icon: null,
    },
    {
        title: 'Notifications',
        href: '/team-leader/notifications',
        icon: null,
    }
];

export const operationsManagerLinks: SideLink[] = [
    {
        title: 'Dashboard',
        href: '/operations-manager/dashboard',
        icon: null,
    },
    {
        title: 'Projects',
        href: '/operations-manager',
        icon: null,
        sub: [
            {
                title: 'Overview',
                href: '/operations-manager/projects',
                icon: null,
            },
            {
                title: 'Create Project',
                href: '/operations-manager/projects/create',
                icon: null,
            }
        ]
    },
    {
        title: 'Resource Management',
        href: '/operations-manager',
        icon: null,
        sub: [
            {
                title: 'Staff',
                href: '/operations-manager/staff',
                icon: null,
            },
            {
                title: 'Equipment',
                href: '/operations-manager/equipment',
                icon: null,
            }
        ]
    },
    {
        title: 'Schedule',
        href: '/operations-manager/schedule',
        icon: null,
    },
    {
        title: 'Quality Control',
        href: '/operations-manager',
        icon: null,
        sub: [
            {
                title: 'Inspections',
                href: '/operations-manager/quality/inspections',
                icon: null,
            },
            {
                title: 'Reports',
                href: '/operations-manager/quality/reports',
                icon: null,
            }
        ]
    },
    {
        title: 'Analytics',
        href: '/operations-manager/analytics',
        icon: null,
    },
    {
        title: 'Client Management',
        href: '/operations-manager/clients',
        icon: null,
    }
];

export const staffLinks: SideLink[] = [
    {
        title: 'Dashboard',
        href: '/staff/dashboard',
        icon: null,
    },
    {
        title: 'My Tasks',
        href: '/staff/tasks',
        icon: null,
    },
    {
        title: 'Time Tracking',
        href: '/staff/time-tracking',
        icon: null,
    },
    {
        title: 'Schedule',
        href: '/staff/schedule',
        icon: null,
    },
    {
        title: 'Leave Requests',
        href: '/staff/leave',
        icon: null,
    },
    {
        title: 'Notifications',
        href: '/staff/notifications',
        icon: null,
    }
];

export const businessAdminLinks: SideLink[] = [
    {
        title: 'Dashboard',
        href: '/',
        icon: null, // Icons will be added by the frontend
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
                href: '/projects/weather',
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
                href: '/work-orders/list',
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
            }
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
        href: '/real-time-activity',
        icon: null,
    },
    {
        title: 'Staff Management',
        href: '/staff-management',
        icon: null,
        sub: [
            {
                title: 'Departments',
                href: '/departments',
                icon: null,
            },
            {
                title: 'Employees',
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
                href: '/shifts/list',
                icon: null,
            },
            {
                title: 'Attendance records',
                href: '/shifts/attendance-record',
                icon: null,
            },
            {
                title: 'Time Sheets',
                href: '/shifts/time-sheets',
                icon: null,
            },
            {
                title: 'Breaks',
                href: '/shifts/breaks',
                icon: null,
            }
        ],
    },
    {
        title: 'Performance Metrics',
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
                href: '/leave-management/leave-types',
                icon: null,
            },
            {
                title: 'Time-Off Requests',
                href: '/leave-management/time-off-requests',
                icon: null,
            },
            {
                title: 'Leave Dashboard',
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
                href: '/overtime/list',
                icon: null,
            },
            {
                title: 'Overtime dashboard',
                href: '/overtime/dashboard',
                icon: null,
            },
        ],
    },
    {
        title: 'Reports',
        href: '/reports',
        icon: null,
        sub: [
            {
                title: 'Productivity Reports',
                href: '/reports/productivity',
                icon: null,
            },
            {
                title: 'Attendance Reports',
                href: '/reports/attendance',
                icon: null,
            },
            {
                title: 'Service Analytics',
                href: '/admin/reports/services',
                icon: null,
            },
            {
                title: 'Client Analytics',
                href: '/admin/reports/clients',
                icon: null,
            },
            {
                title: 'Revenue Reports',
                href: '/admin/reports/revenue',
                icon: null,
            },
        ],
    },
    {
        title: 'Schedule',
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
                href: '/projects/list',
                icon: null,
            },
            {
                title: 'Tasks',
                href: '/projects/tasks',
                icon: null,
            },
            {
                title: 'Time Entries',
                href: '/projects/time-entries',
                icon: null,
            },
            {
                title: 'Milestones',
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
        href: '/configuration',
        icon: null,
        sub: [
            {
                title: 'Alerts',
                href: '/configuration/alerts',
                icon: null,
            },
            {
                title: 'Messages',
                href: '/configuration/messages',
                icon: null,
            },
            {
                title: 'Roles',
                href: '/configuration/roles',
                icon: null,
            },
        ],
    },
    {
        title: 'Audit Logs',
        href: '/audit-logs',
        icon: null,
    },
    {
        title: 'Settings',
        href: '/settings',
        icon: null,
    },
];