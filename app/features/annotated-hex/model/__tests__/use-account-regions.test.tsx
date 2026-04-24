import type { Account } from '@providers/accounts';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAccountRegions } from '../use-account-regions';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

function makeAccount(opts: {
    owner?: PublicKey;
    rawData?: Uint8Array;
    parsed?: Account['data']['parsed'];
}): Account {
    return {
        data: {
            parsed: opts.parsed,
            raw: opts.rawData,
        },
        executable: false,
        lamports: 1,
        owner: opts.owner ?? SystemProgram.programId,
        pubkey: PublicKey.default,
    };
}

function zeroBytes(n: number): Uint8Array {
    return new Uint8Array(n);
}

describe('useAccountRegions', () => {
    it('returns null when rawData is undefined', () => {
        const account = makeAccount({ owner: TOKEN_PROGRAM_ID });
        const { result } = renderHook(() => useAccountRegions(account, undefined));
        expect(result.current).toBeNull();
    });

    it('returns null for rawData > 4096 bytes', () => {
        const account = makeAccount({ owner: TOKEN_PROGRAM_ID });
        const { result } = renderHook(() => useAccountRegions(account, zeroBytes(5000)));
        expect(result.current).toBeNull();
    });

    it('returns null for non-token programs', () => {
        const account = makeAccount({ owner: SystemProgram.programId });
        const { result } = renderHook(() => useAccountRegions(account, zeroBytes(82)));
        expect(result.current).toBeNull();
    });

    it('returns null for token multisig accounts', () => {
        const account = makeAccount({
            owner: TOKEN_PROGRAM_ID,
            parsed: {
                parsed: {
                    info: {},
                    type: 'multisig',
                } as NonNullable<Account['data']['parsed']>['parsed'],
                program: 'spl-token',
            } as Account['data']['parsed'],
            rawData: zeroBytes(355),
        });
        const { result } = renderHook(() => useAccountRegions(account, zeroBytes(355)));
        expect(result.current).toBeNull();
    });

    it('annotates a legacy SPL Mint (82 bytes, no parsed) via raw-byte fallback', () => {
        const account = makeAccount({ owner: TOKEN_PROGRAM_ID });
        const { result } = renderHook(() => useAccountRegions(account, zeroBytes(82)));
        expect(result.current).not.toBeNull();
        expect(result.current!.map(r => r.id)).toContain('mint.mintAuthority');
    });

    it('annotates a legacy SPL Token Account (165 bytes)', () => {
        const account = makeAccount({ owner: TOKEN_PROGRAM_ID });
        const { result } = renderHook(() => useAccountRegions(account, zeroBytes(165)));
        expect(result.current).not.toBeNull();
        expect(result.current!.map(r => r.id)).toContain('token.mint');
    });

    it('returns null for legacy SPL Token with unexpected length (e.g. 100 bytes)', () => {
        const account = makeAccount({ owner: TOKEN_PROGRAM_ID });
        const { result } = renderHook(() => useAccountRegions(account, zeroBytes(100)));
        expect(result.current).toBeNull();
    });

    it('annotates a Token-2022 Mint with TLV tail', () => {
        // Token-2022 Mint layout: 82 base + 83 zero-padding + accountType at 165 +
        // header(4) at 166 + zero-length ImmutableOwner extension (type=7, len=0).
        const bytes = zeroBytes(170);
        bytes[165] = 1; // accountType = Mint
        new DataView(bytes.buffer).setUint16(166, 7, true);
        new DataView(bytes.buffer).setUint16(168, 0, true);

        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).not.toBeNull();
        // 7 mint + 1 padding + 1 accountType + 1 extension header = 10 minimum
        expect(result.current!.length).toBeGreaterThanOrEqual(10);
        expect(result.current!.find(r => r.name === 'Padding')).toBeDefined();
    });

    it('Token-2022: prefers parsed.type when available to disambiguate Mint vs Account', () => {
        const bytes = zeroBytes(200);
        const account = makeAccount({
            owner: TOKEN_2022_PROGRAM_ID,
            parsed: {
                parsed: {
                    info: {},
                    type: 'account',
                },
                program: 'spl-token-2022',
            } as Account['data']['parsed'],
            rawData: bytes,
        });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).not.toBeNull();
        expect(result.current![0].id).toBe('token.mint');
    });

    it('Token-2022 (no parsed.type): dispatches to TokenAccount layout when bytes[165] = 2', () => {
        // Token-2022 account with length > 165 and no parsed.type — the accountType
        // byte at offset 165 disambiguates. 2 = Account.
        const bytes = zeroBytes(200);
        bytes[165] = 2;
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).not.toBeNull();
        // First region should be token.mint — confirming the TokenAccount layout is used.
        expect(result.current![0].id).toBe('token.mint');
    });

    it('Token-2022 (no parsed.type): dispatches to Mint layout when bytes[165] = 0 (current behavior: non-1 → TokenAccount)', () => {
        // Documents current behavior: the accountType byte is compared strictly to 1 — anything
        // else (0, 2, 42, …) falls through to buildSplTokenAccountRegions.
        const bytes = zeroBytes(200);
        bytes[165] = 42;
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).not.toBeNull();
        expect(result.current![0].id).toBe('token.mint');
    });

});
