import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildSplMintRegions, SPL_MINT_SIZE } from '../../model/spl-token';
import { Region } from '../../model/types';
import { __test_exports__, AnnotatedHexData } from '../AnnotatedHexData';

const { TooltipBody } = __test_exports__;

// Radix Tooltip pulls in ResizeObserver + DOMRect via @radix-ui/react-use-size; jsdom lacks both.
beforeAll(() => {
    if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
        (globalThis as Record<string, unknown>).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
    if (typeof (globalThis as Record<string, unknown>).DOMRect === 'undefined') {
        (globalThis as Record<string, unknown>).DOMRect = class {
            bottom = 0;
            height = 0;
            left = 0;
            right = 0;
            top = 0;
            width = 0;
            x = 0;
            y = 0;
            static fromRect() {
                return new this();
            }
            toJSON() {
                return this;
            }
        };
    }
});

function buildBytes(): Uint8Array {
    const bytes = new Uint8Array(SPL_MINT_SIZE);
    const view = new DataView(bytes.buffer);
    bytes.set(new Uint8Array(32).fill(7), 4);
    view.setUint32(0, 1, true);
    view.setBigUint64(36, 1_000_000n, true);
    bytes[44] = 6;
    bytes[45] = 1;
    return bytes;
}

describe('AnnotatedHexData', () => {
    it('renders one cell per byte', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        render(<AnnotatedHexData raw={bytes} regions={regions} />);

        for (let i = 0; i < bytes.length; i++) {
            expect(screen.getByTestId(`annotated-cell-${i}`)).toBeInTheDocument();
        }
    });

    it('cells within a region share a region id via data-region-id', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        render(<AnnotatedHexData raw={bytes} regions={regions} />);

        for (let i = 4; i < 36; i++) {
            expect(screen.getByTestId(`annotated-cell-${i}`)).toHaveAttribute('data-region-id', 'mint.mintAuthority');
        }
    });

    it('only the region-start segment is a tab stop; other segments of the same region are -1', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        render(<AnnotatedHexData raw={bytes} regions={regions} />);

        // mint.mintAuthority starts at byte 4 → first segment trigger at offset 4 gets tabIndex=0
        expect(screen.getByTestId('annotated-segment-4')).toHaveAttribute('tabindex', '0');
        // mint.mintAuthority spills into the next row starting at offset 16 → same region, not the start → -1
        expect(screen.getByTestId('annotated-segment-16')).toHaveAttribute('tabindex', '-1');
        // mint.supply starts at byte 36 — different region, its first segment is a tab stop
        expect(screen.getByTestId('annotated-segment-36')).toHaveAttribute('tabindex', '0');
    });

    it('TooltipBody renders pubkey DecodedValue as base58 <code>', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        const mintAuthRegion = regions.find(r => r.id === 'mint.mintAuthority')!;
        render(<TooltipBody region={mintAuthRegion} />);

        expect(screen.getByTestId('annotated-tooltip-mint.mintAuthority')).toHaveTextContent('Mint Authority');
        const text = screen.getByTestId('decoded-pubkey').textContent ?? '';
        expect(text.length).toBeGreaterThanOrEqual(32);
        expect(text.length).toBeLessThanOrEqual(44);
        // eslint-disable-next-line no-restricted-syntax -- base58 alphabet validation
        expect(text).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it('TooltipBody renders amount DecodedValue as raw + ui-scaled', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, {
            decimals: 6,
            freezeAuthority: null,
            isInitialized: true,
            mintAuthority: null,
            supply: '1234567890',
        });
        const supplyRegion = regions.find(r => r.id === 'mint.supply')!;
        render(<TooltipBody region={supplyRegion} />);

        const tooltip = screen.getByTestId('annotated-tooltip-mint.supply');
        expect(tooltip).toHaveTextContent('Supply');
        expect(tooltip).toHaveTextContent('1234567890');
        expect(tooltip).toHaveTextContent('1234.567890 with 6 decimals');
    });

    it('TooltipBody renders isNone pubkey as "None" span, not a code element', () => {
        const bytes = new Uint8Array(SPL_MINT_SIZE);
        bytes[45] = 1;
        const regions = buildSplMintRegions(bytes, undefined);
        const authRegion = regions.find(r => r.id === 'mint.mintAuthority')!;
        render(<TooltipBody region={authRegion} />);

        expect(screen.getByTestId('annotated-tooltip-mint.mintAuthority')).toHaveTextContent('None');
        expect(screen.getByTestId('decoded-pubkey-none')).toBeInTheDocument();
        expect(screen.queryByTestId('decoded-pubkey')).not.toBeInTheDocument();
    });

    it('TooltipBody shows the byte range', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        const supplyRegion = regions.find(r => r.id === 'mint.supply')!;
        render(<TooltipBody region={supplyRegion} />);

        const tooltip = screen.getByTestId('annotated-tooltip-mint.supply');
        // eslint-disable-next-line no-restricted-syntax -- verify byte-range summary
        expect(tooltip).toHaveTextContent(/bytes \[36\.\.44\]/);
        expect(tooltip).toHaveTextContent('8 bytes');
    });

    it('does not render <a> elements for text DecodedValues', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        render(<AnnotatedHexData raw={bytes} regions={regions} />);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    it('renders the legend with one chip per unique region', () => {
        const bytes = buildBytes();
        const regions = buildSplMintRegions(bytes, undefined);
        render(<AnnotatedHexData raw={bytes} regions={regions} />);

        expect(screen.getByTestId('annotated-hex-legend')).toBeInTheDocument();
        expect(screen.getByTestId('annotated-hex-legend-mint.mintAuthority')).toBeInTheDocument();
        expect(screen.getByTestId('annotated-hex-legend-mint.supply')).toBeInTheDocument();
        expect(screen.getByTestId('annotated-hex-legend-mint.freezeAuthority')).toBeInTheDocument();
    });

    it('TooltipBody renders scalar DecodedValue with value and label', () => {
        const region: Region = {
            decodedValue: { kind: 'scalar', label: 'Initialized', value: 'Yes' },
            id: 'test.scalar',
            kind: 'scalar',
            length: 1,
            name: 'Test Scalar',
            start: 0,
        };
        render(<TooltipBody region={region} />);

        const tooltip = screen.getByTestId('annotated-tooltip-test.scalar');
        expect(tooltip).toHaveTextContent('Test Scalar');
        expect(tooltip).toHaveTextContent('Yes');
        expect(tooltip).toHaveTextContent('(Initialized)');
    });

    it('TooltipBody renders option DecodedValue as "Some" or "None"', () => {
        const someRegion: Region = {
            decodedValue: { kind: 'option', present: true },
            id: 'test.optionSome',
            kind: 'option',
            length: 4,
            name: 'Option Some',
            start: 0,
        };
        const { rerender } = render(<TooltipBody region={someRegion} />);
        expect(screen.getByTestId('annotated-tooltip-test.optionSome')).toHaveTextContent('Some');

        const noneRegion: Region = {
            decodedValue: { kind: 'option', present: false },
            id: 'test.optionNone',
            kind: 'option',
            length: 4,
            name: 'Option None',
            start: 0,
        };
        rerender(<TooltipBody region={noneRegion} />);
        expect(screen.getByTestId('annotated-tooltip-test.optionNone')).toHaveTextContent('None');
    });

    it('TooltipBody renders text DecodedValue as plain text', () => {
        const region: Region = {
            decodedValue: { kind: 'text', value: 'hello world' },
            id: 'test.text',
            kind: 'neutral',
            length: 11,
            name: 'Test Text',
            start: 0,
        };
        render(<TooltipBody region={region} />);

        const tooltip = screen.getByTestId('annotated-tooltip-test.text');
        expect(tooltip).toHaveTextContent('Test Text');
        expect(tooltip).toHaveTextContent('hello world');
    });

    it('TooltipBody renders unparsed DecodedValue with reason', () => {
        const region: Region = {
            decodedValue: { kind: 'unparsed', reason: 'no-jsonparsed' },
            id: 'test.unparsed',
            kind: 'neutral',
            length: 4,
            name: 'Test Unparsed',
            start: 0,
        };
        render(<TooltipBody region={region} />);

        const tooltip = screen.getByTestId('annotated-tooltip-test.unparsed');
        expect(tooltip).toHaveTextContent('Test Unparsed');
        expect(tooltip).toHaveTextContent('(no parsed data)');
    });

    it('TooltipBody renders amount DecodedValue without decimals as raw only (no ui-scaled)', () => {
        const region: Region = {
            decodedValue: { kind: 'amount', raw: 1234567890n },
            id: 'test.amountNoDecimals',
            kind: 'amount',
            length: 8,
            name: 'Amount No Decimals',
            start: 0,
        };
        render(<TooltipBody region={region} />);

        const tooltip = screen.getByTestId('annotated-tooltip-test.amountNoDecimals');
        expect(tooltip).toHaveTextContent('Amount No Decimals');
        expect(tooltip).toHaveTextContent('1234567890');
        expect(tooltip).not.toHaveTextContent('with');
        expect(tooltip).not.toHaveTextContent('decimals');
    });

    it('renders uncovered bytes via UnannotatedSegment when regions do not span the full buffer', () => {
        // Build a 20-byte buffer but only cover bytes [0..8] with a single region.
        // Bytes 8..20 should render as UnannotatedSegment cells (no data-region-id).
        const bytes = new Uint8Array(20);
        const regions: Region[] = [
            {
                decodedValue: { kind: 'amount', raw: 0n },
                id: 'partial.region',
                kind: 'amount',
                length: 8,
                name: 'Partial Region',
                start: 0,
            },
        ];
        render(<AnnotatedHexData raw={bytes} regions={regions} />);

        // Covered cells have data-region-id set.
        expect(screen.getByTestId('annotated-cell-0')).toHaveAttribute('data-region-id', 'partial.region');
        // Uncovered cells render without a region id (UnannotatedSegment).
        const uncoveredCell = screen.getByTestId('annotated-cell-10');
        expect(uncoveredCell).not.toHaveAttribute('data-region-id');
    });
});
