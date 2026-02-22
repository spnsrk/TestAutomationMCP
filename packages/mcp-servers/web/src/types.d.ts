declare module "pngjs" {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
    constructor(options?: { width?: number; height?: number });
  }
}

declare module "pixelmatch" {
  function pixelmatch(
    img1: Buffer,
    img2: Buffer,
    output: Buffer | null,
    width: number,
    height: number,
    options?: { threshold?: number }
  ): number;
  export default pixelmatch;
}
