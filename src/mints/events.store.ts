import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface MintEvent {
    source: 'spl-token' | 'token-2022' | 'pumpfun';
    mint: string;
    ts: number;
    details?: any;
    stage?: string; // opcional si quieres guardar el stage
}

@Injectable()
export class EventsStore {
    private buf: MintEvent[] = [];
    private limit = 300; // setea desde ENV si quieres
    private subject = new Subject<MintEvent>();

    setLimit(n: number) { this.limit = Math.max(50, n); }

    push(e: MintEvent) {
        this.buf.push(e);
        if (this.buf.length > this.limit) this.buf.shift();
        this.subject.next(e);
    }

    snapshot(): MintEvent[] { return [...this.buf].reverse(); } // newest first
    stream(): Observable<MintEvent> { return this.subject.asObservable(); }
    size() { return this.buf.length; }
}
