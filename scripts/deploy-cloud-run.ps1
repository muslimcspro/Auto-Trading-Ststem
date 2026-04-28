param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [string]$ServiceName = "trading-system",
  [string]$Repository = "trading-system"
)

$ErrorActionPreference = "Stop"

gcloud config set project $ProjectId
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

$repoExists = gcloud artifacts repositories describe $Repository --location=$Region 2>$null
if (-not $repoExists) {
  gcloud artifacts repositories create $Repository `
    --repository-format=docker `
    --location=$Region `
    --description="Trading system container images"
}

$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/app:latest"

gcloud builds submit --tag $image .
gcloud run deploy $ServiceName `
  --image $image `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --memory 1Gi `
  --cpu 1 `
  --min-instances 1 `
  --set-env-vars NODE_ENV=production
