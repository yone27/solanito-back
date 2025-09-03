// src/launchpads/launchpads.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PublicKey, Connection } from '@solana/web3.js';
import { SOLANA_CONNECTION } from '../core/solana.connection';
import { Inject } from '@nestjs/common';
import { parseEnv } from '../core/env';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

type Launchpad = { name: string; programId: PublicKey };

@Injectable()
export class LaunchpadsService {
    private readonly log = new Logger(LaunchpadsService.name);
    private readonly catalog: Launchpad[] = [];
    private active = new Set<string>();
    private subs = new Map<string, number>();
    private activity: Record<string, number[]> = {};

    constructor(@Inject(SOLANA_CONNECTION) private readonly conn: Connection) {
        const env = parseEnv(process.env);
        this.catalog = this.parseCatalog(env.LAUNCHPADS);
    }

    private parseCatalog(s?: string): Launchpad[] {
        if (!s) return [];
        const out: Launchpad[] = [];
        for (const pair of s.split(',').map(x => x.trim()).filter(Boolean)) {
            const [name, pid] = pair.split(':').map(t => t.trim());
            if (!name || !pid) continue;
            try { out.push({ name: name.toLowerCase(), programId: new PublicKey(pid) }); }
            catch { this.log.warn(`Ignoring invalid LAUNCHPADS entry: ${pair}`); }
        }
        return out;
    }

    getAvailable() { return this.catalog.map(c => c.name); }
    getActive() { return Array.from(this.active); }

    async setActive(names: string[]) {
        const wanted = new Set(
            names.map(n => n.trim().toLowerCase())
                .filter(n => this.catalog.some(c => c.name === n)),
        );
        for (const cur of Array.from(this.active))
            if (!wanted.has(cur)) await this.unsubscribe(cur);
        for (const n of Array.from(wanted))
            if (!this.active.has(n)) await this.subscribe(n);
    }

    private async subscribe(name: string) {
        const lp = this.catalog.find(c => c.name === name);
        if (!lp || this.subs.has(name)) return;
        const id = await this.conn.onLogs(lp.programId, async (e) => {
            const sig = e.signature;
            if (!sig) return;
            try {
                const tx = await this.conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 } as any);
                const meta: any = tx?.meta;
                const msg: any = tx?.transaction?.message;
                const keys = msg?.getAccountKeys ? msg.getAccountKeys().keySegments().flat() : msg?.accountKeys;
                if (!meta?.innerInstructions || !keys) return;

                for (const inner of meta.innerInstructions as any[]) {
                    for (const ix of inner.instructions) {
                        const pidIndex = ix.programIdIndex ?? ix.programId;
                        const prog = pidIndex instanceof PublicKey ? pidIndex : new PublicKey(keys[pidIndex]);
                        const isSPL = prog.equals(TOKEN_PROGRAM_ID) || prog.equals(TOKEN_2022_PROGRAM_ID);
                        if (!isSPL) continue;
                        const first = ix.accounts?.[0];
                        if (typeof first === 'number') {
                            const mint = new PublicKey(keys[first]).toBase58();
                            this.recordActivity(mint);
                        }
                    }
                }
            } catch { }
        }, 'confirmed');

        this.subs.set(name, id);
        this.active.add(name);
        this.log.log(`▶️ launchpad subscribed: ${name}`);
    }

    private async unsubscribe(name: string) {
        const id = this.subs.get(name);
        if (id != null) {
            try { await this.conn.removeOnLogsListener(id); } catch { }
            this.subs.delete(name);
            this.log.log(`⏹️ launchpad unsubscribed: ${name}`);
        }
        this.active.delete(name);
    }

    private recordActivity(mint: string) {
        const now = Date.now(), cutoff = now - 60_000;
        const arr = this.activity[mint] ?? (this.activity[mint] = []);
        arr.push(now);
        while (arr.length && arr[0] < cutoff) arr.shift();
    }
    getActivity1m(mint: string) {
        const cutoff = Date.now() - 60_000;
        return (this.activity[mint] ?? []).filter(t => t >= cutoff).length;
    }

    /** Clasifica si una authority pertenece a algún launchpad del catálogo. */
    classifyOwnerProgram(owner: PublicKey | null): { tag?: string } | null {
        if (!owner) return null;
        const hit = this.catalog.find(c => c.programId.equals(owner));
        return hit ? { tag: hit.name } : null;
    }
}
