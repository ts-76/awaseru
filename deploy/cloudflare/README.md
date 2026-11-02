# awaseru — Cloudflare template

This standalone directory deploys awaseru to your own Cloudflare account.
Use Node.js 26 (see .node-version), install dependencies with npm ci, then run npm run build.
Cloudflare's Deploy button provisions the DB binding and records its database ID in wrangler.json.
npm run deploy applies D1 migrations by binding name DB, then publishes the Worker.

After deployment, configure Cloudflare Access and the ACCESS_OWNER_EMAIL, ACCESS_TEAM_DOMAIN,
ACCESS_CREATE_AUD and ACCESS_MCP_AUD Worker secrets. Until all four are valid, creation and MCP
routes return HTTP 503. Existing response links remain accessible by design.

See [setup instructions](https://github.com/ts-76/awaseru/blob/main/docs/deploy-cloudflare.md)
and the [application README](https://github.com/ts-76/awaseru#readme).

This directory is generated. To maintain the original template, edit the main application in
[ts-76/awaseru](https://github.com/ts-76/awaseru), run npm run template:generate there,
and commit the generated changes. The standalone clone does not include that generator.
