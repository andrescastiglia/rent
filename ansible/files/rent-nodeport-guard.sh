#!/usr/bin/env bash
# Kubernetes DNAT can bypass INPUT rules. Only host-local Nginx may use Rent's
# NodePorts; do not change firewall behavior for any other application or port.
set -euo pipefail
for command in iptables ip6tables; do
  rule=(! -i lo -p tcp -m multiport --dports 30080,30081 -m comment --comment rent-private-nodeports -j DROP)
  if ! "$command" -w 5 -t raw -C PREROUTING "${rule[@]}" 2>/dev/null; then
    "$command" -w 5 -t raw -I PREROUTING 1 "${rule[@]}"
  fi
done
