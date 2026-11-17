import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenRole } from '@domain/enums/token-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: TokenRole;
  name: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<{ user: JwtPayload }>().user,
);
