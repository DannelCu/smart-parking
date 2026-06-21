import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum AuditLogAction {
  CREATED = 'CREATED',
  CANCELLED = 'CANCELLED',
  ENTERED = 'ENTERED',
  EXITED = 'EXITED',
}

@Schema({ _id: false })
class ReservationSnapshot {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  vehiclePlate: string;

  @Prop({ required: true })
  vehicleType: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ type: Date, default: null })
  actualEntryDate: Date | null;

  @Prop({ type: Date, default: null })
  actualExitDate: Date | null;

  @Prop({ required: true })
  status: string;
}

@Schema({ _id: false })
class ParkingSpotSnapshot {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  type: string;
}

@Schema({ _id: false })
class UserSnapshot {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  role?: string;
}

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog extends Document {
  @Prop({ required: true, enum: AuditLogAction })
  action: AuditLogAction;

  @Prop({ required: true, default: () => new Date() })
  timestamp: Date;

  @Prop({ type: ReservationSnapshot, required: true })
  reservation: ReservationSnapshot;

  @Prop({ type: ParkingSpotSnapshot, required: true })
  parkingSpot: ParkingSpotSnapshot;

  @Prop({ type: UserSnapshot, required: true })
  performedBy: UserSnapshot;

  @Prop({ type: UserSnapshot, required: true })
  reservationOwner: UserSnapshot;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
