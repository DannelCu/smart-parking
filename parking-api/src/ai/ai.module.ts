import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { UsersModule } from '../users/users.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ParkingSpotsModule } from '../parking-spots/parking-spots.module';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    UsersModule,
    ReservationsModule,
    AuditLogModule,
    ParkingSpotsModule,
  ],
  providers: [AiService, OrchestratorService],
  controllers: [AiController],
})
export class AiModule {}
