import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogAction } from './schemas/audit-log.schema';

interface ReservationSnapshotInput {
  id: string;
  vehiclePlate: string;
  vehicleType: string;
  startDate: Date;
  endDate: Date;
  actualEntryDate: Date | null;
  actualExitDate: Date | null;
  status: string;
}

interface ParkingSpotSnapshotInput {
  id: string;
  code: string;
  type: string;
}

interface UserSnapshotInput {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface CreateAuditLogInput {
  action: AuditLogAction;
  reservation: ReservationSnapshotInput;
  parkingSpot: ParkingSpotSnapshotInput;
  performedBy: UserSnapshotInput;
  reservationOwner: UserSnapshotInput;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLog>,
  ) {}

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const log = new this.auditLogModel({
      ...input,
      timestamp: new Date(),
    });
    return log.save();
  }

  async findAll(): Promise<AuditLog[]> {
    return this.auditLogModel.find().sort({ timestamp: -1 }).exec();
  }

  async findByReservationId(reservationId: string): Promise<AuditLog[]> {
    return this.auditLogModel
      .find({ 'reservation.id': reservationId })
      .sort({ timestamp: 1 })
      .exec();
  }

  async findWithFilters(filters: {
    action?: AuditLogAction;
    startDate?: string;
    endDate?: string;
    reservationId?: string;
    parkingSpotId?: string;
    reservationOwnerId?: string;
    performedById?: string;
    page: number;
    limit: number;
  }): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query: Record<string, unknown> = {};

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
      const timestampFilter: { $gte?: Date; $lte?: Date } = {};

      if (filters.startDate) {
        timestampFilter.$gte = new Date(filters.startDate);
      }

      if (filters.endDate) {
        timestampFilter.$lte = new Date(filters.endDate);
      }

      query.timestamp = timestampFilter;
    }

    if (filters.reservationId) {
      query['reservation.id'] = filters.reservationId;
    }

    if (filters.parkingSpotId) {
      query['parkingSpot.id'] = filters.parkingSpotId;
    }

    if (filters.reservationOwnerId) {
      query['reservationOwner.id'] = filters.reservationOwnerId;
    }

    if (filters.performedById) {
      query['performedBy.id'] = filters.performedById;
    }

    const skip = (filters.page - 1) * filters.limit;

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(query, { __v: 0 })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      this.auditLogModel.countDocuments(query).exec(),
    ]);

    return { data, total, page: filters.page, limit: filters.limit };
  }

  async getTopCustomers(
    startDate?: string,
    endDate?: string,
    limit = 5,
  ): Promise<Array<{ ownerId: string; ownerName: string; count: number }>> {
    const match: Record<string, unknown> = { action: AuditLogAction.CREATED };
    this.applyDateRange(match, startDate, endDate);

    const result = await this.auditLogModel.aggregate<{
      _id: string;
      ownerName: string;
      count: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$reservationOwner.id',
          ownerName: { $first: '$reservationOwner.name' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    return result.map((r) => ({
      ownerId: r._id,
      ownerName: r.ownerName,
      count: r.count,
    }));
  }

  async getBusiestSpots(
    startDate?: string,
    endDate?: string,
    limit = 5,
  ): Promise<Array<{ spotId: string; spotCode: string; count: number }>> {
    const match: Record<string, unknown> = {};
    this.applyDateRange(match, startDate, endDate);

    const result = await this.auditLogModel.aggregate<{
      _id: string;
      spotCode: string;
      count: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$parkingSpot.id',
          spotCode: { $first: '$parkingSpot.code' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    return result.map((r) => ({
      spotId: r._id,
      spotCode: r.spotCode,
      count: r.count,
    }));
  }

  async getCancellationRate(
    startDate?: string,
    endDate?: string,
  ): Promise<{ created: number; cancelled: number; rate: number }> {
    const match: Record<string, unknown> = {};
    this.applyDateRange(match, startDate, endDate);

    const result = await this.auditLogModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts: Record<string, number> = {};
    for (const r of result) {
      counts[r._id] = r.count;
    }

    const created = counts[AuditLogAction.CREATED] ?? 0;
    const cancelled = counts[AuditLogAction.CANCELLED] ?? 0;
    const rate = created > 0 ? (cancelled / created) * 100 : 0;

    return { created, cancelled, rate: Math.round(rate * 100) / 100 };
  }

  private applyDateRange(
    match: Record<string, unknown>,
    startDate?: string,
    endDate?: string,
  ): void {
    if (startDate || endDate) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (startDate) range.$gte = new Date(startDate);
      if (endDate) range.$lte = new Date(endDate);
      match.timestamp = range;
    }
  }
}
