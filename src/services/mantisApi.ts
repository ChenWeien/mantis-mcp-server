import axios, { AxiosInstance, AxiosResponse } from "axios";
import { config } from "../config/index.js";
import { log } from "../utils/logger.js";

export interface Issue {
  id: string;
  summary: string;
  description: string;
  status: {
    id: number;
    name: string;
  };
  project: {
    id: number;
    name: string;
  };
  category: {
    id: number;
    name: string;
  };
  reporter: {
    id: number;
    name: string;
    email: string;
  };
  handler?: {
    id: number;
    name: string;
    email: string;
  };
  priority?: {
    id: number;
    name: string;
  };
  severity?: {
    id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

type ApiIssue = Omit<Issue, "id"> & { id: number | string };
type ApiIssueResponse =
  | ApiIssue
  | { issue: ApiIssue }
  | { issues: ApiIssue[] };
type IssueResponse = Issue | { issue: Issue } | { issues: Issue[] };

const formatIssue = (issue: ApiIssue): Issue => ({
  ...issue,
  id: String(issue.id).padStart(7, "0"),
});

const formatIssueResponse = (response: ApiIssueResponse): IssueResponse => {
  if ("issues" in response) {
    return { ...response, issues: response.issues.map(formatIssue) };
  }

  if ("issue" in response) {
    return { ...response, issue: formatIssue(response.issue) };
  }

  return formatIssue(response);
};

export interface IssueSearchParams {
  projectId?: number;
  statusId?: number;
  handlerId?: number;
  reporterId?: number;
  priority?: number;
  severity?: number;
  pageSize?: number;
  page?: number;
  search?: string;
  select?: string[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  real_name?: string;
  access_level?: {
    id: number;
    name: string;
  };
  enabled?: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  status: {
    id: number;
    name: string;
  };
}

export class MantisApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = "MantisApiError";
  }
}

export class MantisApi {
  private api: AxiosInstance;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  constructor() {
    if (!config.MANTIS_API_URL) {
      throw new Error("MANTIS_API_URL is required.");
    }

    this.api = axios.create({
      baseURL: config.MANTIS_API_URL,
      timeout: config.MANTIS_API_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        ...(config.MANTIS_API_KEY && { Authorization: config.MANTIS_API_KEY }),
        ...(config.MANTIS_API_KEY && { "X-API-KEY": config.MANTIS_API_KEY }),
        ...(config.MANTIS_API_KEY && { "X-MANTISBT-API-KEY": config.MANTIS_API_KEY }),
      },
      params: {
        ...(config.MANTIS_API_KEY && { access_token: config.MANTIS_API_KEY }),
        ...(config.MANTIS_API_KEY && { api_key: config.MANTIS_API_KEY }),
      },
    });

