export type FieldKind = 'authority' | 'amount' | 'pubkey' | 'scalar' | 'option' | 'neutral';

export type DecodedValue =
    | { kind: 'pubkey'; base58: string; isNone?: boolean }
    | { kind: 'amount'; raw: bigint; decimals?: number }
    | { kind: 'scalar'; value: number | string; label?: string }
    | { kind: 'option'; present: boolean }
    | { kind: 'text'; value: string }
    | { kind: 'unparsed'; reason: UnparsedReason };

// Distinct semantics for why a region has no decoded value. Rendered differently
// in tooltips so readers can tell a structural gap ('padding') from a missing
// parsed payload ('no-jsonparsed') from a not-applicable field ('not-applicable').
export type UnparsedReason =
    | 'no-jsonparsed' // Raw bytes present; jsonParsed didn't surface this field.
    | 'unknown-ext' // Token-2022 TLV extension type this code doesn't decode yet.
    | 'truncated' // TLV header or body extends past the buffer.
    | 'padding' // Spec-defined zero-fill or layout gap carrying no field value.
    | 'not-applicable'; // Field slot reserved but semantically disabled (e.g. nativeAmount when !isNative).

export interface LayoutField {
    id: string;
    name: string;
    start: number;
    length: number;
    kind: FieldKind;
}

export interface Region extends LayoutField {
    decodedValue: DecodedValue;
}
