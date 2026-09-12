# Rent on oracle K3s

The production release builds ARM64 images in GitHub, validates native modules,
publishes immutable GHCR digests, completes the existing Android gate and runs
`ansible/deploy-kubernetes.yml`. No application builds run on oracle. The legacy
server archive remains attached for recovery; PM2 is not the Kubernetes runtime.

## Boundaries and persistence

Namespace `rent` owns one backend, frontend and RAG worker Deployment and one
PostgreSQL 17.9 StatefulSet with PostGIS 3.5.3 and pgvector 0.8.5. Nginx on the
host sends only Rent traffic to private NodePorts 30080/30081. Other namespaces,
PM2 applications, native databases, TLS and global cluster settings are outside
this deployment. PostgreSQL images are retained across application releases;
upgrades require a separately tested restore/upgrade operation.

The 20 GiB static local PV is `/srv/k3s/rent/postgresql`, affinity `oracle`, RWO,
reclaim policy Retain. StatefulSet PVC deletion/scaling retains the claim. This
capacity is a declaration, not a filesystem quota. The shared disk and node are
single points of failure. Never delete/reinitialize the PV to fix a pod startup.

Apps use mounted per-service dotenv Secrets, an internal PostgreSQL CA and
`DATABASE_SSL_MODE=verify-full`. URL ssl parameters are rejected because the pg
connection-string parser could override verification. The frontend gets only
public configuration and its New Relic ingest credentials. Administrative API
keys and R2 credentials are excluded from business containers. All containers
run non-root with read-only application filesystems and bounded writable tmp.

## First migration

1. Retrieve the five image digest artifacts from the successful main CI SHA;
   combine with `scripts/k8s/collect-images.py`. Run the Ansible playbook with
   `deploy_mode=stage`. It prepares TLS, isolated roles/database and suspended
   schedules, leaving existing HTTP services untouched.
2. Rehearse a custom-format dump restore into `rent_restore_drill` on the new
   PostgreSQL instance. Compare complete per-table row counts and SHA-256
   fingerprints using `scripts/k8s/fingerprint.py`. A fingerprint must be
   compared to the same frozen source snapshot; it is not a live backup check.
3. Record a successful rehearsal in `/etc/rent-kubernetes/rehearsal-verified`,
   then run `scripts/k8s/freeze-native.py --freeze` as root. This performs the
   following Rent-only actions and creates
   `/etc/rent-kubernetes/maintenance-active`. Save the Rent PM2 definitions,
   native crontab and source runtime with root-only access. Disable only Rent's
   cron lines; stop only rent-backend, rent-frontend and rent-rag-worker. Wait for
   active Rent jobs and database sessions to finish. Never stop the shared native
   PostgreSQL service or another application's process.
4. Take the final consistent dump and fingerprints, verify archive readability
   and upload encrypted to the Rent R2 repository. Restore only rent_db with the
   existing rent_user owner, without importing global roles from the host.
   Compare all table counts/hashes, including bytea files, and extensions.
5. Write the verified SHA to `/etc/rent-kubernetes/migration-ready`; tag that
   exact green main SHA. The release refuses first activation without this marker.
   It runs migrations once, starts HTTP services, checks readiness, switches
   Nginx, then starts the worker and unsuspends the 11 unique schedules.
6. Confirm external health, database-backed features, New Relic delivery and a
   Restic restore. Observe 24 hours including the first scheduled backup. Retain
   the previous database and stopped PM2 definitions for at least seven days.

The deployment installs an advisory-lock wrapper around scheduled/manual business
operations. It excludes two invocations of the same operation across all entry
points using these Jobs. CronJobs use Etc/UTC and Forbid; automatic retries are
disabled for business side effects. A skipped duplicate logs its operation name.
GitHub manual operations preserve both production-ops and production-release gates
and run the currently deployed image with an allowlisted command and dry-run flag.

## Backups and recovery

`database-backup` runs at 03:45 UTC daily. Restic encrypts dumps in the private R2
bucket rent-prod-backups, retains 14 daily / 8 weekly / 12 monthly snapshots and
checks repository integrity. Credentials are bucket-scoped and available only
to backup jobs. Recovery credentials are escrowed as `RENT_BACKUP_ENV` in the
protected production-release GitHub environment, independently of oracle.
Restore drills run on the 15th at 04:15 UTC against a disposable database.

Separate host backup automation must preserve the K3s snapshot, server token,
TLS CA and protected deployment configuration. etcd snapshots do not back up
PostgreSQL PVC contents. Use a matching K3s version when restoring etcd, or rebuild
Rent from manifests and restore the database if the rest of the shared cluster
is recovered independently. R2 is infrastructure-only: application PDF and image
storage remains PostgreSQL bytea.

Application failures restore the previous Kubernetes definitions and Secrets,
retaining all database writes. During the initial migration, before reopening
traffic, return to the old native DB/PM2/Nginx configuration if required. Once
new writes have been accepted, freeze Rent and copy the current PostgreSQL data
back before reactivating the old deployment; restoring an older dump loses data.
Never let both old and new workers or schedulers write simultaneously.

## Verification and monitoring

Readiness uses `/health` (database-dependent); liveness uses `/health/live` without
a database dependency. Nest awaits connection shutdown and telemetry flush. RAG
gets 120 seconds for termination. stdout/stderr replace unbounded batch log files.
New Relic traces continue directly over OTLP; frontend retains its native agent.
Dead localhost Pushgateway/Pyroscope destinations are disabled in container config.

Monitor pod failures/restarts, CronJob failures, last backup success, database
availability, disk usage and resource pressure during Android builds. Initial
namespace memory limit is 6 GiB; declared limits are not host reservations.

The host timer records the 24-hour observation in
`/var/lib/rent-kubernetes/observation.json`. A successful automatic database backup
within 24 hours and no failed platform checks are required for `verified`.
`configure-alerts.py` reconciles only the `Rent Kubernetes production` New Relic
policy: application/database availability, monitor signal loss (20 minutes),
failed tasks, backup age above 24 hours, disk use above 85%, and failed encrypted
backups or restore drills. Existing notification destinations are left intact.

Release assets distinguish `images.json` (images built for the source revision)
from `deployed-images.json` (actual running references, including the retained
PostgreSQL image). Recovery must use the latter.

Backup and restore Jobs allow up to 25 GiB of temporary disk for the declared
20 GiB database capacity; this is shared host disk, not a memory allocation.
Rent alert notifications use a dedicated workflow and channel connected to the
existing account owner email destination. Other applications’ workflows are unchanged.
