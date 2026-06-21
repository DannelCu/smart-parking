import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditLogAction } from '../schemas/audit-log.schema';

export class FindAuditLogsDto {
  @IsEnum(AuditLogAction)
  @IsOptional()
  action?: AuditLogAction;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsUUID()
  @IsOptional()
  reservationId?: string;

  @IsUUID()
  @IsOptional()
  parkingSpotId?: string;

  @IsUUID()
  @IsOptional()
  reservationOwnerId?: string;

  @IsUUID()
  @IsOptional()
  performedById?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
