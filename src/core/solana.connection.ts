import { Module, Global } from '@nestjs/common';
import { Connection } from '@solana/web3.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EnvSchema } from './env'; // exporta el schema desde env.ts

export const SOLANA_CONNECTION = 'SOLANA_CONNECTION';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    {
      provide: SOLANA_CONNECTION,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const env = EnvSchema.parse({
          RPC_HTTP_URL: cfg.get<string>('RPC_HTTP_URL'),
          RPC_WS_URL:  cfg.get<string>('RPC_WS_URL'),
        });
        return new Connection(env.RPC_HTTP_URL, {
          commitment: 'confirmed',
          wsEndpoint: env.RPC_WS_URL,
        });
      },
    },
  ],
  exports: [SOLANA_CONNECTION],
})
export class CoreModule {}
