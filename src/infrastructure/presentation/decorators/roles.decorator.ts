import { TokenRole } from '@domain/enums/token-role.enum';
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: TokenRole[]) => SetMetadata(ROLES_KEY, roles);
