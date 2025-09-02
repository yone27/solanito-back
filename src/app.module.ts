import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ListenerModule } from './listener/listener.module';
import { MintsModule } from './mints/mints.module';
import { MintsController } from './mints/mints.controller';
import { MintsService } from './mints/mints.service';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ListenerModule,
    MintsModule,
  ],
  controllers: [MintsController],
  providers: [MintsService],
})

export class AppModule { }