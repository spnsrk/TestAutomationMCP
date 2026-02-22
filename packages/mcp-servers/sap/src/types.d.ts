declare module "node-rfc" {
  export interface ConnectionParameters {
    ashost: string;
    sysnr: string;
    client: string;
    user: string;
    passwd: string;
    lang?: string;
  }

  export interface Client {
    open(): Promise<void>;
    close(): Promise<void>;
    call(
      functionModule: string,
      params: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    alive: boolean;
    connectionInfo?: Record<string, unknown>;
  }

  export class Client {
    constructor(connParams: ConnectionParameters);
  }
}
