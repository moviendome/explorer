import { Account, isTokenProgramData } from '@providers/accounts';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@providers/accounts/tokens';
import { MintAccountInfo, TokenAccountInfo } from '@validators/accounts/token';
import { useMemo } from 'react';
import { create, Struct } from 'superstruct';

import { Logger } from '@/app/shared/lib/logger';

import {
    buildSplMintRegions,
    buildSplTokenAccountRegions,
    SPL_MINT_SIZE,
    SPL_TOKEN_ACCOUNT_SIZE,
} from './spl-token';
import { Region } from './types';

export const MAX_ANNOTATABLE_SIZE = 4096;

export type RegionsState = Region[] | null;

const TOKEN_PROGRAM_ID_BASE58 = TOKEN_PROGRAM_ID.toBase58();
const TOKEN_2022_PROGRAM_ID_BASE58 = TOKEN_2022_PROGRAM_ID.toBase58();

export function useAccountRegions(
    account: Account | null | undefined,
    rawData: Uint8Array | undefined,
): RegionsState {
    const ownerBase58 = account?.owner.toBase58() ?? null;
    const parsedData = account?.data.parsed;
    // Narrow the memo dep footprint: only the two fields the body reads. Depending on
    // `parsedData` as a whole object invalidates whenever the parent re-creates `account`,
    // even for content-equal data. `parsedType` is a primitive; `parsedInfo` is still an
    // object reference (relying on callers to pass stable `account` for true stability).
    const tokenParsed = parsedData && isTokenProgramData(parsedData) ? parsedData.parsed : undefined;
    const parsedType = tokenParsed?.type;
    const parsedInfo = tokenParsed?.info;

    return useMemo<RegionsState>(() => {
        if (!rawData) return null;
        if (rawData.length > MAX_ANNOTATABLE_SIZE) return null;
        if (!ownerBase58) return null;
        if (parsedType === 'multisig') return null;

        if (ownerBase58 !== TOKEN_PROGRAM_ID_BASE58 && ownerBase58 !== TOKEN_2022_PROGRAM_ID_BASE58) {
            return null;
        }

        if (ownerBase58 === TOKEN_PROGRAM_ID_BASE58) {
            if (rawData.length === SPL_MINT_SIZE) {
                return buildSplMintRegions(rawData, safeCreate(parsedInfo, MintAccountInfo));
            }
            if (rawData.length === SPL_TOKEN_ACCOUNT_SIZE) {
                return buildSplTokenAccountRegions(rawData, safeCreate(parsedInfo, TokenAccountInfo));
            }
            return null;
        }

        // Token-2022. Prefer parsed.type when available; otherwise size disambiguates.
        if (parsedType === 'mint') {
            if (rawData.length < SPL_MINT_SIZE) return null;
            return buildSplMintRegions(rawData, safeCreate(parsedInfo, MintAccountInfo));
        }
        if (parsedType === 'account') {
            if (rawData.length < SPL_TOKEN_ACCOUNT_SIZE) return null;
            return buildSplTokenAccountRegions(rawData, safeCreate(parsedInfo, TokenAccountInfo));
        }
        // No parsed.type. For Token-2022 with length >= 165, the accountType byte at
        // offset 165 disambiguates: 1 = Mint, 2 = Account. Below 165 must be a plain mint.
        if (rawData.length >= SPL_TOKEN_ACCOUNT_SIZE) {
            const accountTypeByte = rawData[SPL_TOKEN_ACCOUNT_SIZE];
            return accountTypeByte === 1
                ? buildSplMintRegions(rawData, undefined)
                : buildSplTokenAccountRegions(rawData, undefined);
        }
        if (rawData.length >= SPL_MINT_SIZE) {
            return buildSplMintRegions(rawData, undefined);
        }
        return null;
    }, [rawData, ownerBase58, parsedType, parsedInfo]);
}

/**
 * Narrow an `any()`-typed superstruct payload into a typed shape, or undefined
 * if the payload is missing or doesn't conform. Failures fall through to the
 * builder's raw-byte decoding path — console-logged (not sent to Sentry) since
 * RPC schema drift is an expected, recoverable condition.
 */
function safeCreate<T>(value: unknown, validator: Struct<T, unknown>): T | undefined {
    if (value == null) return undefined;
    try {
        return create(value, validator);
    } catch (error) {
        Logger.warn('[annotated-hex] parsed payload failed validation', { error });
        return undefined;
    }
}
