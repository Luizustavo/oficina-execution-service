import { requiredInProduction } from './required-in-production';

export const jwtConfig = () => ({
  jwt: {
    secret: requiredInProduction('JWT_SECRET', 'dev-jwt-secret'),
  },
});
