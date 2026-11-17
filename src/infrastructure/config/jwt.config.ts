export const jwtConfig = () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
  },
});
