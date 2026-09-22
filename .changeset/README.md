# Releases

Run `pnpm changeset` when a change should be released. Choose the version bump and describe the change for package users. Commit the generated Markdown file with the implementation. Tooling-only changes do not need a changeset.

After CI succeeds on `main`, the release job opens or updates a version PR. Review and merge that PR to publish the new version after CI succeeds again. Do not bump versions manually or publish from a feature branch.

Configure the `ECOSPARK_CLIENT_ID` Actions variable and the `ECOSPARK_APP_PRIVATE_KEY` Actions secret, either on this repository or through organization settings. Give the GitHub App access to this repository with contents and pull-request write permissions so its version PRs trigger CI.

Before the first release, add a GitHub Actions trusted publisher in the npm settings for `@sanity/diff-patch`:

- Organization: `sanity-io`
- Repository: `diff-patch`
- Workflow filename: `main.yml`
- Environment: leave blank

Publishing uses GitHub Actions OIDC and includes provenance. No npm publishing token is required. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for the npm-side setup.
