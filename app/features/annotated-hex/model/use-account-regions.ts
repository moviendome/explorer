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
    // Narrow the memo dep footprint: only the fields the body reads. Depending on
    // `parsedData` as a whole object invalidates the memo whenever the parent re-creates
    // `account`, even for content-equal data. `parsedType` is a primitive. `parsedInfo`
    // is an object reference, so we derive a content-based key via JSON.stringify — the
    // jsonParsed mint/token shapes are small (<1 KB) and parents in this codebase do
    // re-create `account` across renders without always preserving reference identity.
    const tokenParsed = parsedData && isTokenProgramData(parsedData) ? parsedData.parsed : undefined;
    const parsedType = tokenParsed?.type;
    const parsedInfo: unknown = tokenParsed?.info;
    const parsedInfoKey = parsedInfo === undefined ? undefined : JSON.stringify(parsedInfo);

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
        // No parsed.type. For Token-2022 with length > 165, the accountType byte at
        // offset 165 disambiguates: 1 = Mint, 2 = Account. Any other value is a
        // non-spec or unknown account type — fall back to plain HexData rather than
        // label arbitrary bytes with a misleading layout (a public explorer rendering
        // confidently-wrong field names is worse than rendering no annotation).
        if (rawData.length > SPL_TOKEN_ACCOUNT_SIZE) {
            const accountTypeByte = rawData[SPL_TOKEN_ACCOUNT_SIZE];
            if (accountTypeByte === 1) return buildSplMintRegions(rawData, undefined);
            if (accountTypeByte === 2) return buildSplTokenAccountRegions(rawData, undefined);
            return null;
        }
        if (rawData.length >= SPL_MINT_SIZE) {
            return buildSplMintRegions(rawData, undefined);
        }
        return null;
        // parsedInfoKey is the stable content hash for parsedInfo; depending on
        // parsedInfo directly would invalidate on every render with a fresh object ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawData, ownerBase58, parsedType, parsedInfoKey]);
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
