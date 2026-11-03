# The ZAP baseline scan CI runs (see .github/workflows/zap.yml), against an app on this machine.
# Start the stack first, for example from the repo root:
#   npm --prefix backend run db:up
#   npm --prefix backend run build; then: DEV_AUTH_ENABLED=true PORT=3001 node backend/dist/main
#   npm --prefix frontend run build; then: BACKEND_URL=http://localhost:3001 PORT=3000 node frontend/.next/standalone/server.js
# Then: .\scripts\zap.ps1
#
# The scan is passive (spider + passive rules); it sends no attack payloads. Reports land in
# the repo root as zap-report.{html,md,json} (git-ignored).
param(
    # host.docker.internal reaches the host machine from Docker Desktop (Windows/macOS).
    # On Linux run with: .\scripts\zap.ps1 -Target http://localhost:3000 -DockerNetworkHost
    [string]$Target = "http://host.docker.internal:3000",
    [int]$Minutes = 5,
    [switch]$DockerNetworkHost
)

$root = Split-Path -Parent $PSScriptRoot
$network = @()
if ($DockerNetworkHost) { $network = @("--network", "host") }

docker run --rm @network -v "${root}:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable `
    zap-baseline.py -t $Target -c .zap/rules.tsv -j -m $Minutes -I `
    -r zap-report.html -w zap-report.md -J zap-report.json
exit $LASTEXITCODE
