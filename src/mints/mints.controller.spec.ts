import { Test, TestingModule } from '@nestjs/testing';
import { MintsController } from './mints.controller';

describe('MintsController', () => {
  let controller: MintsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MintsController],
    }).compile();

    controller = module.get<MintsController>(MintsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
