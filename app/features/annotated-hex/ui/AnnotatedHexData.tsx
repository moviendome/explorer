'use client';

import { TooltipProvider } from '@components/shared/ui/tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@shared/utils';
import { useMemo } from 'react';

import { DecodedValue, Region, UnparsedReason } from '../model/types';
import { cellClasses, chipClasses } from './palette';

const ROW_SIZE = 16;

const UNPARSED_REASON_LABEL: Record<UnparsedReason, string> = {
    malformed: 'malformed',
    'no-jsonparsed': 'no parsed data',
    'not-applicable': 'not applicable',
    padding: 'padding',
    truncated: 'truncated',
    'unknown-ext': 'unknown extension',
};

type Props = {
    raw: Uint8Array;
    regions: Region[];
};

export function AnnotatedHexData({ raw, regions }: Props) {
    const { offsetMap, regionIndexById } = useMemo(() => {
        const offsets = new Array<Region | undefined>(raw.length);
        const indexById = new Map<string, number>();
        regions.forEach((r, idx) => {
            if (!indexById.has(r.id)) indexById.set(r.id, idx);
            for (let i = 0; i < r.length; i++) {
                const offset = r.start + i;
                if (offset < raw.length) offsets[offset] = r;
            }
        });
        return { offsetMap: offsets, regionIndexById: indexById };
    }, [regions]);

    const rows = useMemo(() => {
        const result: { offset: number; bytes: Uint8Array }[] = [];
        for (let i = 0; i < raw.length; i += ROW_SIZE) {
            result.push({ bytes: raw.slice(i, Math.min(i + ROW_SIZE, raw.length)), offset: i });
        }
        return result;
    }, [raw]);

    return (
        <TooltipProvider delayDuration={200} skipDelayDuration={400} disableHoverableContent>
            <div className="e-flex e-flex-col e-items-end e-gap-3">
                <div
                    role="grid"
                    aria-label="Account hex dump"
                    aria-rowcount={rows.length}
                    aria-colcount={ROW_SIZE}
                    className="e-inline-block e-font-mono e-text-xs e-leading-tight"
                    data-testid="annotated-hex-grid"
                >
                    {rows.map(row => (
                        <Row
                            key={row.offset}
                            rowOffset={row.offset}
                            rowBytes={row.bytes}
                            offsetMap={offsetMap}
                            regionIndexById={regionIndexById}
                        />
                    ))}
                </div>
                <Legend regions={regions} />
            </div>
        </TooltipProvider>
    );
}

// Legend: one chip per unique region id. Chip color matches cell color by
// using the region's FIRST index in the regions array as the rotation key
// (same rule as `regionIndexById` above).
function Legend({ regions }: { regions: Region[] }) {
    const seen = new Set<string>();
    const unique: { region: Region; rotationIndex: number }[] = [];
    regions.forEach((region, rotationIndex) => {
        if (seen.has(region.id)) return;
        seen.add(region.id);
        unique.push({ region, rotationIndex });
    });
    if (unique.length === 0) return null;
    return (
        <div
            data-testid="annotated-hex-legend"
            className="e-mt-3 e-flex e-flex-wrap e-justify-end e-gap-2 e-text-xs"
            aria-label="Field legend"
        >
            {unique.map(({ region, rotationIndex }) => (
                <span
                    key={region.id}
                    data-testid={`annotated-hex-legend-${region.id}`}
                    className={cn(
                        'e-inline-flex e-items-center e-gap-1 e-rounded e-border e-px-2 e-py-0.5 e-font-medium',
                        chipClasses(region.kind === 'neutral', rotationIndex),
                    )}
                >
                    {region.name}
                </span>
            ))}
        </div>
    );
}

type Segment = {
    startOffset: number;
    length: number;
    region: Region | undefined;
};

function Row({
    rowOffset,
    rowBytes,
    offsetMap,
    regionIndexById,
}: {
    rowOffset: number;
    rowBytes: Uint8Array;
    offsetMap: readonly (Region | undefined)[];
    regionIndexById: ReadonlyMap<string, number>;
}) {
    const segments: Segment[] = [];
    for (let i = 0; i < rowBytes.length; i++) {
        const offset = rowOffset + i;
        const region = offsetMap[offset];
        const last = segments[segments.length - 1];
        if (last && last.region === region) {
            last.length++;
        } else {
            segments.push({ length: 1, region, startOffset: offset });
        }
    }

    return (
        <div role="row" className="e-flex e-justify-end e-gap-px e-py-px">
            {segments.map(segment => {
                const relStart = segment.startOffset - rowOffset;
                const bytes = rowBytes.subarray(relStart, relStart + segment.length);
                return segment.region ? (
                    <RegionSegment
                        key={segment.startOffset}
                        startOffset={segment.startOffset}
                        bytes={bytes}
                        region={segment.region}
                        rotationIndex={regionIndexById.get(segment.region.id) ?? 0}
                    />
                ) : (
                    <UnannotatedSegment key={segment.startOffset} startOffset={segment.startOffset} bytes={bytes} />
                );
            })}
        </div>
    );
}

