import { SPL_MINT_SIZE } from '../spl-token';

export type TlvEntry = { type: number; data: Uint8Array };

export function appendTlvTail(base: Uint8Array, accountType: number, entries: TlvEntry[]): Uint8Array {
    const tailLen = 1 + entries.reduce((sum, e) => sum + 4 + e.data.length, 0);
    const out = new Uint8Array(base.length + tailLen);
    out.set(base, 0);
    out[base.length] = accountType;
    const view = new DataView(out.buffer);
    let pos = base.length + 1;
    for (const entry of entries) {
        view.setUint16(pos, entry.type, true);
        view.setUint16(pos + 2, entry.data.length, true);
        out.set(entry.data, pos + 4);
        pos += 4 + entry.data.length;
    }
    return out;
}

export function baseMint(): Uint8Array {
    return new Uint8Array(SPL_MINT_SIZE);
}

export function fakePubkey(seed: number): Uint8Array {
    return new Uint8Array(32).fill(seed);
}

export function borshString(text: string): Uint8Array {
    const utf8 = new TextEncoder().encode(text);
    const out = new Uint8Array(4 + utf8.length);
    new DataView(out.buffer).setUint32(0, utf8.length, true);
    out.set(utf8, 4);
    return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}
