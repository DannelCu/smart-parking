import { Test, TestingModule } from '@nestjs/testing';
import { ParkingSpotsService } from './parking-spots.service';

describe('ParkingSpotsService', () => {
  let service: ParkingSpotsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ParkingSpotsService],
    }).compile();

    service = module.get<ParkingSpotsService>(ParkingSpotsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
