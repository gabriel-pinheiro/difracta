/**
 * OSC 1.0 packets, the few dozen lines Difracta needs: messages with the
 * common argument types, bundles flattened in order (their time tags are
 * read and ignored, since a show is now). No dependency; the format is
 * four-byte aligned strings and big-endian numbers.
 */
export type OscArgument =
  | {
      readonly type: "int32" | "float32" | "double" | "int64";
      readonly value: number;
    }
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "blob"; readonly value: Uint8Array }
  | { readonly type: "true" | "false" | "nil" | "impulse" }
  /** RGBA, each channel 0..255. */
  | {
      readonly type: "color";
      readonly value: readonly [number, number, number, number];
    }
  | { readonly type: "timetag"; readonly value: bigint };

export interface OscMessage {
  readonly address: string;
  readonly args: readonly OscArgument[];
}

export interface OscBundle {
  readonly timetag: bigint;
  readonly elements: readonly OscPacket[];
}

export type OscPacket = OscMessage | OscBundle;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BUNDLE = "#bundle";

const padded = (length: number): number => (length + 4) & ~3;

class Reader {
  #offset = 0;
  readonly #view: DataView;
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done(): boolean {
    return this.#offset >= this.#bytes.byteLength;
  }

  string(): string {
    const end = this.#bytes.indexOf(0, this.#offset);
    if (end === -1) throw new Error("Unterminated OSC string.");
    const text = decoder.decode(this.#bytes.subarray(this.#offset, end));
    this.#offset += padded(end - this.#offset);
    return text;
  }

  int32(): number {
    const value = this.#view.getInt32(this.#offset);
    this.#offset += 4;
    return value;
  }

  float32(): number {
    const value = this.#view.getFloat32(this.#offset);
    this.#offset += 4;
    return value;
  }

  double(): number {
    const value = this.#view.getFloat64(this.#offset);
    this.#offset += 8;
    return value;
  }

  int64(): bigint {
    const value = this.#view.getBigInt64(this.#offset);
    this.#offset += 8;
    return value;
  }

  bytes(length: number): Uint8Array {
    const slice = this.#bytes.slice(this.#offset, this.#offset + length);
    this.#offset += padded(length - 1);
    return slice;
  }
}

export function decodePacket(bytes: Uint8Array): OscPacket {
  const reader = new Reader(bytes);
  const head = reader.string();
  if (head === BUNDLE) {
    const timetag = reader.int64();
    const elements: OscPacket[] = [];
    while (!reader.done) {
      const size = reader.int32();
      elements.push(decodePacket(reader.bytes(size)));
    }
    return { timetag, elements };
  }
  if (!head.startsWith("/")) throw new Error(`Not an OSC address: ${head}`);
  const tags = reader.done ? "," : reader.string();
  if (!tags.startsWith(",")) throw new Error("Missing OSC type tags.");
  const args: OscArgument[] = [];
  for (const tag of tags.slice(1)) {
    switch (tag) {
      case "i":
        args.push({ type: "int32", value: reader.int32() });
        break;
      case "f":
        args.push({ type: "float32", value: reader.float32() });
        break;
      case "d":
        args.push({ type: "double", value: reader.double() });
        break;
      case "h":
        args.push({ type: "int64", value: Number(reader.int64()) });
        break;
      case "s":
      case "S":
        args.push({ type: "string", value: reader.string() });
        break;
      case "b":
        args.push({ type: "blob", value: reader.bytes(reader.int32()) });
        break;
      case "r": {
        const [r = 0, g = 0, b = 0, a = 0] = reader.bytes(4);
        args.push({ type: "color", value: [r, g, b, a] });
        break;
      }
      case "t":
        args.push({ type: "timetag", value: reader.int64() });
        break;
      case "T":
        args.push({ type: "true" });
        break;
      case "F":
        args.push({ type: "false" });
        break;
      case "N":
        args.push({ type: "nil" });
        break;
      case "I":
        args.push({ type: "impulse" });
        break;
      default:
        throw new Error(`Unsupported OSC type tag “${tag}”.`);
    }
  }
  return { address: head, args };
}

/** The messages of a packet in order: a bundle's elements, recursively. */
export function messagesOf(packet: OscPacket): readonly OscMessage[] {
  return "address" in packet
    ? [packet]
    : packet.elements.flatMap((element) => messagesOf(element));
}

function stringBytes(text: string): Uint8Array {
  const raw = encoder.encode(text);
  const out = new Uint8Array(padded(raw.length));
  out.set(raw);
  return out;
}

export function encodeMessage(message: OscMessage): Uint8Array {
  const parts: Uint8Array[] = [stringBytes(message.address)];
  let tags = ",";
  const payload: Uint8Array[] = [];
  for (const arg of message.args) {
    switch (arg.type) {
      case "int32": {
        tags += "i";
        const out = new Uint8Array(4);
        new DataView(out.buffer).setInt32(0, Math.trunc(arg.value));
        payload.push(out);
        break;
      }
      case "float32": {
        tags += "f";
        const out = new Uint8Array(4);
        new DataView(out.buffer).setFloat32(0, arg.value);
        payload.push(out);
        break;
      }
      case "double": {
        tags += "d";
        const out = new Uint8Array(8);
        new DataView(out.buffer).setFloat64(0, arg.value);
        payload.push(out);
        break;
      }
      case "int64": {
        tags += "h";
        const out = new Uint8Array(8);
        new DataView(out.buffer).setBigInt64(0, BigInt(Math.trunc(arg.value)));
        payload.push(out);
        break;
      }
      case "string":
        tags += "s";
        payload.push(stringBytes(arg.value));
        break;
      case "blob": {
        tags += "b";
        const out = new Uint8Array(4 + padded(arg.value.length - 1));
        new DataView(out.buffer).setInt32(0, arg.value.length);
        out.set(arg.value, 4);
        payload.push(out);
        break;
      }
      case "color":
        tags += "r";
        payload.push(Uint8Array.from(arg.value));
        break;
      case "timetag": {
        tags += "t";
        const out = new Uint8Array(8);
        new DataView(out.buffer).setBigInt64(0, arg.value);
        payload.push(out);
        break;
      }
      case "true":
        tags += "T";
        break;
      case "false":
        tags += "F";
        break;
      case "nil":
        tags += "N";
        break;
      case "impulse":
        tags += "I";
        break;
    }
  }
  parts.push(stringBytes(tags), ...payload);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
