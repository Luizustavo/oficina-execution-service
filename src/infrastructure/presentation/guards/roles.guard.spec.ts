import { TokenRole } from '@domain/enums/token-role.enum';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const contextFor = (role?: TokenRole) =>
  ({
    switchToHttp: () => ({
      getRequest: () => (role ? { user: { role } } : {}),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => reflector.getAllAndOverride.mockReset());

  it('lets a public route through without a user', () => {
    expect(guard.canActivate(contextFor())).toBe(true);
  });

  it('allows the roles listed in @Roles', () => {
    reflector.getAllAndOverride.mockReturnValue([TokenRole.CUSTOMER]);

    expect(guard.canActivate(contextFor(TokenRole.CUSTOMER))).toBe(true);
  });

  it('denies a role not listed in @Roles', () => {
    reflector.getAllAndOverride.mockReturnValue([TokenRole.ADMIN]);

    expect(() => guard.canActivate(contextFor(TokenRole.MECHANIC))).toThrow(
      ForbiddenException,
    );
  });

  it.each([TokenRole.ADMIN, TokenRole.MECHANIC, TokenRole.ATTENDANT])(
    'lets %s into a route without @Roles',
    (role) => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      expect(guard.canActivate(contextFor(role))).toBe(true);
    },
  );

  it('denies a customer by default on a route without @Roles', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(() => guard.canActivate(contextFor(TokenRole.CUSTOMER))).toThrow(
      ForbiddenException,
    );
  });
});
