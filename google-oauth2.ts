// Taken from https://raw.githubusercontent.com/Zenika/google-apis-utils/master/build-oauth2-client.js

import { promises as fs } from "fs";
import readline from "readline";
import { google } from "googleapis";
import { OAuth2Client } from "googleapis-common";

/**
 * Returns an OAuth 2 client that can be used with Google APIs.
 *
 * This function is interactive and is meant to be used on a CLI.
 * It authenticate the client by generating an URL and displaying
 * it to the user, expecting them visit the URL to login into
 * a Google account and authorize the program to access their data.
 * Once the user is logged in, their are given a token to put
 * back into the CLI.
 *
 * This function caches the token in a file to avoid having to ask the user
 * for it on every call.
 *
 * This function requires a credentials.json file (the path can be changed
 * through the credentialsFilePath option). To obtain this file, you can
 * download it from a Google Cloud project that has an OAuth 2.0
 * client ID (look in the Credentials panel of the API section). If no
 * such client ID exist, create one of the "Other" type.
 *
 * @example
 *
 * const client = await buildOAuth2Client(["https://www.googleapis.com/auth/admin.directory.group.readonly"]);
 * google.admin({ version: "directory_v1", auth: client })
 *
 * @see the code was adapted from {@link https://developers.google.com/admin-sdk/directory/v1/quickstart/nodejs|the Node.js Quickstart for the Directory API}
 *
 * @param {string[]} scopes permissions to ask the user for
 * @param {Object} options
 * @param {string} [options.credentialsFilePath=credentials.json] path where to find the credentials file
 * @param {string} [options.tokenCachePath=token.json] path where the function can cache the token
 * @returns {Promise<OAuth2Client>}
 */
export const buildOAuth2Client = async (
  scopes: string[],
  {
    credentialsFilePath = "credentials.json",
    tokenCachePath = "token.json"
  }: { credentialsFilePath?: string; tokenCachePath?: string } = {}
) => {
  const { clientId, clientSecret, redirectUri } = await readCredentialsFile(
    credentialsFilePath
  );
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  const token = await cacheUsingJsonFile(
    () => acquireTokenUsingCliCode(oauth2Client, scopes),
    tokenCachePath
  );
  oauth2Client.credentials = token;
  return oauth2Client;
};

/**
 *
 * @param {string} path
 * @returns {Promise<{clientId: string, clientSecret: string, redirectUri: string}>}
 */
const readCredentialsFile = async (path: string) => {
  const content = await fs.readFile(path);
  const credentials = JSON.parse(content.toString());
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  return {
    clientId: client_id,
    clientSecret: client_secret,
    redirectUri: redirect_uris[0]
  };
};

/**
 *
 * @template T
 * @param {function(): T} fn
 * @param {string} path
 * @returns {Promise<T>}
 */
const cacheUsingJsonFile = async (fn: () => unknown, path: string) => {
  try {
    const content = await fs.readFile(path);
    const token = JSON.parse(content.toString());
    return token;
  } catch (err) {
    const result = await fn();
    try {
      await fs.writeFile(path, JSON.stringify(result));
    } catch (err) {
      console.warn("unable to write cache file", path, err);
    }
    return result;
  }
};

/**
 *
 * @param {OAuth2Client} oauth2Client
 * @param {string[]} scopes
 */
const acquireTokenUsingCliCode = async (
  oauth2Client: OAuth2Client,
  scopes: string[]
) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes
  });
  const code = await askForCodeThroughCli(authUrl);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

/**
 *
 * @param {string} authUrl
 * @returns {Promise<string>}
 */
const askForCodeThroughCli = async (authUrl: string) => {
  console.log("Authorize this app by visiting this url:", authUrl);
  const code = await askQuestionThroughCli(
    "Enter the code from that page here: "
  );
  return code;
};

/**
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
const askQuestionThroughCli = async (question: string): Promise<string> =>
  new Promise(resolve => {
    const cli = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    cli.question(question, response => {
      cli.close();
      resolve(response);
    });
  });
