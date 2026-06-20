import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile(@Request() req: { user: User }): User {
    return req.user;
  }

  @Patch('change-password')
  async changePassword(
    @Request() req: { user: User },
    @Body() { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<void> {
    return this.usersService.changePassword(
      req.user.id,
      currentPassword,
      newPassword,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  changeRole(
    @Param('id') id: string,
    @Body() { role }: ChangeRoleDto,
  ): Promise<User> {
    return this.usersService.changeRole(id, role);
  }

  @Patch(':id/password')
  @Roles(UserRole.ADMIN)
  resetPassword(
    @Param('id') id: string,
    @Body() { newPassword }: ResetPasswordDto,
  ): Promise<void> {
    return this.usersService.resetPassword(id, newPassword);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
