/**
 * PBKDF2-SHA256 口令散列。Better Auth 默认的 scrypt 在 Workers 上代价高且并非各运行时都有，
 * 改用 WebCrypto 的 PBKDF2；参数内联在散列串里，日后可提高迭代次数。
 *
 * 迭代次数上限 10 万是硬约束：Cloudflare Workers 的 WebCrypto 对 PBKDF2 超过 100000
 * 一律抛 NotSupportedError，注册与登录都会 500。Node（本地 e2e）没有这个限制，
 * 所以本地全绿也拦不住这类回归，改这个常量前必须在真实 Workers 上验一次。
 */
const ITERATIONS = 100_000;
const KEY_LEN = 32;
/** Workers 允许的最大迭代次数，超过就无从计算，只能判定校验失败。 */
const MAX_ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  // 超出 Workers 上限的散列在这里就判失败，不能让 deriveBits 抛错把登录打成 500。
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > MAX_ITERATIONS) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
