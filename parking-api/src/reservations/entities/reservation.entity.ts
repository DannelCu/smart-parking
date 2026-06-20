import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ParkingSpot,
  VehicleType,
} from '../../parking-spots/entities/parking-spot.entity';
import { User } from '../../users/entities/user.entity';

export enum ReservationStatus {
  ACTIVE = 'activa',
  CANCELLED = 'cancelada',
}

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ParkingSpot)
  @JoinColumn({ name: 'parkingSpotId' })
  parkingSpot: ParkingSpot;

  @Column()
  parkingSpotId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  vehiclePlate: string;

  @Column({
    type: 'enum',
    enum: VehicleType,
  })
  vehicleType: VehicleType;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  actualEntryDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  actualExitDate: Date | null;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.ACTIVE,
  })
  status: ReservationStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