function RegionSegment({
    startOffset,
    bytes,
    region,
    rotationIndex,
}: {
    startOffset: number;
    bytes: Uint8Array;
    region: Region;
    rotationIndex: number;
}) {
    const isRegionStart = startOffset === region.start;
    return (
        <TooltipPrimitive.Root>
            <TooltipPrimitive.Trigger asChild>
                <span
                    data-testid={`annotated-segment-${startOffset}`}
                    data-region-id={region.id}
                    tabIndex={isRegionStart ? 0 : -1}
                    aria-label={region.name}
                    className={cn(
                        'e-inline-flex e-gap-px e-rounded-[2px] e-cursor-help e-outline-none',
                        'focus-visible:e-ring-2 focus-visible:e-ring-white/40',
                        cellClasses(region.kind === 'neutral', rotationIndex),
                    )}
                >
                    {Array.from(bytes, (byte, i) => (
                        <Cell
                            key={startOffset + i}
                            offset={startOffset + i}
                            byte={byte}
                            regionId={region.id}
                        />
                    ))}
                </span>
            </TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    side="top"
                    sideOffset={0}
                    className={cn(
                        'e-animate-in e-fade-in-0 e-zoom-in-95 data-[state=closed]:e-animate-out data-[state=closed]:e-fade-out-0 data-[state=closed]:e-zoom-out-95 data-[side=bottom]:e-slide-in-from-top-2 data-[side=left]:e-slide-in-from-right-2 data-[side=right]:e-slide-in-from-left-2 data-[side=top]:e-slide-in-from-bottom-2 e-origin-(--radix-tooltip-content-transform-origin) e-z-50 e-w-fit e-text-balance e-rounded-md e-bg-neutral-900 e-px-3 e-py-1.5 e-text-xs e-text-neutral-50 dark:e-bg-neutral-50 dark:e-text-neutral-900',
                        'e-max-w-sm e-break-words',
                    )}
                >
                    <TooltipBody region={region} />
                    <TooltipPrimitive.Arrow className="e-fill-primary e-z-50 e-size-2.5 e-translate-y-[calc(-50%_-_2px)] e-rotate-0 e-rounded-[2px] e-fill-transparent dark:e-fill-neutral-50" />
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    );
}

function UnannotatedSegment({ startOffset, bytes }: { startOffset: number; bytes: Uint8Array }) {
    return (
        <span className="e-inline-flex e-gap-px e-text-neutral-500">
            {Array.from(bytes, (byte, i) => (
                <Cell key={startOffset + i} offset={startOffset + i} byte={byte} />
            ))}
        </span>
    );
}

function Cell({ offset, byte, regionId }: { offset: number; byte: number; regionId?: string }) {
    return (
        <span
            role="gridcell"
            data-testid={`annotated-cell-${offset}`}
            data-region-id={regionId}
            className="e-px-1 e-py-0.5"
        >
            {byte.toString(16).padStart(2, '0')}
        </span>
    );
}

function TooltipBody({ region }: { region: Region }) {
    return (
        <div
            data-testid={`annotated-tooltip-${region.id}`}
            className="e-flex e-flex-col e-gap-0.5 e-text-xs"
        >
            <div className="e-font-semibold e-text-neutral-50 dark:e-text-neutral-900">{region.name}</div>
            <div className="e-text-neutral-200 dark:e-text-neutral-700">
                <RenderDecodedValue value={region.decodedValue} />
            </div>
            <div className="e-mt-1 e-text-[10px] e-text-neutral-400 dark:e-text-neutral-600">
                bytes [{region.start}..{region.start + region.length}] · {region.length} byte
                {region.length === 1 ? '' : 's'}
            </div>
        </div>
    );
}

function RenderDecodedValue({ value }: { value: DecodedValue }) {
    switch (value.kind) {
        case 'pubkey':
            return value.isNone ? (
                <span data-testid="decoded-pubkey-none" className="e-italic e-text-neutral-400">
                    None
                </span>
            ) : (
                <code data-testid="decoded-pubkey" className="e-font-mono">
                    {value.base58}
                </code>
            );
        case 'amount': {
            const raw = value.raw.toString();
            // Cap at 19: u64-fractional precision. Anything larger comes from RPC
            // drift (decimals on-chain is u8, but the validator schema does not
            // bound it) and would compute 10n**N + padStart(N) on every hover —
            // pathological values like 255 produce multi-kilobyte tooltip strings.
            const DECIMALS_DISPLAY_MAX = 19;
            const decimals = value.decimals;
            if (decimals != null && decimals >= 0 && decimals <= DECIMALS_DISPLAY_MAX) {
                const div = 10n ** BigInt(decimals);
                const negative = value.raw < 0n;
                const abs = negative ? -value.raw : value.raw;
                const whole = abs / div;
                const frac = (abs % div).toString().padStart(decimals, '0');
                const sign = negative ? '-' : '';
                return (
                    <span>
                        <code className="e-font-mono">{raw}</code>{' '}
                        <span className="e-text-neutral-400">
                            ({sign}{whole.toString()}.{frac} with {value.decimals} decimals)
                        </span>
                    </span>
                );
            }
            if (value.decimals != null) {
                return (
                    <span>
                        <code className="e-font-mono">{raw}</code>{' '}
                        <span className="e-text-neutral-400">
                            (decimals={value.decimals} out of displayable range)
                        </span>
                    </span>
                );
            }
            return <code className="e-font-mono">{raw}</code>;
        }
        case 'scalar':
            return (
                <span>
                    <code className="e-font-mono">{String(value.value)}</code>
                    {value.label && <span className="e-text-neutral-400"> ({value.label})</span>}
                </span>
            );
        case 'option':
            return <span>{value.present ? 'Some' : 'None'}</span>;
        case 'text':
            return <span className="e-break-words">{value.value}</span>;
        case 'unparsed':
            return <span className="e-italic e-text-neutral-400">({UNPARSED_REASON_LABEL[value.reason]})</span>;
        default: {
            const _exhaustive: never = value;
            void _exhaustive;
            return null;
        }
    }
}

/**
 * Test-only export surface. These are internal implementation details that
 * the test suite exercises directly to unit-test rendering per DecodedValue
 * kind without mounting the full grid. Do NOT import in production code —
 * the prop signatures here are not part of the module's public API.
 * @internal
 */
export const __test_exports__ = { TooltipBody };

