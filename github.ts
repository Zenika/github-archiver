import { readFileSync } from "fs";
import fetch from "node-fetch";

const GET_PAGINATED_REPOSITORIES_FROM_ORGANIZATION_QUERY = readFileSync(
  "./find-unused-private-repos.graphql"
).toString();

export const getPaginatedRepositoriesFromOrganization = async function*(
  organizationLogin: string,
  { auth, pageSize }: GitHubApiCallOptions & { pageSize: number }
): AsyncGenerator<GitHubGraphQlApiRepository, any, undefined> {
  const authorizationHeader = buildBasicAuthorizationHeader(
    auth.username,
    auth.token
  );
  let atFirstPage = true;
  let cursor = "";
  while (atFirstPage || cursor) {
    const requestBody = {
      query: GET_PAGINATED_REPOSITORIES_FROM_ORGANIZATION_QUERY,
      variables: {
        organizationLogin,
        pageSize,
        cursor: cursor || undefined
      }
    };
    const response = await fetch("https://api.github.com/graphql", {
      headers: { Authorization: authorizationHeader },
      method: "POST",
      body: JSON.stringify(requestBody)
    });
    const json = (await response.json()) as GitHubGraphQlApiOrganizationQueryResponse;
    if (!response.ok) {
      throw new Error(JSON.stringify(json));
    }
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }
    const repos = json.data.organization.repositories.edges;
    yield* repos.map(repo => repo.node);
    cursor = repos[repos.length - 1].cursor;
    atFirstPage = false;
  }
};

export const deleteRepository = async (
  ownerLogin: string,
  name: string,
  { auth }: GitHubApiCallOptions
): Promise<void> => {
  const authorizationHeader = buildBasicAuthorizationHeader(
    auth.username,
    auth.token
  );
  const response = await fetch(
    `https://api.github.com/repos/${ownerLogin}/${name}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: authorizationHeader
      }
    }
  );
  if (!response.ok) {
    const errorPayload = await response.json();
    throw new Error(
      `error while trying to delete repo ${ownerLogin}/${name}: GitHub responded ${
        response.status
      }: ${JSON.stringify(errorPayload)}`
    );
  }
};

const buildBasicAuthorizationHeader = (
  username: string,
  password: string
): string => {
  const userInfoInBase64 = Buffer.from(`${username}:${password}`).toString(
    "base64"
  );
  return `Basic ${userInfoInBase64}`;
};

type GraphQlResponse<T> = {
  data: T;
  errors: any;
};

type GitHubGraphQlApiOrganizationQueryResponse = GraphQlResponse<{
  organization: GitHubGraphQlApiOrganization;
}>;

type GitHubGraphQlApiOrganization = {
  repositories: {
    edges: {
      cursor: string;
      node: GitHubGraphQlApiRepository;
    }[];
  };
};

type GitHubGraphQlApiRepository = {
  name: string;
  url: string;
  pushedAt: Date;
  owner: {
    login: string;
  };
};

type GitHubApiCallOptions = {
  auth: {
    username: string;
    token: string;
  };
};
