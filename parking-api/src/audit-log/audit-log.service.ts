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
}
