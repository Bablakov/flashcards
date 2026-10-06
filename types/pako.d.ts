// pako 1.x без собственных типов; описано только то, чем пользуется транспорт git.
declare module "pako" {
  export class Inflate {
    constructor(options?: Record<string, unknown>);
    push(data: Uint8Array, mode?: boolean | number): boolean;
    result: Uint8Array | string;
    err: number;
    msg: string;
    strm: { avail_in: number };
  }
  export function deflate(data: Uint8Array, options?: Record<string, unknown>): Uint8Array;
  export function inflate(data: Uint8Array, options?: Record<string, unknown>): Uint8Array;
  const pako: { Inflate: typeof Inflate; deflate: typeof deflate; inflate: typeof inflate };
  export default pako;
}
