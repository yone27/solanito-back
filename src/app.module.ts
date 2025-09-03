// src/app.module.ts
import { Module } from '@nestjs/common';
import { CoreModule } from './core/solana.connection';
import { LaunchpadsModule } from './launchpads/launchpads.module';
import { MintsModule } from './mints/mints.module';

@Module({
  imports: [CoreModule, LaunchpadsModule, MintsModule],
})
export class AppModule {}
