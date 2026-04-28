import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';

import { SPL_MINT_SIZE, walkTokenExtensions } from '../spl-token';
import { appendTlvTail, baseMint, borshString, concat, fakePubkey } from './tlv-test-helpers';

describe('MintCloseAuthority decoder (type 3)', () => {
    it('emits a single 32-byte close-authority region after the header', () => {
        const auth = fakePubkey(0x11);
        const bytes = appendTlvTail(baseMint(), 1, [{ data: auth, type: 3 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header + closeAuthority = 3
        expect(regions).toHaveLength(3);
        expect(regions[2].name).toBe('MintCloseAuthority — Close Authority');
        expect(regions[2].length).toBe(32);
        if (regions[2].decodedValue.kind !== 'pubkey') throw new Error('unreachable');
        expect(regions[2].decodedValue.base58).toBe(bs58.encode(auth));
        expect(regions[2].decodedValue.isNone).toBeFalsy();
    });

    it('renders all-zero bytes as isNone (OptionalNonZeroPubkey)', () => {
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(32), type: 3 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        if (regions[2].decodedValue.kind !== 'pubkey') throw new Error('unreachable');
        expect(regions[2].decodedValue.isNone).toBe(true);
    });

    it('emits no sub-regions when length < 32 (undersized)', () => {
        // 31 bytes < required 32 — decoder returns []; header region still emitted.
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(31), type: 3 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header only
        expect(regions).toHaveLength(2);
        expect(regions.find(r => r.name === 'MintCloseAuthority — Close Authority')).toBeUndefined();
    });
});

describe('PermanentDelegate decoder (type 12)', () => {
    it('emits a 32-byte delegate region', () => {
        const delegate = fakePubkey(0x22);
        const bytes = appendTlvTail(baseMint(), 1, [{ data: delegate, type: 12 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        expect(regions).toHaveLength(3);
        expect(regions[2].name).toBe('PermanentDelegate — Delegate');
        if (regions[2].decodedValue.kind !== 'pubkey') throw new Error('unreachable');
        expect(regions[2].decodedValue.base58).toBe(bs58.encode(delegate));
    });

    it('emits no sub-regions when length < 32 (undersized)', () => {
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(31), type: 12 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        expect(regions).toHaveLength(2);
        expect(regions.find(r => r.name === 'PermanentDelegate — Delegate')).toBeUndefined();
    });
});

describe('MetadataPointer decoder (type 18)', () => {
    it('emits authority + metadata-address sub-regions', () => {
        const auth = fakePubkey(0x33);
        const mdAddr = fakePubkey(0x44);
        const bytes = appendTlvTail(baseMint(), 1, [{ data: concat(auth, mdAddr), type: 18 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header + authority + mdAddress = 4
        expect(regions).toHaveLength(4);
        expect(regions[2].name).toBe('MetadataPointer — Authority');
        expect(regions[3].name).toBe('MetadataPointer — Metadata Address');
        if (regions[2].decodedValue.kind !== 'pubkey') throw new Error('unreachable');
        if (regions[3].decodedValue.kind !== 'pubkey') throw new Error('unreachable');
        expect(regions[2].decodedValue.base58).toBe(bs58.encode(auth));
        expect(regions[3].decodedValue.base58).toBe(bs58.encode(mdAddr));
    });

    it('sub-regions are contiguous with the header', () => {
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(64), type: 18 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const header = regions[1];
        const auth = regions[2];
        const addr = regions[3];
        expect(auth.start).toBe(header.start + header.length);
        expect(addr.start).toBe(auth.start + auth.length);
    });

    it('emits no sub-regions when length < 64 (undersized)', () => {
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(63), type: 18 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header only
        expect(regions).toHaveLength(2);
        expect(regions.find(r => r.name === 'MetadataPointer — Authority')).toBeUndefined();
        expect(regions.find(r => r.name === 'MetadataPointer — Metadata Address')).toBeUndefined();
    });
});

describe('InterestBearingConfig decoder (type 10)', () => {
    it('emits 5 sub-regions with correct signed integer decoding', () => {
        const rateAuth = fakePubkey(0x55);
        const data = new Uint8Array(52);
        data.set(rateAuth, 0);
        const view = new DataView(data.buffer);
        view.setBigInt64(32, 1_700_000_000n, true);
        view.setInt16(40, -250, true); // -250 bps
        view.setBigInt64(42, 1_750_000_000n, true);
        view.setInt16(50, 300, true); // 300 bps

        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 10 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header + 5 sub-regions = 7
        expect(regions).toHaveLength(7);
        expect(regions.map(r => r.name)).toEqual([
            'Token-2022 Account Type',
            'InterestBearingConfig — Header',
            'InterestBearing — Rate Authority',
            'InterestBearing — Initialization Timestamp',
            'InterestBearing — Pre-update Average Rate',
            'InterestBearing — Last Update Timestamp',
            'InterestBearing — Current Rate',
        ]);

        if (regions[4].decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(regions[4].decodedValue.value).toBe('-250 bps');
        if (regions[6].decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(regions[6].decodedValue.value).toBe('300 bps');
        if (regions[3].decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(regions[3].decodedValue.value).toBe('1700000000');
    });

    it('emits no sub-regions when length < 52 (undersized)', () => {
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(51), type: 10 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header only (header is "InterestBearingConfig — Header"; decoder contributed nothing)
        expect(regions).toHaveLength(2);
        expect(regions.find(r => r.name === 'InterestBearing — Rate Authority')).toBeUndefined();
    });
});

describe('TokenMetadata decoder (type 19)', () => {
    function buildTokenMetadataData(opts: {
        updateAuthority?: Uint8Array;
        mint?: Uint8Array;
        name?: string;
        symbol?: string;
        uri?: string;
        trailingBytes?: Uint8Array;
    }): Uint8Array {
        return concat(
            opts.updateAuthority ?? new Uint8Array(32),
            opts.mint ?? fakePubkey(0x99),
            borshString(opts.name ?? ''),
            borshString(opts.symbol ?? ''),
            borshString(opts.uri ?? ''),
            opts.trailingBytes ?? new Uint8Array(0),
        );
    }

    it('emits updateAuthority, mint, name, symbol, uri sub-regions', () => {
        const data = buildTokenMetadataData({
            mint: fakePubkey(0xbb),
            name: 'My Token',
            symbol: 'MYT',
            updateAuthority: fakePubkey(0xaa),
            uri: 'https://example.com/metadata.json',
        });
        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const names = regions.map(r => r.name);
        expect(names).toContain('TokenMetadata — Update Authority');
        expect(names).toContain('TokenMetadata — Mint');
        expect(names).toContain('TokenMetadata — Name');
        expect(names).toContain('TokenMetadata — Symbol');
        expect(names).toContain('TokenMetadata — URI');

        const uriRegion = regions.find(r => r.name === 'TokenMetadata — URI')!;
        if (uriRegion.decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(uriRegion.decodedValue.value).toBe('https://example.com/metadata.json');
    });

    it('security: javascript: URI rendered as plain text, never as a link', () => {
        const data = buildTokenMetadataData({ name: 'X', symbol: 'X', uri: 'javascript:alert(1)' });
        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const uriRegion = regions.find(r => r.name === 'TokenMetadata — URI')!;
        if (uriRegion.decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(uriRegion.decodedValue.value).toBe('javascript:alert(1)');
        // The DecodedValue is text/string — rendering as-is via React auto-escapes.
        // An <a href> link would require explicit opt-in; none exists in this path.
    });

    it('security: bidi override in name is sanitized', () => {
        const RLO = String.fromCodePoint(0x202e);
        const REPLACEMENT = String.fromCodePoint(0xfffd);
        const data = buildTokenMetadataData({ name: `${RLO}spoofed`, symbol: 'X', uri: '' });
        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const nameRegion = regions.find(r => r.name === 'TokenMetadata — Name')!;
        if (nameRegion.decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(nameRegion.decodedValue.value).not.toContain(RLO);
        expect(nameRegion.decodedValue.value).toContain(REPLACEMENT);
    });

    it('security: control chars in name are sanitized', () => {
        const NUL = String.fromCodePoint(0x00);
        const BEL = String.fromCodePoint(0x07);
        const REPLACEMENT = String.fromCodePoint(0xfffd);
        const data = buildTokenMetadataData({ name: `A${NUL}B${BEL}C`, symbol: 'X', uri: '' });
        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const nameRegion = regions.find(r => r.name === 'TokenMetadata — Name')!;
        if (nameRegion.decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(nameRegion.decodedValue.value).toBe(`A${REPLACEMENT}B${REPLACEMENT}C`);
    });

    it('security: overly long strings are truncated to MAX_DISPLAY_STRING', () => {
        const huge = 'x'.repeat(10_000);
        const data = buildTokenMetadataData({ name: 'X', symbol: 'X', uri: huge });
        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const uriRegion = regions.find(r => r.name === 'TokenMetadata — URI')!;
        if (uriRegion.decodedValue.kind !== 'text') throw new Error('unreachable');
        expect(uriRegion.decodedValue.value.length).toBeLessThanOrEqual(257); // 256 + ellipsis
        expect(uriRegion.decodedValue.value.endsWith('…')).toBe(true);
    });

    it('emits a trailing "Additional Metadata" region for bytes past the URI', () => {
        const trailing = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
        const data = buildTokenMetadataData({
            name: 'N',
            symbol: 'S',
            trailingBytes: trailing,
            uri: 'u',
        });
        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const additional = regions.find(r => r.name === 'TokenMetadata — Additional Metadata');
        expect(additional).toBeDefined();
        expect(additional!.length).toBe(trailing.length);
    });

    it('emits no sub-regions when length < 68 (undersized)', () => {
        const bytes = appendTlvTail(baseMint(), 1, [{ data: new Uint8Array(67), type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        // accountType + header only (header is "TokenMetadata — Header"; decoder contributed nothing)
        expect(regions).toHaveLength(2);
        expect(regions.find(r => r.name === 'TokenMetadata — Update Authority')).toBeUndefined();
        expect(regions.find(r => r.name === 'TokenMetadata — Mint')).toBeUndefined();
    });

    it('graceful truncation: TLV declares a long string with no remaining bytes', () => {
        // Construct a TokenMetadata payload where the URI length prefix claims 100 bytes
        // but the TLV entry only has 4 bytes of slack.
        const partial = concat(
            new Uint8Array(32), // updateAuthority
            fakePubkey(1), // mint
            borshString('N'), // name
            borshString('S'), // symbol
        );
        const uriLenPrefix = new Uint8Array(4);
        new DataView(uriLenPrefix.buffer).setUint32(0, 100, true);
        const data = concat(partial, uriLenPrefix); // declares 100 bytes, provides 0

        const bytes = appendTlvTail(baseMint(), 1, [{ data, type: 19 }]);
        const regions = walkTokenExtensions(bytes, SPL_MINT_SIZE);
        const truncated = regions.find(r => r.name.includes('truncated'));
        expect(truncated).toBeDefined();
        if (truncated!.decodedValue.kind !== 'unparsed') throw new Error('unreachable');
        expect(truncated!.decodedValue.reason).toBe('truncated');
        // No region overruns the buffer
        for (const r of regions) {
            expect(r.start + r.length).toBeLessThanOrEqual(bytes.length);
        }
    });
});
