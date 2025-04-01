# CLAUDE.md - Guidelines for Omni-Stack Gateway Project

## Commands
- **Build**: `yarn build` or `npm run build`
- **Start**: `yarn start:dev` or `npm run start:dev` (with watch mode)
- **Lint**: `yarn lint` or `npm run lint`
- **Format**: `yarn format` or `npm run format`
- **Test**: `yarn test` or `npm run test` 
- **Test single file**: `yarn test path/to/file.spec.ts` or `jest path/to/file.spec.ts`
- **Test watch mode**: `yarn test:watch` or `npm run test:watch`
- **Test coverage**: `yarn test:cov` or `npm run test:cov`
- **E2E tests**: `yarn test:e2e` or `npm run test:e2e`

## Code Style Guidelines
- **Formatting**: Single quotes, trailing commas
- **Imports**: Group by type (nestjs, third-party, local) with a blank line between groups
- **Types**: Use TypeScript interfaces and DTOs for data validation
- **Naming**: Use camelCase for variables/methods, PascalCase for classes/interfaces
- **Error Handling**: Use NestJS exception filters and class-validator for validation
- **Structure**: Follow NestJS module organization with controllers and services
- **Documentation**: Use JSDoc comments and OpenAPI decorators for API endpoints