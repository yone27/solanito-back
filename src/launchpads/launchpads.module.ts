import { Module } from '@nestjs/common';
import { LaunchpadsService } from './launchpads.service';
import { CoreModule } from '../core/solana.connection';

@Module({
  imports: [CoreModule],
  providers: [LaunchpadsService],
  exports: [LaunchpadsService],
})

export class LaunchpadsModule {}
