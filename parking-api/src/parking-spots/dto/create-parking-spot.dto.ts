import { IsEnum, IsString, MinLength } from 'class-validator';
import { VehicleType } from '../entities/parking-spot.entity';

export class CreateParkingSpotDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsEnum(VehicleType)
  type!: VehicleType;
}
