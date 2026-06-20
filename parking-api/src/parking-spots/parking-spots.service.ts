import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParkingSpot, VehicleType } from './entities/parking-spot.entity';
import { CreateParkingSpotDto } from './dto/create-parking-spot.dto';
import { UpdateParkingSpotDto } from './dto/update-parking-spot.dto';
import { ReservationStatus } from '../reservations/entities/reservation.entity';

@Injectable()
export class ParkingSpotsService {
  constructor(
    @InjectRepository(ParkingSpot)
    private readonly parkingSpotRepository: Repository<ParkingSpot>,
  ) {}

  async create(createDto: CreateParkingSpotDto): Promise<ParkingSpot> {
    const existing = await this.parkingSpotRepository.findOne({
      where: { code: createDto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una plaza con el código ${createDto.code}`,
      );
    }

    const spot = this.parkingSpotRepository.create(createDto);
    return this.parkingSpotRepository.save(spot);
  }

  async findAll(): Promise<ParkingSpot[]> {
    return this.parkingSpotRepository.find();
  }

  async findOne(id: string): Promise<ParkingSpot> {
    const spot = await this.parkingSpotRepository.findOne({ where: { id } });

    if (!spot) {
      throw new NotFoundException(`Plaza con id ${id} no encontrada`);
    }

    return spot;
  }

  async update(
    id: string,
    updateDto: UpdateParkingSpotDto,
  ): Promise<ParkingSpot> {
    const spot = await this.findOne(id);

    if (updateDto.code && updateDto.code !== spot.code) {
      const existing = await this.parkingSpotRepository.findOne({
        where: { code: updateDto.code },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe una plaza con el código ${updateDto.code}`,
        );
      }
    }

    Object.assign(spot, updateDto);
    return this.parkingSpotRepository.save(spot);
  }

  async remove(id: string): Promise<void> {
    const spot = await this.findOne(id);
    await this.parkingSpotRepository.remove(spot);
  }

  async findAllByType(type: VehicleType): Promise<ParkingSpot[]> {
    return this.parkingSpotRepository.find({
      where: { type, isActive: true },
      order: { code: 'ASC' },
    });
  }

  async findAvailableSpotsByType(
    type: VehicleType,
    startDate: Date,
    endDate: Date,
  ): Promise<ParkingSpot[]> {
    return this.parkingSpotRepository
      .createQueryBuilder('spot')
      .where('spot.type = :type', { type })
      .andWhere('spot.isActive = true')
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('reservation.parkingSpotId')
          .from('reservations', 'reservation')
          .where('reservation.status = :status', {
            status: ReservationStatus.ACTIVE,
          })
          .andWhere('reservation.actualExitDate IS NULL')
          .andWhere('reservation.startDate < :endDate', { endDate })
          .andWhere('reservation.endDate > :startDate', { startDate })
          .getQuery();
        return 'spot.id NOT IN ' + subQuery;
      })
      .orderBy('spot.code', 'ASC')
      .getMany();
  }
}
