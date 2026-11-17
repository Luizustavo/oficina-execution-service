import {
  ForbiddenException,
  ExecutionContext,
  CanActivate,
  Injectable,
} from '@nestjs/common';
import { ROLES_KEY } from '@infrastructure/presentation/decorators/roles.decorator';
import { TokenRole } from '@domain/enums/token-role.enum';
import { Reflector } from '@nestjs/core';

/** Rota sem `@Roles` aceita qualquer papel da equipe, mas nunca o cliente: ele só entra onde foi listado. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role: TokenRole } }>();
    if (!user) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<
      TokenRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const allowed = requiredRoles?.length
      ? requiredRoles.includes(user.role)
      : user.role !== TokenRole.CUSTOMER;

    if (!allowed) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }
    return true;
  }
}
