import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingSpotsController } from './parking-spots.controller';
import { ParkingSpotsService } from './parking-spots.service';
import { ParkingSpot } from './entities/parking-spot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ParkingSpot])],
  controllers: [ParkingSpotsController],
  providers: [ParkingSpotsService],
  exports: [ParkingSpotsService],
})
export class ParkingSpotsModule {}
