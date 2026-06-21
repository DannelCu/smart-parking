import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogController } from './audit-log.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditLogService],
  exports: [AuditLogService],
  controllers: [AuditLogController],
})
export class AuditLogModule {}
