import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { FindAuditLogsDto } from './dto/find-audit-logs.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuditLog } from './schemas/audit-log.schema';
import { SkipSerialize } from '../common/decorators/skip-serialize.decorator';

@Controller('audit-log')
@SkipSerialize()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: FindAuditLogsDto): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.auditLogService.findWithFilters({
      action: query.action,
      startDate: query.startDate,
      endDate: query.endDate,
      reservationId: query.reservationId,
      parkingSpotId: query.parkingSpotId,
      reservationOwnerId: query.reservationOwnerId,
      performedById: query.performedById,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }
}
