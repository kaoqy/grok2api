#!/bin/sh
set -eu

umask 077

quality_guard_dir=/var/lib/grok2api-quality-guard
mkdir -p "${quality_guard_dir}"
chown grok2api:grok2api "${quality_guard_dir}"
chmod 0700 "${quality_guard_dir}"

# /app/data is usually a bind mount, which replaces the image directory and
# its ownership. Make sure the unprivileged runtime user can still write the
# SQLite database and local media there.
data_dir=/app/data
mkdir -p "${data_dir}"
chown -R grok2api:grok2api "${data_dir}" 2>/dev/null || {
  echo "warning: cannot chown ${data_dir}; if the container cannot write its database, run 'chown -R 10001:10001 <host data dir>'" >&2
}
chmod 0750 "${data_dir}" 2>/dev/null || true

if [ ! -f "${GROK2API_CONFIG_SOURCE}" ]; then
  echo "missing config: ${GROK2API_CONFIG_SOURCE}" >&2
  echo "mount config.yaml to /run/grok2api/config.yaml" >&2
  exit 1
fi

cp "${GROK2API_CONFIG_SOURCE}" /app/config.yaml
chown grok2api:grok2api /app/config.yaml
chmod 0600 /app/config.yaml

exec gosu grok2api:grok2api "$@"
