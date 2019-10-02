import { execSync } from "child_process";
import { createReadStream, createWriteStream, readFileSync, fstat } from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import url from "url";
import archiver from "archiver";
import { google } from "googleapis";
import fetch from "node-fetch";
import rimraf from "rimraf";
import { buildOAuth2Client } from "./google-oauth2";
import {
  deleteRepository,
  getPaginatedRepositoriesFromOrganization
} from "./github";

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORGANIZATION = process.env.GITHUB_ORGANIZATION;
const GOOGLE_DRIVE_ID = process.env.GOOGLE_DRIVE_ID;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!GITHUB_USERNAME) {
  throw new TypeError("please set the env var GITHUB_USERNAME");
}

if (!GITHUB_TOKEN) {
  throw new TypeError("please set the env var GITHUB_TOKEN");
}

if (!GITHUB_ORGANIZATION) {
  throw new TypeError("please set the env var GITHUB_ORGANIZATION");
}

const GITHUB_REPOSITORY_PAGE_SIZE =
  Number(process.env.GITHUB_REPOSITORY_PAGE_SIZE) || 10;

const main = async () => {
  const prompt = createPrompt();
  const githubCredentials = { username: GITHUB_USERNAME, token: GITHUB_TOKEN };
  for await (const repository of getPaginatedRepositoriesFromOrganization(
    GITHUB_ORGANIZATION,
    {
      auth: githubCredentials,
      pageSize: GITHUB_REPOSITORY_PAGE_SIZE
    }
  )) {
    const response = await prompt(
      `What should I do with ${repository.name} (last pushed to on ${repository.pushedAt})? (A)rchive, (S)kip: `,
      ["A", "S"]
    );
    if (response === "S") {
      continue;
    }

    // Clone
    const cloneFolder = path.join(
      os.tmpdir(),
      `github-archiver-${repository.name}-${Date.now()}`
    );
    console.log("Cloning to", cloneFolder);
    const cloneUrl = addUserInfoToUrl(
      repository.url,
      GITHUB_USERNAME,
      GITHUB_TOKEN
    );
    execSync(`git clone ${cloneUrl} ${cloneFolder}`, {
      stdio: "ignore"
    });

    // Zip
    const zipName = `github-archive-${repository.name}.zip`;
    const zipPath = path.join(os.tmpdir(), zipName);
    console.log("Zipping to", zipPath);
    const archive = archiver("zip");
    archive.pipe(createWriteStream(zipPath));
    archive.directory(cloneFolder, repository.name);
    await archive.finalize();

    // Upload
    console.log(
      "Uploading to Google Drive",
      `(drive: ${GOOGLE_DRIVE_ID ||
        "My Drive"}, folder: ${GOOGLE_DRIVE_FOLDER_ID || "root"})`
    );
    const auth = await buildOAuth2Client([
      "https://www.googleapis.com/auth/drive.file"
    ]);
    const driveResponse = await google
      .drive({ auth, version: "v3" })
      .files.create({
        media: {
          mimeType: "application/octet-stream",
          body: createReadStream(zipPath)
        },
        fields: "id",
        supportsAllDrives: true,
        requestBody: {
          // driveId is ignored by the lib, I don't know why
          // the file always goes to My Drive
          driveId: GOOGLE_DRIVE_ID || undefined,
          parents: GOOGLE_DRIVE_FOLDER_ID ? [GOOGLE_DRIVE_FOLDER_ID] : [],
          name: zipName
        }
      });
    if (driveResponse.status !== 200) {
      throw new Error("error while uploading to Google Drive");
    }

    // Delete GitHub repo
    console.log("Deleting", repository.url);
    await deleteRepository(repository.owner.login, repository.name, {
      auth: githubCredentials
    });

    console.log("All done, cleaning up");
    rimraf.sync(cloneFolder);
    rimraf.sync(zipPath);
  }
};

const addUserInfoToUrl = (
  theUrl: string,
  username: string,
  password: string
) => {
  const parsedRepoUrl = url.parse(theUrl);
  // @ts-ignore
  parsedRepoUrl.username = username;
  // @ts-ignore
  parsedRepoUrl.password = password;
  return url.format(parsedRepoUrl);
};

const createPrompt = () => {
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const prompt = (question: string, hotkeys: string[]) => {
    return new Promise(resolve => {
      readlineInterface.question(question, answer => {
        if (hotkeys.includes(answer)) {
          resolve(answer);
        } else {
          resolve(prompt(question, hotkeys));
        }
      });
    });
  };
  return prompt;
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
