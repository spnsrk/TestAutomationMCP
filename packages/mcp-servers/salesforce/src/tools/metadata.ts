import { z } from "zod";
import type { Connection } from "jsforce";
import type { ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("sf-metadata");

export const metadataTools = {
  "sf/metadata.describeObject": {
    description:
      "Describe a Salesforce SObject including its fields, relationships, record types, and key properties",
    inputSchema: z.object({
      objectName: z
        .string()
        .describe("SObject API name (e.g., Account, Custom_Object__c)"),
    }),
    handler: async (
      conn: Connection,
      params: { objectName: string }
    ): Promise<ToolResult> => {
      const describe = await conn.sobject(params.objectName).describe();

      const fields = describe.fields.map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        length: f.length,
        required: !f.nillable && !f.defaultedOnCreate,
        updateable: f.updateable,
        createable: f.createable,
        custom: f.custom,
        referenceTo: f.referenceTo,
        relationshipName: f.relationshipName,
        picklistValues: f.picklistValues?.map((pv) => ({
          value: pv.value,
          label: pv.label,
          active: pv.active,
          defaultValue: pv.defaultValue,
        })),
        externalId: f.externalId,
      }));

      const childRelationships = describe.childRelationships.map((cr) => ({
        childSObject: cr.childSObject,
        field: cr.field,
        relationshipName: cr.relationshipName,
      }));

      const recordTypes = describe.recordTypeInfos.map((rt) => ({
        recordTypeId: rt.recordTypeId,
        name: rt.name,
        available: rt.available,
        defaultRecordTypeMapping: rt.defaultRecordTypeMapping,
      }));

      logger.info(
        {
          objectName: params.objectName,
          fieldCount: fields.length,
          childRelCount: childRelationships.length,
        },
        "Object described"
      );

      return {
        status: "success",
        tool: "sf/metadata.describeObject",
        duration: 0,
        data: {
          name: describe.name,
          label: describe.label,
          labelPlural: describe.labelPlural,
          keyPrefix: describe.keyPrefix,
          custom: describe.custom,
          queryable: describe.queryable,
          createable: describe.createable,
          updateable: describe.updateable,
          deletable: describe.deletable,
          fields,
          childRelationships,
          recordTypes,
        },
      };
    },
  },

  "sf/metadata.getFieldSet": {
    description:
      "Get the details of a field set on a Salesforce object, including its member fields",
    inputSchema: z.object({
      objectName: z.string().describe("SObject API name"),
      fieldSetName: z
        .string()
        .describe("Field set API name (developer name)"),
    }),
    handler: async (
      conn: Connection,
      params: { objectName: string; fieldSetName: string }
    ): Promise<ToolResult> => {
      const fullName = `${params.objectName}.${params.fieldSetName}`;

      const result = await conn.metadata.read("FieldSet", [fullName]);

      const fieldSets = Array.isArray(result) ? result : [result];
      const fieldSet = fieldSets[0] as {
        fullName: string;
        label: string;
        description?: string;
        displayedFields?: Array<{
          field: string;
          isFieldManaged: boolean;
          isRequired: boolean;
        }>;
        availableFields?: Array<{
          field: string;
          isFieldManaged: boolean;
          isRequired: boolean;
        }>;
      } | undefined;

      if (!fieldSet || !fieldSet.fullName) {
        return {
          status: "failure",
          tool: "sf/metadata.getFieldSet",
          duration: 0,
          error: {
            code: "FIELD_SET_NOT_FOUND",
            message: `Field set '${fullName}' not found`,
          },
        };
      }

      logger.info(
        { fieldSet: fullName },
        "Field set retrieved"
      );

      return {
        status: "success",
        tool: "sf/metadata.getFieldSet",
        duration: 0,
        data: {
          fullName: fieldSet.fullName,
          label: fieldSet.label,
          description: fieldSet.description,
          displayedFields: fieldSet.displayedFields ?? [],
          availableFields: fieldSet.availableFields ?? [],
        },
      };
    },
  },

  "sf/metadata.listObjects": {
    description:
      "List available Salesforce SObjects. Can filter by custom/standard and search by keyword.",
    inputSchema: z.object({
      filter: z
        .enum(["all", "custom", "standard"])
        .default("all")
        .describe("Filter by object type"),
      keyword: z
        .string()
        .optional()
        .describe("Optional keyword to filter object names"),
    }),
    handler: async (
      conn: Connection,
      params: { filter: "all" | "custom" | "standard"; keyword?: string }
    ): Promise<ToolResult> => {
      const globalDescribe = await conn.describeGlobal();

      let objects = globalDescribe.sobjects.map((obj) => ({
        name: obj.name,
        label: obj.label,
        labelPlural: obj.labelPlural,
        custom: obj.custom,
        queryable: obj.queryable,
        createable: obj.createable,
        keyPrefix: obj.keyPrefix,
      }));

      if (params.filter === "custom") {
        objects = objects.filter((o) => o.custom);
      } else if (params.filter === "standard") {
        objects = objects.filter((o) => !o.custom);
      }

      if (params.keyword) {
        const kw = params.keyword.toLowerCase();
        objects = objects.filter(
          (o) =>
            o.name.toLowerCase().includes(kw) ||
            o.label.toLowerCase().includes(kw)
        );
      }

      logger.info(
        { filter: params.filter, count: objects.length },
        "Objects listed"
      );

      return {
        status: "success",
        tool: "sf/metadata.listObjects",
        duration: 0,
        data: {
          totalCount: objects.length,
          objects,
        },
      };
    },
  },
};
