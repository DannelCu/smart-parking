import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ParkingSpotsService } from './parking-spots.service';
import { CreateParkingSpotDto } from './dto/create-parking-spot.dto';
import { UpdateParkingSpotDto } from './dto/update-parking-spot.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ParkingSpot } from './entities/parking-spot.entity';

@Controller('parking-spots')
export class ParkingSpotsController {
  constructor(private readonly parkingSpotsService: ParkingSpotsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createDto: CreateParkingSpotDto): Promise<ParkingSpot> {
    return this.parkingSpotsService.create(createDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  findAll(): Promise<ParkingSpot[]> {
    return this.parkingSpotsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  findOne(@Param('id') id: string): Promise<ParkingSpot> {
    return this.parkingSpotsService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateParkingSpotDto,
  ): Promise<ParkingSpot> {
    return this.parkingSpotsService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string): Promise<void> {
    return this.parkingSpotsService.remove(id);
  }
}
