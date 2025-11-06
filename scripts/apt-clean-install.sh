#!/bin/bash
set -euo pipefail

if [ -z "$1" ]; then
  echo "Usage: apt-clean-install <package> [package2] ..." >&2
  exit 1
fi

apt-get update && \
  apt-get install -y --no-install-recommends "$@" && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
