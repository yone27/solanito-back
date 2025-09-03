import { Module } from '@nestjs/common';
import { ListenerService } from '../listener/listener.service';
import { LaunchpadsModule } from '../launchpads/launchpads.module';
import { EventsStore } from './events.store';
import { MintInfoService } from './mint-info.service';
import { RouteService } from './route.service';
import { StageService } from './stage.service';
import { MintsController } from './mints.controller';
import { StatsService } from './stats.service';
import { SolPriceService } from './sol-price.service';

@Module({
  imports: [LaunchpadsModule],
  providers: [EventsStore, MintInfoService, RouteService, ListenerService, StageService, SolPriceService,
    StatsService,
  ],
  controllers: [MintsController],
  exports: [ListenerService, EventsStore, StageService],
})
export class MintsModule { }
