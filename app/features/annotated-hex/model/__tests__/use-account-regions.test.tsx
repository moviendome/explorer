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

    it('Token-2022 (no parsed.type, length === 82 SPL_MINT_SIZE): returns mint regions', () => {
        const bytes = zeroBytes(82);
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).not.toBeNull();
        expect(result.current!.map(r => r.id)).toContain('mint.mintAuthority');
    });

    it('Token-2022 (no parsed.type, length 100 between mint and token-account): returns mint regions', () => {
        const bytes = zeroBytes(100);
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).not.toBeNull();
        expect(result.current!.map(r => r.id)).toContain('mint.mintAuthority');
    });

    it('Token-2022 (no parsed.type, length 50 < SPL_MINT_SIZE): returns null', () => {
        const bytes = zeroBytes(50);
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).toBeNull();
    });

    it('Token-2022 (no parsed.type, length === 165 SPL_TOKEN_ACCOUNT_SIZE): returns null because Mint vs Account is ambiguous', () => {
        // At length === 165, both layouts fit (a base mint padded to token-account size,
        // or a Token-2022 token account with no TLV extensions). The discriminator byte
        // at offset 165 only exists for length > 165, so we cannot tell — prefer null.
        const bytes = zeroBytes(165);
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).toBeNull();
    });

    it('Token-2022 + parsedType=mint + zeroBytes(50) (under SPL_MINT_SIZE): returns null', () => {
        const bytes = zeroBytes(50);
        const account = makeAccount({
            owner: TOKEN_2022_PROGRAM_ID,
            parsed: {
                parsed: {
                    info: {},
                    type: 'mint',
                },
                program: 'spl-token-2022',
            } as Account['data']['parsed'],
            rawData: bytes,
        });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).toBeNull();
    });

    it('Token-2022 + parsedType=account + zeroBytes(100) (under SPL_TOKEN_ACCOUNT_SIZE): returns null', () => {
        const bytes = zeroBytes(100);
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
        expect(result.current).toBeNull();
    });

    it.each([
        ['unassigned discriminator byte 0', 0],
        ['unknown discriminator byte 42', 42],
        ['unknown discriminator byte 255', 255],
    ])('Token-2022 (no parsed.type): returns null when bytes[165] is %s', (_label, byte) => {
        // Only accountTypeByte === 1 (Mint) and === 2 (Account) are spec-defined.
        // Anything else must fall back to null / plain HexData — rendering a public
        // explorer with confidently-wrong field labels would be worse than no annotation.
        const bytes = zeroBytes(200);
        bytes[165] = byte;
        const account = makeAccount({ owner: TOKEN_2022_PROGRAM_ID, rawData: bytes });
        const { result } = renderHook(() => useAccountRegions(account, bytes));
        expect(result.current).toBeNull();
    });

    it('memo is cached across parent re-renders that produce a fresh account ref with content-equal parsed info', () => {
        const bytes = zeroBytes(82);
        const buildAccount = (): Account =>
            makeAccount({
                owner: TOKEN_PROGRAM_ID,
                parsed: {
                    parsed: {
                        info: { decimals: 6, freezeAuthority: null, isInitialized: true, mintAuthority: null, supply: '1000000' },
                        type: 'mint',
                    },
                    program: 'spl-token',
                } as Account['data']['parsed'],
                rawData: bytes,
            });

        const { result, rerender } = renderHook(({ account }: { account: Account }) => useAccountRegions(account, bytes), {
            initialProps: { account: buildAccount() },
        });

        const first = result.current;
        rerender({ account: buildAccount() }); // fresh ref, identical content
        const second = result.current;

        expect(first).not.toBeNull();
        expect(second).toBe(first);
    });

    it('memo rebuilds when parsed info content changes (different supply)', () => {
        const bytes = zeroBytes(82);
        const buildAccount = (supply: string): Account =>
            makeAccount({
                owner: TOKEN_PROGRAM_ID,
                parsed: {
                    parsed: {
                        info: { decimals: 6, freezeAuthority: null, isInitialized: true, mintAuthority: null, supply },
                        type: 'mint',
                    },
                    program: 'spl-token',
                } as Account['data']['parsed'],
                rawData: bytes,
            });

        const { result, rerender } = renderHook(({ account }: { account: Account }) => useAccountRegions(account, bytes), {
            initialProps: { account: buildAccount('1000000') },
        });
        const first = result.current;
        rerender({ account: buildAccount('2000000') });
        const second = result.current;

        expect(first).not.toBeNull();
        expect(second).not.toBe(first);
    });

});
