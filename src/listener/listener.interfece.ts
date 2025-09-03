export type MintEvent = {
    source: 'spl-token' | 'token-2022' | 'pumpfun';
    mint: string;
    ts: number;
    details?: {
        decimals?: number;
        mintAuthority?: string | null;
        freezeAuthority?: string | null;
        authorityOwner?: {
            mint: AuthorityOwnerInfo;
            freeze: AuthorityOwnerInfo;
        };
        hasRoute?: boolean;
        activity1m?: number;
    };
};

export type AuthorityOwnerInfo = {
    label: 'none' | 'no-account' | 'system' | 'spl-token' | 'token-2022' | 'pumpfun' | 'other';
    programId?: string | null;
};

export type OwnerLabel = 'none' | 'no-account' | 'system' | 'spl-token' | 'token-2022' | 'pumpfun' | 'other';
export type Stage = 'pump' | 'newCreation' | 'almostBonded' | 'surge' | 'migrated';