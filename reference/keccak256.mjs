// Original bounded Ethereum Keccak-256, not FIPS SHA3-256.
// Keccak-f[1600], rate 1088, capacity 512, legacy byte suffix 0x01.
// Specification: https://keccak.team/keccak_specs_summary.html
import { Buffer } from 'node:buffer';

const MASK = (1n << 64n) - 1n;
const ROTATION = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39,
  41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const ROUND = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

function rotate(word, count) {
  const bits = BigInt(count);
  return ((word << bits) | (word >> (64n - bits))) & MASK;
}

function permute(lanes) {
  const columns = new Array(5), mixed = new Array(25);
  for (const constant of ROUND) {
    for (let x = 0; x < 5; x += 1) {
      columns[x] = lanes[x] ^ lanes[x + 5] ^ lanes[x + 10] ^ lanes[x + 15] ^ lanes[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const delta = columns[(x + 4) % 5] ^ rotate(columns[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) lanes[x + 5 * y] ^= delta;
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        mixed[y + 5 * ((2 * x + 3 * y) % 5)] = rotate(lanes[x + 5 * y], ROTATION[x + 5 * y]);
      }
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        lanes[x + 5 * y] = mixed[x + 5 * y] ^ ((~mixed[(x + 1) % 5 + 5 * y]) & mixed[(x + 2) % 5 + 5 * y]);
      }
    }
    lanes[0] ^= constant;
  }
}

export function keccak256Hex(dataHex) {
  if (arguments.length !== 1 || typeof dataHex !== 'string' || dataHex.length > 131074 ||
      !dataHex.startsWith('0x') || dataHex.length % 2 !== 0 || /[^0-9a-f]/.test(dataHex.slice(2))) {
    const error = new Error('Keccak input must be lowercase byte DATA within 65,536 bytes.');
    error.code = 'KECCAK_INPUT';
    throw error;
  }
  const input = Buffer.from(dataHex.slice(2), 'hex');
  const padded = Buffer.alloc((Math.floor(input.length / 136) + 1) * 136);
  input.copy(padded);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const lanes = new Array(25).fill(0n);
  for (let block = 0; block < padded.length; block += 136) {
    for (let byte = 0; byte < 136; byte += 1) {
      lanes[Math.floor(byte / 8)] ^= BigInt(padded[block + byte]) << BigInt(8 * (byte % 8));
    }
    permute(lanes);
  }
  const output = Buffer.alloc(32);
  for (let byte = 0; byte < 32; byte += 1) output[byte] = Number((lanes[Math.floor(byte / 8)] >> BigInt(8 * (byte % 8))) & 255n);
  return '0x' + output.toString('hex');
}
