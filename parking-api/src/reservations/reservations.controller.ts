import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { ReservationAuditInterceptor } from '../audit-log/interceptors/reservation-audit.interceptor';
import { ReservationsService } from './reservations.service';
import {
  CreateReservationDto,
  CreateReservationAdminDto,
} from './dto/create-reservation.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { Reservation } from './entities/reservation.entity';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @Roles(UserRole.CLIENTE)
  @UseInterceptors(ReservationAuditInterceptor)
  create(
    @Request() req: { user: User },
    @Body() createReservationDto: CreateReservationDto,
  ): Promise<Reservation> {
    return this.reservationsService.create(req.user.id, createReservationDto);
  }

  @Post('admin')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(ReservationAuditInterceptor)
  createForUser(
    @Body() createReservationAdminDto: CreateReservationAdminDto,
  ): Promise<Reservation> {
    return this.reservationsService.createForUser(createReservationAdminDto);
  }

  @Get('my')
  @Roles(UserRole.CLIENTE)
  findMyReservations(@Request() req: { user: User }): Promise<Reservation[]> {
    return this.reservationsService.findMyReservations(req.user.id);
  }

  @Get('occupancy')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  getOccupancy() {
    return this.reservationsService.getOccupancy();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  findAll(): Promise<Reservation[]> {
    return this.reservationsService.findAll();
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: { user: User },
  ): Promise<Reservation> {
    const reservation = await this.reservationsService.findOne(id);

    const isOwner = reservation.userId === req.user.id;
    const isStaff =
      req.user.role === UserRole.ADMIN || req.user.role === UserRole.EMPLEADO;

    if (!isOwner && !isStaff) {
      throw new ForbiddenException('No tienes permiso para ver esta reserva');
    }

    return reservation;
  }

  @Patch(':id/cancel')
  @UseInterceptors(ReservationAuditInterceptor)
  cancel(
    @Param('id') id: string,
    @Request() req: { user: User },
  ): Promise<Reservation> {
    return this.reservationsService.cancel(id, req.user.id, req.user.role);
  }

  @Patch(':id/enter')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @UseInterceptors(ReservationAuditInterceptor)
  enter(@Param('id') id: string): Promise<Reservation> {
    return this.reservationsService.enter(id);
  }

  @Patch(':id/exit')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @UseInterceptors(ReservationAuditInterceptor)
  exit(@Param('id') id: string): Promise<Reservation> {
    return this.reservationsService.exit(id);
  }
}
