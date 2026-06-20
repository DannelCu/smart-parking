import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { VehicleType } from '../../parking-spots/entities/parking-spot.entity';

export class CreateReservationDto {
  @IsUUID()
  @IsOptional()
  parkingSpotId?: string;

  @IsString()
  vehiclePlate!: string;

  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class CreateReservationAdminDto extends CreateReservationDto {
  @IsUUID()
  userId!: string;
}
