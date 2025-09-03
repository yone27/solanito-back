import { Injectable } from '@nestjs/common';
import { MintEvent } from '../mints/events.store';

@Injectable()
export class StageService {
    compute(event: MintEvent): 'pump' | 'newCreation' | 'almostBonded' | 'surge' | 'migrated' | undefined {
        const d = event.details;
        if (!d) return undefined;
        if (d.hasRoute) return 'migrated';
        const isCurve = d.authorityOwner?.mint?.label === 'launchpad' && (d.freezeAuthority ?? null) === null;
        if (!isCurve) return undefined;

        const age = Date.now() - event.ts;
        const activity = d.activity1m ?? 0;

        if (activity >= 30) return 'surge';
        if (age < 3 * 60_000) return 'newCreation';
        if (age >= 20 * 60_000) return 'almostBonded';
        return 'pump';
    }
}
