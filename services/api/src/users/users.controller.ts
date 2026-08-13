import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt/jwt.guard';
import {
  CurrentUser,
  type CurrentUser as CurrentUserType,
} from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentUser() user: CurrentUserType) {
    return this.usersService.findById(user.id);
  }

  @Get('me/schools')
  @UseGuards(JwtGuard)
  schools(@CurrentUser() user: CurrentUserType) {
    return this.usersService.findActiveSchools(user.id);
  }
}
