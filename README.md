# GitHub Archiver

A tool to backup unused private GitHub repos to Google Drive, then delete them.

## Getting started

- copy `.env.example` to `.env` and set the required values
- `npm start`

The program will ask, for each repository it finds, if you want to archive it or skip it. Answer with either `A` (for archive) or `S` (for skip).
The repositories are ordered by the time their were last pushed to, oldest first. `Ctrl-C` to exit the program.
