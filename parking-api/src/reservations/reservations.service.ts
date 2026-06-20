import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, IsNull, Repository } from 'typeorm';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { ParkingSpotsService } from '../parking-spots/parking-spots.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import {
  ParkingSpot,
  VehicleType,
} from '../parking-spots/entities/parking-spot.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import { CreateReservationAdminDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly parkingSpotsService: ParkingSpotsService,
    private readonly usersService: UsersService,
  ) {}

  async findOne(id: string): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: {
        parkingSpot: true,
        user: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reserva con id ${id} no encontrada`);
    }

    return reservation;
  }

  private async isSpotAvailable(
    parkingSpotId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    const conflictingReservation = await this.reservationRepository.findOne({
      where: {
        parkingSpotId,
        status: ReservationStatus.ACTIVE,
        actualExitDate: IsNull(),
        startDate: LessThan(endDate),
        endDate: MoreThan(startDate),
      },
    });

    return !conflictingReservation;
  }

  private async findAvailableSpot(
    vehicleType: VehicleType,
    startDate: Date,
    endDate: Date,
  ): Promise<ParkingSpot> {
    const availableSpots =
      await this.parkingSpotsService.findAvailableSpotsByType(
        vehicleType,
        startDate,
        endDate,
      );

    if (availableSpots.length === 0) {
      throw new BadRequestException(
        `No hay plazas disponibles para vehículos tipo "${vehicleType}" en el rango solicitado`,
      );
    }

    return availableSpots[0];
  }

  async create(
    userId: string,
    createReservationDto: CreateReservationDto,
    skipPastDateValidation = false,
  ): Promise<Reservation> {
    const startDate = new Date(createReservationDto.startDate);
    const endDate = new Date(createReservationDto.endDate);

    if (!skipPastDateValidation && startDate < new Date()) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser anterior al momento actual',
      );
    }

    if (startDate >= endDate) {
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de fin',
      );
    }

    let parkingSpot: ParkingSpot;

    if (createReservationDto.parkingSpotId) {
      parkingSpot = await this.parkingSpotsService.findOne(
        createReservationDto.parkingSpotId,
      );

      if (parkingSpot.type !== createReservationDto.vehicleType) {
        throw new BadRequestException(
          `La plaza ${parkingSpot.code} es para tipo "${parkingSpot.type}", no "${createReservationDto.vehicleType}"`,
        );
      }

      if (!parkingSpot.isActive) {
        throw new BadRequestException(
          `La plaza ${parkingSpot.code} no está activa`,
        );
      }

      const available = await this.isSpotAvailable(
        parkingSpot.id,
        startDate,
        endDate,
      );

      if (!available) {
        const hasAlternatives = await this.parkingSpotsService.findAllByType(
          createReservationDto.vehicleType,
        );

        const message =
          hasAlternatives.length > 1
            ? `La plaza ${parkingSpot.code} no está disponible en ese rango. Hay otras plazas de tipo "${createReservationDto.vehicleType}" que podrían estar disponibles.`
            : `La plaza ${parkingSpot.code} no está disponible en ese rango.`;

        throw new BadRequestException(message);
      }
    } else {
      parkingSpot = await this.findAvailableSpot(
        createReservationDto.vehicleType,
        startDate,
        endDate,
      );
    }

    const reservation = this.reservationRepository.create({
      userId,
      parkingSpotId: parkingSpot.id,
      vehiclePlate: createReservationDto.vehiclePlate,
      vehicleType: createReservationDto.vehicleType,
      startDate,
      endDate,
      status: ReservationStatus.ACTIVE,
    });

    return this.reservationRepository.save(reservation);
  }

  async createForUser(
    createDto: CreateReservationAdminDto,
  ): Promise<Reservation> {
    const targetUser = await this.usersService.findOne(createDto.userId);

    if (targetUser.role !== UserRole.CLIENTE) {
      throw new BadRequestException(
        `El usuario ${targetUser.email} no tiene rol "cliente", no se le pueden crear reservas`,
      );
    }

    const { userId, ...reservationData } = createDto;

    return this.create(userId, reservationData, true);
  }

  async cancel(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<Reservation> {
    const reservation = await this.findOne(id);

    const isOwner = reservation.userId === userId;
    const isAdmin = userRole === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar esta reserva',
      );
    }

    if (reservation.actualExitDate) {
      throw new BadRequestException(
        'No se puede cancelar una reserva que ya finalizó',
      );
    }

    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('La reserva ya está cancelada');
    }

    reservation.status = ReservationStatus.CANCELLED;
    return this.reservationRepository.save(reservation);
  }

  async exit(id: string): Promise<Reservation> {
    const reservation = await this.findOne(id);

    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede dar salida a una reserva cancelada',
      );
    }

    if (reservation.actualExitDate) {
      throw new BadRequestException('Esta reserva ya tiene salida registrada');
    }

    reservation.actualExitDate = new Date();
    return this.reservationRepository.save(reservation);
  }

  async findAll(): Promise<Reservation[]> {
    return this.reservationRepository.find({
      relations: { parkingSpot: true, user: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findMyReservations(userId: string): Promise<Reservation[]> {
    return this.reservationRepository.find({
      where: { userId },
      relations: { parkingSpot: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getOccupancy(): Promise<{
    byType: Record<
      VehicleType,
      {
        totalSpots: number;
        occupiedSpots: number;
        availableSpots: number;
        reservations: Reservation[];
      }
    >;
  }> {
    const now = new Date();

    const occupyingReservations = await this.reservationRepository.find({
      where: {
        status: ReservationStatus.ACTIVE,
        actualExitDate: IsNull(),
        startDate: LessThan(now),
      },
      relations: { parkingSpot: true, user: true },
    });

    const allSpots = await this.parkingSpotsService.findAll();

    const byType = {} as Record<
      VehicleType,
      {
        totalSpots: number;
        occupiedSpots: number;
        availableSpots: number;
        reservations: Reservation[];
      }
    >;

    for (const vehicleType of Object.values(VehicleType)) {
      const spotsOfType = allSpots.filter(
        (s) => s.type === vehicleType && s.isActive,
      );

      const reservationsOfType = occupyingReservations.filter(
        (r) => r.parkingSpot.type === vehicleType,
      );

      byType[vehicleType] = {
        totalSpots: spotsOfType.length,
        occupiedSpots: reservationsOfType.length,
        availableSpots: spotsOfType.length - reservationsOfType.length,
        reservations: reservationsOfType,
      };
    }

    return { byType };
  }
}
