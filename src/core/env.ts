// src/core/env.ts
import { z } from 'zod';

export const EnvSchema = z.object({
  RPC_HTTP_URL: z.string().url(),
  RPC_WS_URL: z.string().url(),
  LAUNCHPADS: z.string().optional(),            // "pumpfun:<pid>,bonkpad:<pid>"
  SHOW_MINT_INFO: z.string().default('true'),
  CHECK_JUP_ROUTE: z.string().default('false'),
  SLIPPAGE_BPS: z.string().default('200'),
  EVENTS_BUFFER: z.string().default('300'),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(src: NodeJS.ProcessEnv): Env {
  return EnvSchema.parse(src);
}