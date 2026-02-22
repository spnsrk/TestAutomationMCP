import { z } from "zod";

export const ConnectorConfigSchema = z.object({
  type: z.string(),
  baseUrl: z.string().url(),
  auth: z.object({
    type: z.enum(["basic", "token", "oauth"]),
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
  }),
});

export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

export interface RequirementDocument {
  id: string;
  externalId: string;
  title: string;
  description: string;
  source: string;
  type: string;
  priority?: string;
  labels?: string[];
  acceptanceCriteria?: string[];
  rawData: Record<string, unknown>;
}

export interface ConnectorQuery {
  project?: string;
  labels?: string[];
  status?: string[];
  maxResults?: number;
  query?: string;
}

export interface Connector {
  name: string;
  authenticate(config: ConnectorConfig): Promise<void>;
  testConnection(): Promise<boolean>;
  fetchRequirements(query: ConnectorQuery): Promise<RequirementDocument[]>;
  fetchSingle(externalId: string): Promise<RequirementDocument | null>;
}
