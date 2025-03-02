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
        href: '/team-leader',
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
        href: '/team-leader',
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
        href: '/team-leader',
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
        icon: null,
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
            }
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
            }
        ],
    },
    {
        title: 'Staff Management',
        href: '/staff-management',
        icon: null,
        sub: [
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
                title: 'Attendance records',
                href: '/shifts/attendance-record',
                icon: null,
            }
        ],
    },
    {
        title: 'Settings',
        href: '/settings',
        icon: null,
    }
];