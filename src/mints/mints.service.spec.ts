import { Test, TestingModule } from '@nestjs/testing';
import { MintsService } from './mints.service';

describe('MintsService', () => {
  let service: MintsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MintsService],
    }).compile();

    service = module.get<MintsService>(MintsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
