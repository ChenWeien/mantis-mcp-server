import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gzip } from "zlib";
import { promisify } from "util";
import { z } from "zod";
import { isMantisConfigured } from "./config/index.js";
import mantisApi, { MantisApiError, User } from "./services/mantisApi.js";
import { customFieldsParamSchema, mergeCustomFieldsIntoPayload } from "./utils/customFields.js";
import { log } from "./utils/logger.js";

const gzipAsync = promisify(gzip);
const COMPRESSION_THRESHOLD = 1024 * 100;

interface LogData {
  tool: string;
  [key: string]: unknown;
}

type ToolResponse = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};

async function withMantisConfigured<T>(
  toolName: string,
  action: () => Promise<T>
): Promise<ToolResponse> {
  try {
    if (!isMantisConfigured()) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "Mantis API is not configured.",
                message: "Set MANTIS_API_URL and MANTIS_API_KEY before using this tool.",
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const result = await action();
    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    let errorMessage = `Tool ${toolName} failed.`;
    let logData: LogData = { tool: toolName };

    if (error instanceof MantisApiError) {
      errorMessage = `Mantis API error: ${error.message}`;
      if (error.statusCode) {
        errorMessage += ` (HTTP ${error.statusCode})`;
        logData = { ...logData, statusCode: error.statusCode };
      }
      log.error(errorMessage, { ...logData, error: error.message });
    } else if (error instanceof Error) {
      errorMessage = error.message;
      log.error(errorMessage, { ...logData, error: error.stack });
    } else {
      log.error(errorMessage, { ...logData, error });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

async function compressLargeJson(data: unknown): Promise<string> {
  const jsonString = JSON.stringify(data);
  if (jsonString.length < COMPRESSION_THRESHOLD) {
    return jsonString;
  }

  const compressed = await gzipAsync(Buffer.from(jsonString));
  const base64Data = compressed.toString("base64");

  return JSON.stringify({
    compressed: true,
    encoding: "gzip+base64",
    data: base64Data,
    originalSize: jsonString.length,
    compressedSize: base64Data.length,
  });
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mantis-mcp-server",
    version: "0.4.9",
  });

  server.tool(
    "get_issues",
    "List Mantis issues with optional filters.",
    {
      projectId: z.number().optional().describe("Project ID."),
      statusId: z.number().optional().describe("Status ID."),
      handlerId: z.number().optional().describe("Assigned user ID."),
      reporterId: z.number().optional().describe("Reporter user ID."),
      search: z.string().optional().describe("Search text."),
      pageSize: z.number().optional().default(20).describe("Number of issues per page."),
      page: z.number().optional().default(1).describe("Page number, starting at 1."),
      select: z.array(z.string()).optional().describe("Fields to return, such as id, summary, or description."),
    },
    async (params) => {
      return withMantisConfigured("get_issues", async () => {
        const issues = await mantisApi.getIssues(params);
        return compressLargeJson(issues);
      });
    }
  );

  const fetchIssuesForStats = async (params: {
    projectId?: number;
    statusId?: number;
    handlerId?: number;
    reporterId?: number;
    priority?: number;
    severity?: number;
    search?: string;
    period: "all" | "today" | "week" | "month";
    select?: string[];
  }) => {
    const pageSize = 100;
    let page = 1;
    const issues: any[] = [];

    while (true) {
      const result = await mantisApi.getIssues({
        projectId: params.projectId,
        statusId: params.statusId,
        handlerId: params.handlerId,
        reporterId: params.reporterId,
        priority: params.priority,
        severity: params.severity,
        search: params.search,
        select: params.select,
        page,
        pageSize,
      });

      issues.push(...result);

      if (result.length < pageSize) {
        break;
      }

      page += 1;
    }

    return issues;
  };

  server.tool(
    "get_issue_by_id",
    "Get a single Mantis issue by ID.",
    {
      issueId: z.number().describe("Issue ID."),
    },
    async ({ issueId }) => {
      return withMantisConfigured("get_issue_by_id", async () => {
        return mantisApi.getIssueById(issueId);
      });
    }
  );

  server.tool(
    "get_user",
    "Get a Mantis user by username.",
    {
      username: z.string().describe("Username."),
    },
    async ({ username }) => {
      return withMantisConfigured("get_user", async () => {
        return mantisApi.getUserByUsername(username);
      });
    }
  );

  server.tool("get_projects", "List Mantis projects.", {}, async () => {
    return withMantisConfigured("get_projects", async () => {
      return mantisApi.getProjects();
    });
  });

  server.tool(
    "get_issue_statistics",
    "Count Mantis issues grouped by status, priority, severity, handler, or reporter.",
    {
      projectId: z.number().optional().describe("Project ID."),
      groupBy: z.enum(["status", "priority", "severity", "handler", "reporter"]).describe("Field to group by."),
      period: z.enum(["all", "today", "week", "month"]).default("all").describe("Date range based on issue creation time."),
    },
      async (params) => {
      return withMantisConfigured("get_issue_statistics", async () => {
        const issues = await fetchIssuesForStats({
          projectId: params.projectId,
          period: params.period,
          select: ["id", "status", "priority", "severity", "handler", "reporter", "created_at"],
        });

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const filteredIssues = issues.filter((issue) => {
          if (params.period === "all") return true;
          const createdAt = new Date(issue.created_at);
          if (params.period === "today") return createdAt >= startOfDay;
          if (params.period === "week") return createdAt >= startOfWeek;
          return createdAt >= startOfMonth;
        });

        const data: Record<string, number> = {};
        for (const issue of filteredIssues) {
          const key =
            params.groupBy === "status"
              ? issue.status?.name || "unknown"
              : params.groupBy === "priority"
                ? issue.priority?.name || "unknown"
                : params.groupBy === "severity"
                  ? issue.severity?.name || "unknown"
                  : params.groupBy === "handler"
                    ? issue.handler?.name || "unassigned"
                    : issue.reporter?.name || "unknown";

          data[key] = (data[key] || 0) + 1;
        }

        return {
          total: filteredIssues.length,
          groupedBy: params.groupBy,
          period: params.period,
          data,
        };
      });
    }
  );

  server.tool(
    "get_assignment_statistics",
    "Count Mantis issues assigned to each user.",
    {
      projectId: z.number().optional().describe("Project ID."),
      includeUnassigned: z.boolean().default(true).describe("Include unassigned issues."),
      statusFilter: z.array(z.number()).optional().describe("Status IDs to include."),
    },
      async (params) => {
      return withMantisConfigured("get_assignment_statistics", async () => {
        const issues = await fetchIssuesForStats({
          projectId: params.projectId,
          period: "all",
          select: ["id", "status", "handler"],
        });

        const filteredIssues = params.statusFilter?.length
          ? issues.filter((issue) => params.statusFilter?.includes(issue.status.id))
          : issues;

        const userMap = new Map<
          number,
          {
            id: number;
            name: string;
            email: string;
            issueCount: number;
            openIssues: number;
            closedIssues: number;
            issues: string[];
          }
        >();

        const handlerIds = new Set<number>();
        for (const issue of filteredIssues) {
          if (issue.handler?.id) {
            handlerIds.add(issue.handler.id);
          }
        }

        for (const handlerId of handlerIds) {
          const user = await mantisApi.getUser(handlerId);
          userMap.set(user.id, {
            id: user.id,
            name: user.name,
            email: user.email || "",
            issueCount: 0,
            openIssues: 0,
            closedIssues: 0,
            issues: [],
          });
        }

        let unassignedCount = 0;
        const unassignedIssues: string[] = [];

        for (const issue of filteredIssues) {
          if (issue.handler?.id) {
            const userStat = userMap.get(issue.handler.id);
            if (!userStat) continue;

            userStat.issueCount++;
            userStat.issues.push(issue.id);

            const statusName = issue.status.name.toLowerCase();
            if (statusName.includes("closed") || statusName.includes("resolved")) {
              userStat.closedIssues++;
            } else {
              userStat.openIssues++;
            }
          } else if (params.includeUnassigned) {
            unassignedCount++;
            unassignedIssues.push(issue.id);
          }
        }

        const userStatistics = Array.from(userMap.values())
          .filter((stat) => stat.issueCount > 0)
          .sort((a, b) => b.issueCount - a.issueCount);

        if (params.includeUnassigned && unassignedCount > 0) {
          userStatistics.push({
            id: 0,
            name: "Unassigned",
            email: "",
            issueCount: unassignedCount,
            openIssues: unassignedCount,
            closedIssues: 0,
            issues: unassignedIssues,
          });
        }

        return {
          totalIssues: filteredIssues.length,
          assignedIssues: filteredIssues.length - unassignedCount,
          unassignedIssues: unassignedCount,
          userStatistics,
        };
      });
    }
  );

  server.tool(
    "get_users_by_project_id",
    "List users for a Mantis project.",
    {
      projectId: z.number().describe("Project ID."),
    },
    async ({ projectId }) => {
      return withMantisConfigured("get_users_by_project_id", async () => {
        return mantisApi.getUsersByProjectId(projectId);
      });
    }
  );

  server.tool("get_users", "Best-effort list of Mantis users.", {}, async () => {
    return withMantisConfigured("get_users", async () => {
      let notFoundCount = 0;
      let id = 1;
      const users: User[] = [];

      do {
        try {
          const user = await mantisApi.getUser(id);
          users.push(user);
          notFoundCount = 0;
        } catch (error) {
          if (error instanceof MantisApiError && error.statusCode === 404) {
            notFoundCount++;
          } else {
            throw error;
          }
        } finally {
          id++;
        }
      } while (notFoundCount < 10);

      return users;
    });
  });

  server.tool(
    "create_issue",
    "Create a Mantis issue.",
    {
      summary: z.string().describe("Issue summary."),
      description: z.string().describe("Issue description."),
      projectId: z.number().describe("Project ID."),
      categoryId: z.number().optional().describe("Category ID. Defaults to 1 when omitted."),
      handlerId: z.number().optional().describe("Assigned user ID."),
      priority: z.string().optional().describe("Priority name."),
      severity: z.string().optional().describe("Severity name."),
      additional_information: z.string().optional().describe("Additional information."),
      customFields: customFieldsParamSchema,
    },
    async (params) => {
      return withMantisConfigured("create_issue", async () => {
        const issueData: Record<string, unknown> = {
          summary: params.summary,
          description: params.description,
          project: { id: params.projectId },
          category: { id: params.categoryId || 1 },
          handler: params.handlerId ? { id: params.handlerId } : undefined,
          priority: params.priority ? { name: params.priority } : undefined,
          severity: params.severity ? { name: params.severity } : undefined,
          additional_information: params.additional_information,
        };
        mergeCustomFieldsIntoPayload(issueData, params.customFields);
        return mantisApi.createIssue(issueData);
      });
    }
  );

  server.tool(
    "update_issue",
    "Update a Mantis issue. Use versionId and versionAction to add or remove the issue from a target version (roadmap). Use customFields to write any Mantis custom field by name or ID.",
    {
      issueId: z.number().describe("Issue ID."),
      summary: z.string().optional().describe("Issue summary."),
      description: z.string().optional().describe("Issue description."),
      handlerId: z.number().optional().describe("Assigned user ID."),
      status: z.string().optional().describe("Status name."),
      resolution: z.string().optional().describe("Resolution name."),
      priority: z.string().optional().describe("Priority name."),
      severity: z.string().optional().describe("Severity name."),
      versionId: z
        .number()
        .optional()
        .describe("Mantis version ID (target version / roadmap). Required with versionAction."),
      versionAction: z
        .enum(["add", "remove"])
        .optional()
        .describe(
          'Add the issue to versionId, or remove it from that version. Defaults to "add" when versionId is set.'
        ),
      customFields: customFieldsParamSchema,
    },
    async (params) => {
      return withMantisConfigured("update_issue", async () => {
        if (params.versionAction !== undefined && params.versionId === undefined) {
          throw new Error("versionId is required when versionAction is set.");
        }

        const updateData: Record<string, unknown> = {
          summary: params.summary,
          description: params.description,
          handler: params.handlerId ? { id: params.handlerId } : undefined,
          status: params.status ? { name: params.status } : undefined,
          resolution: params.resolution ? { name: params.resolution } : undefined,
          priority: params.priority ? { name: params.priority } : undefined,
          severity: params.severity ? { name: params.severity } : undefined,
        };
        mergeCustomFieldsIntoPayload(updateData, params.customFields);

        if (params.versionId !== undefined) {
          const versionUpdate = await mantisApi.buildTargetVersionUpdate(
            params.issueId,
            params.versionId,
            params.versionAction ?? "add"
          );

          if (versionUpdate) {
            Object.assign(updateData, versionUpdate);
          } else if (
            !params.summary &&
            !params.description &&
            params.handlerId === undefined &&
            !params.status &&
            !params.resolution &&
            !params.priority &&
            !params.severity &&
            !params.customFields?.length
          ) {
            return mantisApi.getIssueById(params.issueId);
          }
        }

        const hasUpdate = Object.entries(updateData).some(
          ([key, value]) => value !== undefined && (key !== "custom_fields" || Array.isArray(value))
        );
        if (!hasUpdate) {
          throw new Error("No fields to update. Provide at least one issue or custom field change.");
        }

        return mantisApi.updateIssue(params.issueId, updateData);
      });
    }
  );

  server.tool(
    "add_issue_note",
    "Add a note to a Mantis issue.",
    {
      issueId: z.number().describe("Issue ID."),
      text: z.string().describe("Note text."),
      view_state: z.string().optional().default("public").describe("View state: public or private."),
    },
    async (params) => {
      return withMantisConfigured("add_issue_note", async () => {
        return mantisApi.addIssueNote(params.issueId, {
          text: params.text,
          view_state: { name: params.view_state },
        });
      });
    }
  );

  return server;
}
