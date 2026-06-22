import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ParkingSpotsService } from '../parking-spots/parking-spots.service';
import {
  ClassifiedQuery,
  QueryCapability,
  QueryIntent,
  QueryParams,
  OrchestratorResult,
  InsightType,
} from './types/ai-query.types';
import { AuditLogAction } from '../audit-log/schemas/audit-log.schema';

type OwnerResolution =
  | { kind: 'resolved'; userId: string; userName: string }
  | { kind: 'result'; result: OrchestratorResult };

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly usersService: UsersService,
    private readonly reservationsService: ReservationsService,
    private readonly auditLogService: AuditLogService,
    private readonly parkingSpotsService: ParkingSpotsService,
  ) {}

  async execute(query: ClassifiedQuery): Promise<OrchestratorResult> {
    if (query.intent === QueryIntent.UNSUPPORTED || !query.capability) {
      return { resultType: 'unsupported', data: null };
    }

    switch (query.capability) {
      case QueryCapability.PRESENCE_LOOKUP:
        return this.handlePresenceLookup(query.params);

      case QueryCapability.OCCUPANCY_SUMMARY:
        return this.handleOccupancySummary();

      case QueryCapability.ACTIVE_RESERVATIONS:
        return this.handleActiveReservations(query.params);

      case QueryCapability.AUDIT_QUERY:
        return this.handleAuditQuery(query.params);

      case QueryCapability.BUSINESS_INSIGHTS:
        return this.handleBusinessInsights(query.params);

      case QueryCapability.ENTITY_HISTORY:
        return this.handleEntityHistory(query.params);

      default:
        return { resultType: 'unsupported', data: null };
    }
  }

  private async resolveOwner(ownerName: string): Promise<OwnerResolution> {
    const users = await this.usersService.findByNameLike(ownerName);

    if (users.length === 0) {
      return {
        kind: 'result',
        result: {
          resultType: 'owner_not_found',
          data: { searchedName: ownerName },
        },
      };
    }

    if (users.length > 1) {
      return {
        kind: 'result',
        result: {
          resultType: 'disambiguation',
          needsDisambiguation: true,
          data: {
            searchedName: ownerName,
            matches: users.map((u) => ({ name: u.name, email: u.email })),
          },
        },
      };
    }

    return { kind: 'resolved', userId: users[0].id, userName: users[0].name };
  }

  private async handlePresenceLookup(
    params: QueryParams,
  ): Promise<OrchestratorResult> {
    if (params.ownerName) {
      const resolution = await this.resolveOwner(params.ownerName);
      if (resolution.kind === 'result') {
        return resolution.result;
      }

      const reservations =
        await this.reservationsService.findActivePresenceByOwner(
          resolution.userId,
        );

      return {
        resultType: 'presence_by_owner',
        data: { owner: { name: resolution.userName }, reservations },
      };
    }

    if (params.vehiclePlate) {
      const reservations =
        await this.reservationsService.findActivePresenceByPlate(
          params.vehiclePlate,
        );

      return {
        resultType: 'presence_by_plate',
        data: { plate: params.vehiclePlate, reservations },
      };
    }

    if (params.spotCode) {
      const reservations =
        await this.reservationsService.findActivePresenceBySpot(
          params.spotCode,
        );

      return {
        resultType: 'presence_by_spot',
        data: { spotCode: params.spotCode, reservations },
      };
    }

    return { resultType: 'presence_no_params', data: null };
  }

  private async handleOccupancySummary(): Promise<OrchestratorResult> {
    const occupancy = await this.reservationsService.getOccupancy();
    return { resultType: 'occupancy_summary', data: occupancy };
  }

  private async handleActiveReservations(
    params: QueryParams,
  ): Promise<OrchestratorResult> {
    const start = params.startDate ? new Date(params.startDate) : undefined;
    const end = params.endDate ? new Date(params.endDate) : undefined;

    const reservations = await this.reservationsService.findActiveReservations(
      start,
      end,
    );

    return { resultType: 'active_reservations', data: { reservations } };
  }

  private async handleAuditQuery(
    params: QueryParams,
  ): Promise<OrchestratorResult> {
    let reservationOwnerId: string | undefined;

    if (params.ownerName) {
      const resolution = await this.resolveOwner(params.ownerName);
      if (resolution.kind === 'result') {
        return resolution.result;
      }
      reservationOwnerId = resolution.userId;
    }

    const result = await this.auditLogService.findWithFilters({
      action: params.action as AuditLogAction | undefined,
      startDate: params.startDate,
      endDate: params.endDate,
      reservationOwnerId,
      page: 1,
      limit: 50,
    });

    return { resultType: 'audit_query', data: result };
  }

  private async handleBusinessInsights(
    params: QueryParams,
  ): Promise<OrchestratorResult> {
    const { insightType, startDate, endDate } = params;

    switch (insightType) {
      case InsightType.TOP_CUSTOMERS: {
        const data = await this.auditLogService.getTopCustomers(
          startDate,
          endDate,
        );
        return { resultType: 'insight_top_customers', data };
      }

      case InsightType.BUSIEST_SPOTS: {
        const data = await this.auditLogService.getBusiestSpots(
          startDate,
          endDate,
        );
        return { resultType: 'insight_busiest_spots', data };
      }

      case InsightType.CANCELLATION_RATE: {
        const data = await this.auditLogService.getCancellationRate(
          startDate,
          endDate,
        );
        return { resultType: 'insight_cancellation_rate', data };
      }

      case InsightType.NO_SHOWS: {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const reservations = await this.reservationsService.findNoShows(
          start,
          end,
        );
        return { resultType: 'insight_no_shows', data: { reservations } };
      }

      default:
        return { resultType: 'insight_unknown', data: null };
    }
  }

  private async handleEntityHistory(
    params: QueryParams,
  ): Promise<OrchestratorResult> {
    let parkingSpotId: string | undefined;

    if (params.spotCode) {
      const spots = await this.parkingSpotsService.findByCodeLike(
        params.spotCode,
      );

      if (spots.length === 0) {
        return {
          resultType: 'spot_not_found',
          data: { searchedCode: params.spotCode },
        };
      }

      if (spots.length > 1) {
        return {
          resultType: 'disambiguation',
          needsDisambiguation: true,
          data: {
            searchedCode: params.spotCode,
            matches: spots.map((s) => ({ code: s.code, type: s.type })),
          },
        };
      }

      parkingSpotId = spots[0].id;
    }

    let reservationOwnerId: string | undefined;
    if (params.ownerName) {
      const resolution = await this.resolveOwner(params.ownerName);
      if (resolution.kind === 'result') {
        return resolution.result;
      }
      reservationOwnerId = resolution.userId;
    }

    const result = await this.auditLogService.findWithFilters({
      startDate: params.startDate,
      endDate: params.endDate,
      parkingSpotId,
      reservationOwnerId,
      page: 1,
      limit: 100,
    });

    return { resultType: 'entity_history', data: result };
  }
}
