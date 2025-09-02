import { Module } from '@nestjs/common';
import { MintsController } from './mints.controller';
import { ListenerModule } from '../listener/listener.module';

@Module({
    imports: [ListenerModule],
    controllers: [MintsController],
})
export class MintsModule { }