    log.info("Mantis API client initialized.", {
      baseURL: config.MANTIS_API_URL,
      timeout: config.MANTIS_API_TIMEOUT_MS,
      hasApiKey: Boolean(config.MANTIS_API_KEY),
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const errorMessage = `API error: ${error.response.status} ${error.response.statusText}`;
          log.error(errorMessage, {
            status: error.response.status,
            data: error.response.data,
            url: error.config?.url,
          });
          throw new MantisApiError(errorMessage, error.response.status, error.response.data);
        }

        if (error.request) {
          const errorMessage = "No response received from Mantis API.";
          log.error(errorMessage, {
            url: error.config?.url,
            method: error.config?.method,
          });
          throw new MantisApiError(errorMessage, 0);
        }

        const errorMessage = `Request error: ${error.message}`;
        log.error(errorMessage, {
          url: error.config?.url,
          error: error.message,
        });
        throw new MantisApiError(errorMessage);
      }
    );
  }

  async getUserByUsername(username: string): Promise<User> {
    const cacheKey = `user-${username}`;
    return this.cachedRequest<User>(cacheKey, () => {
      return this.api.get(`/users/username/${encodeURIComponent(username)}`);
    });
  }

  private async cachedRequest<T>(
    key: string,
    requestFn: () => Promise<AxiosResponse<T>>
  ): Promise<T> {
    if (config.CACHE_ENABLED) {
      const cachedData = this.cache.get(key);
      const now = Date.now();

      if (cachedData && now - cachedData.timestamp < config.CACHE_TTL_SECONDS * 1000) {
        log.debug("Returning cached Mantis API response.", {
          key,
          ageSeconds: (now - cachedData.timestamp) / 1000,
        });
        return cachedData.data as T;
      }
    }

    log.debug("Requesting Mantis API.", { key });
    const response = await requestFn();

    if (config.CACHE_ENABLED) {
      this.cache.set(key, {
        data: response.data,
        timestamp: Date.now(),
      });
      log.debug("Cached Mantis API response.", { key });
    }

    return response.data;
  }

  async getIssues(params: IssueSearchParams = {}): Promise<Issue[]> {
    log.info("Listing Mantis issues.", { params });

    let filter = "";
    if (params.projectId) filter += `&project_id=${params.projectId}`;
    if (params.statusId) filter += `&status_id=${params.statusId}`;
    if (params.handlerId) filter += `&handler_id=${params.handlerId}`;
    if (params.reporterId) filter += `&reporter_id=${params.reporterId}`;
    if (params.priority) filter += `&priority=${params.priority}`;
    if (params.severity) filter += `&severity=${params.severity}`;
    if (params.search) filter += `&search=${encodeURIComponent(params.search)}`;
    if (params.select?.length) filter += `&select=${params.select.join(",")}`;

    const pageSize = params.pageSize || 50;
    const page = params.page || 1;
    const cacheKey = `issues-${filter}-${page}-${pageSize}`;

    const response = await this.cachedRequest<{ issues: ApiIssue[] }>(cacheKey, () => {
      return this.api.get(`/issues?page=${page}&page_size=${pageSize}${filter}`);
    });

    return response.issues.map(formatIssue);
  }

  async getIssueById(issueId: number): Promise<{ issues: Issue[] }> {
    log.info("Getting Mantis issue.", { issueId });

    const response = await this.cachedRequest<{ issues: ApiIssue[] }>(`issue-${issueId}`, () => {
      return this.api.get(`/issues/${issueId}`);
    });

    return { ...response, issues: response.issues.map(formatIssue) };
  }

  async getCurrentUser(): Promise<User> {
    log.info("Getting current Mantis user.");

    return this.cachedRequest<User>("current-user", () => {
      return this.api.get("/users/me");
    });
  }

  async getUser(userId: number): Promise<User> {
    log.info("Getting Mantis user.", { userId });

    if (!userId) {
      throw new MantisApiError("A user ID is required.");
    }

    return this.cachedRequest<User>(`user-${userId}`, () => {
      return this.api.get(`/users/${userId}`);
    });
  }

  async getProjects(): Promise<Project[]> {
    log.info("Listing Mantis projects.");

    return this.cachedRequest<Project[]>("projects", () => {
      return this.api.get("/projects");
    });
  }

  async getUsersByProjectId(projectId: number): Promise<User[]> {
    log.info("Listing Mantis project users.", { projectId });

    return this.cachedRequest<User[]>(`users-by-project-${projectId}`, () => {
      return this.api.get(`/projects/${projectId}/users`);
    });
  }

  clearCache() {
    log.info("Clearing Mantis API cache.");
    this.cache.clear();
  }

  async createIssue(issueData: unknown): Promise<IssueResponse> {
    log.info("Creating Mantis issue.", { issueData });
    const response = await this.api.post<ApiIssueResponse>("/issues", issueData);
    this.clearCache();
    return formatIssueResponse(response.data);
  }

  async updateIssue(issueId: number, updateData: unknown): Promise<IssueResponse> {
    log.info("Updating Mantis issue.", { issueId, updateData });
    const response = await this.api.patch<ApiIssueResponse>(`/issues/${issueId}`, updateData);
    this.clearCache();
    return formatIssueResponse(response.data);
  }

  async addIssueNote(issueId: number, noteData: unknown): Promise<unknown> {
    log.info("Adding Mantis issue note.", { issueId, noteData });
    const response = await this.api.post(`/issues/${issueId}/notes`, noteData);
    this.clearCache();
    return response.data;
  }
}

export const mantisApi = new MantisApi();

export default mantisApi;
