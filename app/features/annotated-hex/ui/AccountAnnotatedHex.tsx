'use client';

import type { Account } from '@providers/accounts';
import { HexData } from '@shared/HexData';
import { ErrorBoundary } from 'react-error-boundary';

import { Logger } from '@/app/shared/lib/logger';

import { useAccountRegions } from '../model/use-account-regions';
import { AnnotatedHexData } from './AnnotatedHexData';

type Props = {
    account: Account;
    rawData: Uint8Array;
};

export function AccountAnnotatedHex({ account, rawData }: Props) {
    const pubkey = account.pubkey.toBase58();
    return (
        <ErrorBoundary
            fallback={<HexData raw={rawData} />}
            onError={error =>
                Logger.error(error, {
                    module: 'annotated-hex',
                    pubkey,
                    sentry: true,
                })
            }
            resetKeys={[pubkey]}
        >
            <Body account={account} rawData={rawData} />
        </ErrorBoundary>
    );
}

function Body({ account, rawData }: Props) {
    const regions = useAccountRegions(account, rawData);
    if (!regions) {
        return <HexData raw={rawData} />;
    }
    return <AnnotatedHexData raw={rawData} regions={regions} />;
}
