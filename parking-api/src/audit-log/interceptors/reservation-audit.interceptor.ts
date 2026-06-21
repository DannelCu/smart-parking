import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from '../audit-log.service';
import { AuditLogAction } from '../schemas/audit-log.schema';
import { Reservation } from '../../reservations/entities/reservation.entity';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ReservationAuditInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: User; url: string }>();
    const performedBy = request.user;
    const action = this.resolveAction(request.url);

    return next.handle().pipe(
      tap((reservation: Reservation) => {
        void this.auditLogService
          .create({
            action,
            reservation: {
              id: reservation.id,
              vehiclePlate: reservation.vehiclePlate,
              vehicleType: reservation.vehicleType,
              startDate: reservation.startDate,
              endDate: reservation.endDate,
              actualEntryDate: reservation.actualEntryDate,
              actualExitDate: reservation.actualExitDate,
              status: reservation.status,
            },
            parkingSpot: {
              id: reservation.parkingSpot.id,
              code: reservation.parkingSpot.code,
              type: reservation.parkingSpot.type,
            },
            performedBy: {
              id: performedBy.id,
              name: performedBy.name,
              email: performedBy.email,
              role: performedBy.role,
            },
            reservationOwner: {
              id: reservation.user.id,
              name: reservation.user.name,
              email: reservation.user.email,
            },
          })
          .catch((error: unknown) => {
            console.error('Error al guardar audit log:', error);
          });
      }),
    );
  }

  private resolveAction(url: string): AuditLogAction {
    if (url.includes('/cancel')) return AuditLogAction.CANCELLED;
    if (url.includes('/enter')) return AuditLogAction.ENTERED;
    if (url.includes('/exit')) return AuditLogAction.EXITED;
    return AuditLogAction.CREATED;
  }
}
