import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { VehicleType } from '../entities/parking-spot.entity';

export class UpdateParkingSpotDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  code?: string;

  @IsEnum(VehicleType)
  @IsOptional()
  type?: VehicleType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
