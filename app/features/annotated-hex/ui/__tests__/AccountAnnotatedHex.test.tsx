import type { Account } from '@providers/accounts';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@/app/shared/lib/logger';

import { AccountAnnotatedHex } from '../AccountAnnotatedHex';

// Mocked at module level so we can swap return values per-test.
const mockUseAccountRegions = vi.fn();
vi.mock('../../model/use-account-regions', () => ({
    useAccountRegions: (...args: unknown[]) => mockUseAccountRegions(...args),
}));

// AnnotatedHexData is rendered when regions exist; we substitute a child that throws
// to exercise the ErrorBoundary fallback path.
const mockAnnotatedHexData = vi.fn();
vi.mock('../AnnotatedHexData', () => ({
    AnnotatedHexData: (props: unknown) => mockAnnotatedHexData(props),
}));

function makeAccount(): Account {
    return {
        data: { raw: undefined },
        executable: false,
        lamports: 1,
        owner: SystemProgram.programId,
        pubkey: PublicKey.default,
    };
}

describe('AccountAnnotatedHex', () => {
    beforeEach(() => {
        mockUseAccountRegions.mockReset();
        mockAnnotatedHexData.mockReset();
        // Default: pass-through renderer that returns a recognizable node.
        mockAnnotatedHexData.mockImplementation(() => <div data-testid="mock-annotated-hex" />);
    });

    it('renders <HexData> when useAccountRegions returns null (unsupported owner)', () => {
        mockUseAccountRegions.mockReturnValue(null);
        const rawData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        render(<AccountAnnotatedHex account={makeAccount()} rawData={rawData} />);

        // HexData renders bytes inside <pre> elements; the annotated grid would not be present.
        expect(screen.queryByTestId('mock-annotated-hex')).not.toBeInTheDocument();
        // HexData groups bytes into space-separated text spans like "de ad be ef".
        // eslint-disable-next-line testing-library/no-node-access -- verify HexData fallback renders via its characteristic <pre> structure
        expect(document.querySelectorAll('pre').length).toBeGreaterThan(0);
    });

    it('renders <AnnotatedHexData> when useAccountRegions returns regions', () => {
        mockUseAccountRegions.mockReturnValue([
            {
                decodedValue: { kind: 'unparsed', reason: 'no-jsonparsed' },
                id: 'test.region',
                kind: 'neutral',
                length: 4,
                name: 'Test',
                start: 0,
            },
        ]);
        const rawData = new Uint8Array([0, 0, 0, 0]);
        render(<AccountAnnotatedHex account={makeAccount()} rawData={rawData} />);

        expect(screen.getByTestId('mock-annotated-hex')).toBeInTheDocument();
    });

    it('falls back to <HexData> and logs via Logger.error when a child throws', () => {
        mockUseAccountRegions.mockReturnValue([
            {
                decodedValue: { kind: 'unparsed', reason: 'no-jsonparsed' },
                id: 'test.region',
                kind: 'neutral',
                length: 4,
                name: 'Test',
                start: 0,
            },
        ]);
        mockAnnotatedHexData.mockImplementation(() => {
            throw new Error('boom');
        });

        const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
        // React logs to console.error on error-boundary triggers; silence it.
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const rawData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
        render(<AccountAnnotatedHex account={makeAccount()} rawData={rawData} />);

        expect(loggerSpy).toHaveBeenCalled();
        const [loggedError, loggedContext] = loggerSpy.mock.calls[0];
        expect(loggedError).toBeInstanceOf(Error);
        expect((loggedError as Error).message).toBe('boom');
        expect(loggedContext).toMatchObject({ module: 'annotated-hex', sentry: true });

        // Fallback HexData renders — characterised by its <pre> layout.
        // eslint-disable-next-line testing-library/no-node-access -- verify HexData fallback renders via its characteristic <pre> structure
        expect(document.querySelectorAll('pre').length).toBeGreaterThan(0);

        loggerSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });
});
